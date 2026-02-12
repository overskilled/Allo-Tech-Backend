import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../modules/notifications/notifications.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: '*',
    credentials: true,
  },
})
@Injectable()
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService
  ) {}

  onModuleInit() {
    // Register this gateway with the notifications service
    this.notificationsService.setGateway(this);
  }

  // ==========================================
  // CONNECTION HANDLING
  // ==========================================

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        (client.handshake.query.token as string) ||
        client.handshake.auth?.token ||
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
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

      this.logger.log(`User ${client.userId} connected to notifications (socket: ${client.id})`);

      // Send unread counts on connect
      const [unreadCount, unreadByType] = await Promise.all([
        this.notificationsService.getUnreadCount(client.userId),
        this.notificationsService.getUnreadCountByType(client.userId),
      ]);

      client.emit('initial_counts', {
        total: unreadCount.unreadCount,
        byType: unreadByType,
      });
    } catch (error) {
      this.logger.error(`Authentication failed for client ${client.id}: ${(error as any).message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const userSocketSet = this.userSockets.get(client.userId);
      if (userSocketSet) {
        userSocketSet.delete(client.id);
        if (userSocketSet.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }
      this.logger.log(
        `User ${client.userId} disconnected from notifications (socket: ${client.id})`
      );
    }
  }

  // ==========================================
  // NOTIFICATION EVENTS
  // ==========================================

  @SubscribeMessage('mark_read')
  async handleMarkRead(@ConnectedSocket() client: AuthenticatedSocket, notificationId: string) {
    if (!client.userId) return { success: false };

    try {
      await this.notificationsService.markAsRead(notificationId, client.userId);

      // Update counts for all user's devices
      const [unreadCount, unreadByType] = await Promise.all([
        this.notificationsService.getUnreadCount(client.userId),
        this.notificationsService.getUnreadCountByType(client.userId),
      ]);

      this.server.to(`user:${client.userId}`).emit('counts_updated', {
        total: unreadCount.unreadCount,
        byType: unreadByType,
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as any).message };
    }
  }

  @SubscribeMessage('mark_all_read')
  async handleMarkAllRead(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) return { success: false };

    try {
      await this.notificationsService.markAllAsRead(client.userId);

      this.server.to(`user:${client.userId}`).emit('counts_updated', {
        total: 0,
        byType: {},
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as any).message };
    }
  }

  // ==========================================
  // UTILITY METHODS (for NotificationsService)
  // ==========================================

  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  broadcastToUsers(userIds: string[], event: string, data: any) {
    userIds.forEach((userId) => {
      this.server.to(`user:${userId}`).emit(event, data);
    });
  }

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId).size > 0;
  }
}
