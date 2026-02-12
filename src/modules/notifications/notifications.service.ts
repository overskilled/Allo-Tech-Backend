import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  CreateNotificationDto,
  BulkNotificationDto,
  UpdatePreferencesDto,
  RegisterDeviceDto,
  QueryNotificationsDto,
} from './dto/notification.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';
import { NotificationType } from '@prisma/client';

// Notification templates for consistent messaging
const NOTIFICATION_TEMPLATES = {
  // Appointment notifications
  APPOINTMENT_CREATED: {
    title: 'New Appointment',
    body: (data: any) => `You have a new appointment scheduled for ${data.date}`,
  },
  APPOINTMENT_CONFIRMED: {
    title: 'Appointment Confirmed',
    body: (data: any) => `Your appointment on ${data.date} has been confirmed`,
  },
  APPOINTMENT_CANCELLED: {
    title: 'Appointment Cancelled',
    body: (data: any) => `Your appointment on ${data.date} has been cancelled`,
  },
  APPOINTMENT_REMINDER: {
    title: 'Appointment Reminder',
    body: (data: any) => `Reminder: You have an appointment ${data.timeUntil}`,
  },
  TECHNICIAN_STARTED: {
    title: 'Technician En Route',
    body: (data: any) => `${data.technicianName} is on the way to your location`,
  },
  TECHNICIAN_ARRIVED: {
    title: 'Technician Arrived',
    body: (data: any) => `${data.technicianName} has arrived at your location`,
  },

  // Candidature notifications
  NEW_CANDIDATURE: {
    title: 'New Application',
    body: (data: any) => `${data.technicianName} has applied to your request "${data.needTitle}"`,
  },
  CANDIDATURE_ACCEPTED: {
    title: 'Application Accepted',
    body: (data: any) => `Your application for "${data.needTitle}" has been accepted`,
  },
  CANDIDATURE_REJECTED: {
    title: 'Application Update',
    body: (data: any) => `Your application for "${data.needTitle}" was not selected`,
  },

  // Quotation notifications
  NEW_QUOTATION: {
    title: 'New Quotation',
    body: (data: any) => `You received a quotation for "${data.needTitle}"`,
  },
  QUOTATION_ACCEPTED: {
    title: 'Quotation Accepted',
    body: (data: any) => `Your quotation for "${data.needTitle}" has been accepted`,
  },
  QUOTATION_REJECTED: {
    title: 'Quotation Update',
    body: (data: any) => `Your quotation for "${data.needTitle}" was not accepted`,
  },

  // Message notifications
  NEW_MESSAGE: {
    title: 'New Message',
    body: (data: any) => `${data.senderName}: ${data.preview}`,
  },

  // Rating notifications
  NEW_RATING: {
    title: 'New Rating',
    body: (data: any) => `${data.clientName} rated your service ${data.score}/5`,
  },

  // Payment notifications
  PAYMENT_RECEIVED: {
    title: 'Payment Received',
    body: (data: any) => `Payment of ${data.amount} ${data.currency} received`,
  },
  PAYMENT_FAILED: {
    title: 'Payment Failed',
    body: (data: any) => `Payment of ${data.amount} ${data.currency} failed`,
  },
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private wsGateway: any; // Will be injected after initialization

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // Set gateway reference (called from module initialization)
  setGateway(gateway: any) {
    this.wsGateway = gateway;
  }

  // ==========================================
  // NOTIFICATION CRUD
  // ==========================================

  async createNotification(dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        data: dto.data ? JSON.stringify(dto.data) : null,
      },
    });

    // Send real-time notification via WebSocket
    this.sendRealtimeNotification(dto.userId, notification);

    // Send push notification
    await this.sendPushNotification(dto.userId, {
      title: dto.title,
      body: dto.body,
      data: dto.data,
    });

    return notification;
  }

  async createBulkNotifications(dto: BulkNotificationDto) {
    const notifications = await this.prisma.notification.createMany({
      data: dto.userIds.map((userId) => ({
        userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        data: dto.data ? JSON.stringify(dto.data) : null,
      })),
    });

    // Send real-time and push notifications in parallel
    await Promise.all(
      dto.userIds.map(async (userId) => {
        this.sendRealtimeNotification(userId, {
          type: dto.type,
          title: dto.title,
          body: dto.body,
          data: dto.data,
        });
        await this.sendPushNotification(userId, {
          title: dto.title,
          body: dto.body,
          data: dto.data,
        });
      }),
    );

    return { created: notifications.count };
  }

  async getNotifications(userId: string, query: QueryNotificationsDto) {
    const where: any = { userId };

    if (query.type) {
      where.type = query.type;
    }

    if (query.unreadOnly) {
      where.isRead = false;
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return createPaginatedResult(
      notifications.map((n) => ({
        ...n,
        data: n.data ? JSON.parse(n.data) : null,
      })),
      total,
      query,
    );
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });

    return { success: true };
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return { markedCount: result.count };
  }

  async deleteNotification(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    return { success: true };
  }

  async clearAllNotifications(userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: { userId },
    });

    return { deletedCount: result.count };
  }

  // ==========================================
  // STATISTICS
  // ==========================================

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    return { unreadCount: count };
  }

  async getUnreadCountByType(userId: string) {
    const counts = await this.prisma.notification.groupBy({
      by: ['type'],
      where: { userId, isRead: false },
      _count: { type: true },
    });

    const result: Record<string, number> = {};
    counts.forEach((item) => {
      result[item.type] = item._count.type;
    });

    return result;
  }

  // ==========================================
  // PUSH NOTIFICATION HELPERS
  // ==========================================

  private async sendPushNotification(
    userId: string,
    payload: { title: string; body: string; data?: any },
  ) {
    // Get user's device tokens
    // Note: This would require a DeviceToken model to be added to schema
    // For now, we'll just log the attempt

    const fcmServerKey = this.configService.get('FCM_SERVER_KEY');
    if (!fcmServerKey) {
      this.logger.debug('FCM not configured, skipping push notification');
      return;
    }

    // TODO: Implement actual FCM push notification
    // This would typically use the Firebase Admin SDK
    /*
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });

    if (tokens.length === 0) return;

    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
      tokens: tokens.map(t => t.token),
    };

    try {
      const response = await admin.messaging().sendMulticast(message);
      this.logger.debug(`Push sent: ${response.successCount} success, ${response.failureCount} failed`);
    } catch (error) {
      this.logger.error(`Push notification error: ${error.message}`);
    }
    */
  }

  private sendRealtimeNotification(userId: string, notification: any) {
    if (this.wsGateway) {
      this.wsGateway.sendToUser(userId, 'notification', {
        ...notification,
        data: typeof notification.data === 'string'
          ? JSON.parse(notification.data)
          : notification.data,
      });
    }
  }

  // ==========================================
  // NOTIFICATION HOOKS (for other services)
  // ==========================================

  async notifyAppointmentCreated(data: {
    clientId: string;
    technicianId: string;
    date: string;
    appointmentId: string;
  }) {
    // Notify technician
    await this.createNotification({
      userId: data.technicianId,
      type: 'APPOINTMENT',
      title: NOTIFICATION_TEMPLATES.APPOINTMENT_CREATED.title,
      body: NOTIFICATION_TEMPLATES.APPOINTMENT_CREATED.body({ date: data.date }),
      data: { appointmentId: data.appointmentId },
    });
  }

  async notifyAppointmentConfirmed(data: {
    clientId: string;
    technicianId: string;
    date: string;
    appointmentId: string;
  }) {
    await this.createNotification({
      userId: data.clientId,
      type: 'APPOINTMENT',
      title: NOTIFICATION_TEMPLATES.APPOINTMENT_CONFIRMED.title,
      body: NOTIFICATION_TEMPLATES.APPOINTMENT_CONFIRMED.body({ date: data.date }),
      data: { appointmentId: data.appointmentId },
    });
  }

  async notifyTechnicianStarted(data: {
    clientId: string;
    technicianName: string;
    appointmentId: string;
  }) {
    await this.createNotification({
      userId: data.clientId,
      type: 'APPOINTMENT',
      title: NOTIFICATION_TEMPLATES.TECHNICIAN_STARTED.title,
      body: NOTIFICATION_TEMPLATES.TECHNICIAN_STARTED.body({
        technicianName: data.technicianName,
      }),
      data: { appointmentId: data.appointmentId },
    });
  }

  async notifyNewCandidature(data: {
    clientId: string;
    technicianName: string;
    needTitle: string;
    needId: string;
    candidatureId: string;
  }) {
    await this.createNotification({
      userId: data.clientId,
      type: 'APPOINTMENT',
      title: NOTIFICATION_TEMPLATES.NEW_CANDIDATURE.title,
      body: NOTIFICATION_TEMPLATES.NEW_CANDIDATURE.body({
        technicianName: data.technicianName,
        needTitle: data.needTitle,
      }),
      data: { needId: data.needId, candidatureId: data.candidatureId },
    });
  }

  async notifyCandidatureResponse(data: {
    technicianId: string;
    needTitle: string;
    accepted: boolean;
    needId: string;
  }) {
    const template = data.accepted
      ? NOTIFICATION_TEMPLATES.CANDIDATURE_ACCEPTED
      : NOTIFICATION_TEMPLATES.CANDIDATURE_REJECTED;

    await this.createNotification({
      userId: data.technicianId,
      type: 'APPOINTMENT',
      title: template.title,
      body: template.body({ needTitle: data.needTitle }),
      data: { needId: data.needId },
    });
  }

  async notifyNewQuotation(data: {
    clientId: string;
    needTitle: string;
    needId: string;
    quotationId: string;
  }) {
    await this.createNotification({
      userId: data.clientId,
      type: 'QUOTATION',
      title: NOTIFICATION_TEMPLATES.NEW_QUOTATION.title,
      body: NOTIFICATION_TEMPLATES.NEW_QUOTATION.body({ needTitle: data.needTitle }),
      data: { needId: data.needId, quotationId: data.quotationId },
    });
  }

  async notifyNewMessage(data: {
    receiverId: string;
    senderName: string;
    preview: string;
    conversationId: string;
  }) {
    await this.createNotification({
      userId: data.receiverId,
      type: 'MESSAGE',
      title: NOTIFICATION_TEMPLATES.NEW_MESSAGE.title,
      body: NOTIFICATION_TEMPLATES.NEW_MESSAGE.body({
        senderName: data.senderName,
        preview: data.preview.substring(0, 50) + (data.preview.length > 50 ? '...' : ''),
      }),
      data: { conversationId: data.conversationId },
    });
  }

  async notifyNewRating(data: {
    technicianId: string;
    clientName: string;
    score: number;
    ratingId: string;
  }) {
    await this.createNotification({
      userId: data.technicianId,
      type: 'RATING',
      title: NOTIFICATION_TEMPLATES.NEW_RATING.title,
      body: NOTIFICATION_TEMPLATES.NEW_RATING.body({
        clientName: data.clientName,
        score: data.score,
      }),
      data: { ratingId: data.ratingId },
    });
  }

  async notifyPayment(data: {
    userId: string;
    amount: number;
    currency: string;
    success: boolean;
    paymentId: string;
  }) {
    const template = data.success
      ? NOTIFICATION_TEMPLATES.PAYMENT_RECEIVED
      : NOTIFICATION_TEMPLATES.PAYMENT_FAILED;

    await this.createNotification({
      userId: data.userId,
      type: 'PAYMENT',
      title: template.title,
      body: template.body({ amount: data.amount, currency: data.currency }),
      data: { paymentId: data.paymentId },
    });
  }

  // Aliases for compatibility
  async create(dto: CreateNotificationDto) {
    return this.createNotification(dto);
  }

  async notifyPaymentReceived(data: {
    userId: string;
    amount: number;
    currency: string;
    paymentId: string;
  }) {
    return this.notifyPayment({
      ...data,
      success: true,
    });
  }
}
