import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface AuthSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  namespace: '/tracking',
  cors: { origin: '*', credentials: true },
})
@Injectable()
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TrackingGateway.name);
  private userSockets: Map<string, Set<string>> = new Map();
  /** Last known GPS position per missionId — in-memory cache (cleared on restart). */
  private missionLocations: Map<string, { lat: number; lng: number; updatedAt: Date }> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ==========================================
  // CONNECTION HANDLING
  // ==========================================

  async handleConnection(client: AuthSocket) {
    try {
      const token =
        (client.handshake.query.token as string) ||
        client.handshake.auth?.token ||
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Tracking: socket ${client.id} rejected — no token provided`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET', 'your-secret-key'),
      });

      client.userId = payload.sub;

      if (!this.userSockets.has(client.userId)) {
        this.userSockets.set(client.userId, new Set());
      }
      this.userSockets.get(client.userId).add(client.id);

      client.join(`user:${client.userId}`);
      this.logger.log(`Tracking: user ${client.userId} connected (socket: ${client.id})`);
    } catch (err: any) {
      this.logger.warn(`Tracking: socket ${client.id} rejected — JWT error: ${err?.message ?? err}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthSocket) {
    if (client.userId) {
      const sockets = this.userSockets.get(client.userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.userSockets.delete(client.userId);
      }
    }
    this.logger.log(`Tracking: socket ${client.id} disconnected`);
  }

  // ==========================================
  // CLIENT WATCHES TECHNICIAN
  // ==========================================

  @SubscribeMessage('watch_appointment')
  async handleWatch(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() appointmentId: string,
  ) {
    if (!client.userId) return { success: false, error: 'Not authenticated' };

    // Verify requester is client or technician of this appointment
    const appt = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        OR: [{ clientId: client.userId }, { technicianId: client.userId }],
      },
    });

    if (!appt) return { success: false, error: 'Not authorized' };

    client.join(`appointment:${appointmentId}`);
    this.logger.debug(`User ${client.userId} watching appointment:${appointmentId}`);

    // Immediately return last known position so the map renders on connect/reconnect
    return {
      success: true,
      location: {
        lat: appt.technicianCurrentLat ?? null,
        lng: appt.technicianCurrentLng ?? null,
        updatedAt: appt.technicianCurrentUpdatedAt?.toISOString() ?? null,
        clientLat: appt.latitude ?? null,
        clientLng: appt.longitude ?? null,
        address: appt.address ?? null,
        status: appt.status,
      },
    };
  }

  @SubscribeMessage('unwatch_appointment')
  handleUnwatch(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() appointmentId: string,
  ) {
    client.leave(`appointment:${appointmentId}`);
    return { success: true };
  }

  // ==========================================
  // TECHNICIAN PUSHES LOCATION
  // ==========================================

  @SubscribeMessage('update_location')
  async handleUpdateLocation(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() payload: { appointmentId?: string; missionId?: string; lat: number; lng: number },
  ) {
    if (!client.userId) return { success: false, error: 'Not authenticated' };

    const { appointmentId, missionId, lat, lng } = payload;
    const now = new Date();

    // ── Appointment-based tracking (persists coords to DB) ──────────────────
    if (appointmentId) {
      const appt = await this.prisma.appointment.findFirst({
        where: { id: appointmentId, technicianId: client.userId },
      });
      if (!appt) return { success: false, error: 'Not authorized' };
      if (!['CONFIRMED', 'STARTED', 'ARRIVED', 'IN_PROGRESS'].includes(appt.status)) {
        return { success: false, error: 'Appointment not active' };
      }
      await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: { technicianCurrentLat: lat, technicianCurrentLng: lng, technicianCurrentUpdatedAt: now },
      });
      this.server.to(`appointment:${appointmentId}`).emit('tech_location', {
        appointmentId, lat, lng, updatedAt: now.toISOString(),
      });
      return { success: true };
    }

    // ── Mission-based tracking (live broadcast + in-memory cache) ───────────
    if (missionId) {
      const mission = await this.prisma.mission.findFirst({
        where: { id: missionId, technicianId: client.userId },
      });
      if (!mission) return { success: false, error: 'Not authorized' };
      if (!['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'PENDING_VALIDATION'].includes(mission.status)) {
        return { success: false, error: 'Mission not active' };
      }
      // Cache so clients who connect after the last broadcast still get a position immediately
      this.missionLocations.set(missionId, { lat, lng, updatedAt: now });
      this.server.to(`mission:${missionId}`).emit('tech_location', {
        missionId, lat, lng, updatedAt: now.toISOString(),
      });
      return { success: true };
    }

    return { success: false, error: 'appointmentId or missionId required' };
  }

  // ==========================================
  // CLIENT WATCHES MISSION (no appointment)
  // ==========================================

  @SubscribeMessage('watch_mission')
  async handleWatchMission(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() missionId: string,
  ) {
    if (!client.userId) return { success: false, error: 'Not authenticated' };

    const mission = await this.prisma.mission.findFirst({
      where: {
        id: missionId,
        OR: [{ clientId: client.userId }, { technicianId: client.userId }],
      },
    });

    if (!mission) return { success: false, error: 'Not authorized' };

    client.join(`mission:${missionId}`);
    this.logger.debug(`User ${client.userId} watching mission:${missionId}`);

    // Return last cached position (if any) so the map renders immediately on reconnect
    const cached = this.missionLocations.get(missionId);
    return {
      success: true,
      location: {
        lat: cached?.lat ?? null,
        lng: cached?.lng ?? null,
        updatedAt: cached?.updatedAt?.toISOString() ?? null,
        clientLat: mission.latitude ?? null,
        clientLng: mission.longitude ?? null,
        address: mission.address ?? null,
      },
    };
  }

  @SubscribeMessage('unwatch_mission')
  handleUnwatchMission(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() missionId: string,
  ) {
    client.leave(`mission:${missionId}`);
    return { success: true };
  }
}
