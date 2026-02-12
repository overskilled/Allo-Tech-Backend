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
import { Injectable, Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MessagingService } from '../modules/messaging/messaging.service';
import {
  WsMessagePayload,
  WsTypingPayload,
  WsMarkReadPayload,
} from '../modules/messaging/dto/messaging.dto';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  namespace: '/messaging',
  cors: {
    origin: '*',
    credentials: true,
  },
})
@Injectable()
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagingGateway.name);
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly messagingService: MessagingService
  ) {}

  // ==========================================
  // CONNECTION HANDLING
  // ==========================================

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Authenticate via token in query or auth header
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

      // Track socket for this user (supports multiple devices)
      if (!this.userSockets.has(client.userId)) {
        this.userSockets.set(client.userId, new Set());
      }
      this.userSockets.get(client.userId).add(client.id);

      // Join user's personal room for direct notifications
      client.join(`user:${client.userId}`);

      this.logger.log(`User ${client.userId} connected (socket: ${client.id})`);

      // Send unread count on connect
      const unreadCount = await this.messagingService.getUnreadCount(client.userId);
      client.emit('unread_count', unreadCount);
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
      this.logger.log(`User ${client.userId} disconnected (socket: ${client.id})`);
    }
  }

  // ==========================================
  // MESSAGE EVENTS
  // ==========================================

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() conversationId: string
  ) {
    if (!client.userId) return;

    // Verify user is participant
    try {
      await this.messagingService.getConversationWithDetails(conversationId, client.userId);
      client.join(`conversation:${conversationId}`);
      this.logger.debug(`User ${client.userId} joined conversation ${conversationId}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as any).message };
    }
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() conversationId: string
  ) {
    client.leave(`conversation:${conversationId}`);
    return { success: true };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: WsMessagePayload
  ) {
    if (!client.userId) return { success: false, error: 'Not authenticated' };

    try {
      const message = await this.messagingService.sendMessage(
        payload.conversationId,
        client.userId,
        {
          content: payload.content,
          imageUrl: payload.imageUrl,
        }
      );

      // Broadcast to all participants in the conversation
      this.server.to(`conversation:${payload.conversationId}`).emit('new_message', message);

      // Also notify the receiver directly (in case they're not in the conversation room)
      const conversation = await this.messagingService.getConversationWithDetails(
        payload.conversationId,
        client.userId
      );

      // Emit to receiver's personal room
      this.server.to(`user:${conversation.participant.id}`).emit('message_notification', {
        conversationId: payload.conversationId,
        message,
        sender: {
          id: client.userId,
        },
      });

      return { success: true, message };
    } catch (error) {
      return { success: false, error: (error as any).message };
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: WsTypingPayload
  ) {
    if (!client.userId) return;

    // Broadcast typing indicator to other participants
    client.to(`conversation:${payload.conversationId}`).emit('user_typing', {
      conversationId: payload.conversationId,
      userId: client.userId,
      isTyping: payload.isTyping,
    });
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: WsMarkReadPayload
  ) {
    if (!client.userId) return { success: false };

    try {
      const result = await this.messagingService.markMessagesAsRead(
        payload.conversationId,
        client.userId,
        payload.messageIds
      );

      // Notify sender that messages were read
      this.server.to(`conversation:${payload.conversationId}`).emit('messages_read', {
        conversationId: payload.conversationId,
        messageIds: payload.messageIds,
        readBy: client.userId,
        readAt: new Date(),
      });

      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: (error as any).message };
    }
  }

  // ==========================================
  // UTILITY METHODS (for use by other services)
  // ==========================================

  /**
   * Send a notification to a specific user
   */
  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Broadcast to a conversation
   */
  broadcastToConversation(conversationId: string, event: string, data: any) {
    this.server.to(`conversation:${conversationId}`).emit(event, data);
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId).size > 0;
  }

  /**
   * Get online users from a list
   */
  getOnlineUsers(userIds: string[]): string[] {
    return userIds.filter((id) => this.isUserOnline(id));
  }
}
