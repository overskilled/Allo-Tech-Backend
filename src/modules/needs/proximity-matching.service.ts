import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProximityMatchingService {
  private readonly logger = new Logger(ProximityMatchingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a proximity broadcast when a need is created with valid coordinates.
   */
  async createBroadcast(needId: string) {
    const need = await this.prisma.need.findUnique({
      where: { id: needId },
    });

    if (!need || !need.latitude || !need.longitude) {
      return null;
    }

    return this.prisma.needProximityBroadcast.create({
      data: {
        needId,
        currentRadius: 5,
        maxRadius: 30,
        expandEvery: 20,
        isActive: true,
        notifiedTechnicianIds: '[]',
      },
    });
  }

  /**
   * Deactivate broadcast when need leaves OPEN status.
   */
  async deactivateBroadcast(needId: string) {
    await this.prisma.needProximityBroadcast.updateMany({
      where: { needId, isActive: true },
      data: { isActive: false },
    });
  }

  /**
   * Process all active broadcasts: find nearby technicians and notify them.
   * Called by the scheduler every 5 minutes.
   */
  async processActiveBroadcasts() {
    const broadcasts = await this.prisma.needProximityBroadcast.findMany({
      where: { isActive: true },
      include: {
        need: {
          select: {
            id: true,
            title: true,
            latitude: true,
            longitude: true,
            status: true,
            clientId: true,
            category: { select: { name: true } },
          },
        },
      },
    });

    for (const broadcast of broadcasts) {
      try {
        await this.processBroadcast(broadcast);
      } catch (error: any) {
        this.logger.error(
          `Error processing broadcast ${broadcast.id}: ${error?.message}`,
        );
      }
    }
  }

  private async processBroadcast(broadcast: any) {
    const { need } = broadcast;

    // Deactivate if need is no longer OPEN
    if (need.status !== 'OPEN') {
      await this.prisma.needProximityBroadcast.update({
        where: { id: broadcast.id },
        data: { isActive: false },
      });
      return;
    }

    // Check if it's time to expand
    const now = new Date();
    const lastExpanded = new Date(broadcast.lastExpandedAt);
    const minutesSinceExpand = (now.getTime() - lastExpanded.getTime()) / (1000 * 60);

    if (minutesSinceExpand < broadcast.expandEvery) {
      return; // Not time to expand yet
    }

    const alreadyNotified: string[] = JSON.parse(broadcast.notifiedTechnicianIds || '[]');

    // Find technicians within current radius
    const technicians = await this.prisma.user.findMany({
      where: {
        role: 'TECHNICIAN',
        status: 'ACTIVE',
        technicianProfile: {
          isAvailable: true,
          latitude: { not: null },
          longitude: { not: null },
        },
      },
      include: {
        technicianProfile: {
          select: { latitude: true, longitude: true },
        },
      },
    });

    const newTechnicians = technicians.filter((tech) => {
      if (alreadyNotified.includes(tech.id)) return false;
      if (tech.id === need.clientId) return false;

      const lat = tech.technicianProfile?.latitude;
      const lng = tech.technicianProfile?.longitude;
      if (!lat || !lng || !need.latitude || !need.longitude) return false;

      const distance = this.calculateDistance(
        need.latitude,
        need.longitude,
        lat,
        lng,
      );

      return distance <= broadcast.currentRadius;
    });

    // Notify new technicians
    if (newTechnicians.length > 0) {
      const notifications = newTechnicians.map((tech) => ({
        userId: tech.id,
        type: 'PROXIMITY_MATCH' as const,
        title: 'Nouveau besoin à proximité',
        body: `"${need.title}" (${need.category?.name || 'Service'}) - à moins de ${broadcast.currentRadius}km`,
        data: JSON.stringify({
          needId: need.id,
          radius: broadcast.currentRadius,
        }),
      }));

      await this.prisma.notification.createMany({
        data: notifications,
      });

      // Update notified list
      const updatedNotified = [...alreadyNotified, ...newTechnicians.map((t) => t.id)];
      await this.prisma.needProximityBroadcast.update({
        where: { id: broadcast.id },
        data: {
          notifiedTechnicianIds: JSON.stringify(updatedNotified),
          lastExpandedAt: now,
        },
      });

      this.logger.log(
        `Broadcast ${broadcast.id}: Notified ${newTechnicians.length} technicians at ${broadcast.currentRadius}km`,
      );
    }

    // Expand radius if no candidatures yet
    const candidatureCount = await this.prisma.candidature.count({
      where: { needId: need.id },
    });

    if (candidatureCount === 0 && newTechnicians.length === 0) {
      const newRadius = broadcast.currentRadius + 5;

      if (newRadius > broadcast.maxRadius) {
        await this.prisma.needProximityBroadcast.update({
          where: { id: broadcast.id },
          data: { isActive: false },
        });
        this.logger.log(`Broadcast ${broadcast.id}: Max radius reached, deactivated`);
      } else {
        await this.prisma.needProximityBroadcast.update({
          where: { id: broadcast.id },
          data: {
            currentRadius: newRadius,
            lastExpandedAt: now,
          },
        });
        this.logger.log(
          `Broadcast ${broadcast.id}: Expanded radius to ${newRadius}km`,
        );
      }
    }
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
