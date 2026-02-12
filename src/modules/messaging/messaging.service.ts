import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateConversationDto,
  SendMessageDto,
  QueryConversationsDto,
  QueryMessagesDto,
} from './dto/messaging.dto';
import { createPaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // CONVERSATION OPERATIONS
  // ==========================================

  async createOrGetConversation(userId: string, dto: CreateConversationDto) {
    // Verify participant exists
    const participant = await this.prisma.user.findUnique({
      where: { id: dto.participantId },
      select: { id: true, firstName: true, lastName: true, profileImage: true },
    });

    if (!participant) {
      throw new NotFoundException('User not found');
    }

    if (dto.participantId === userId) {
      throw new BadRequestException('Cannot create conversation with yourself');
    }

    // Check for existing conversation between these users
    // participantIds is stored as JSON array
    const existingConversations = await this.prisma.conversation.findMany({
      where: {
        OR: [
          { participantIds: { contains: `"${userId}"` } },
        ],
      },
    });

    // Find conversation that contains both users
    const existing = existingConversations.find((conv) => {
      const participants = JSON.parse(conv.participantIds);
      return participants.includes(userId) && participants.includes(dto.participantId);
    });

    if (existing) {
      return this.getConversationWithDetails(existing.id, userId);
    }

    // Create new conversation
    const conversation = await this.prisma.conversation.create({
      data: {
        participantIds: JSON.stringify([userId, dto.participantId]),
      },
    });

    // Send initial message if provided
    if (dto.initialMessage) {
      await this.sendMessage(conversation.id, userId, {
        content: dto.initialMessage,
      });
    }

    return this.getConversationWithDetails(conversation.id, userId);
  }

  async getConversations(userId: string, query: QueryConversationsDto) {
    // Get all conversations where user is a participant
    const allConversations = await this.prisma.conversation.findMany({
      where: {
        participantIds: { contains: `"${userId}"` },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Get conversation details with last message and unread count
    const conversationsWithDetails = await Promise.all(
      allConversations.map(async (conv) => {
        const participants = JSON.parse(conv.participantIds) as string[];
        const otherUserId = participants.find((p) => p !== userId);

        const [otherUser, lastMessage, unreadCount] = await Promise.all([
          this.prisma.user.findUnique({
            where: { id: otherUserId },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
              role: true,
              technicianProfile: {
                select: { profession: true, isVerified: true },
              },
            },
          }),
          this.prisma.message.findFirst({
            where: { conversationId: conv.id },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              content: true,
              imageUrl: true,
              senderId: true,
              createdAt: true,
              isRead: true,
            },
          }),
          this.prisma.message.count({
            where: {
              conversationId: conv.id,
              receiverId: userId,
              isRead: false,
            },
          }),
        ]);

        return {
          id: conv.id,
          participant: otherUser,
          lastMessage,
          unreadCount,
          lastMessageAt: conv.lastMessageAt,
          createdAt: conv.createdAt,
        };
      }),
    );

    // Filter unread only if requested
    let filtered = conversationsWithDetails;
    if (query.unreadOnly) {
      filtered = conversationsWithDetails.filter((c) => c.unreadCount > 0);
    }

    // Apply pagination
    const total = filtered.length;
    const paginated = filtered.slice(query.skip, query.skip + query.take);

    return createPaginatedResult(paginated, total, query);
  }

  async getConversationWithDetails(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const participants = JSON.parse(conversation.participantIds) as string[];
    if (!participants.includes(userId)) {
      throw new ForbiddenException('Not a participant in this conversation');
    }

    const otherUserId = participants.find((p) => p !== userId);

    const [otherUser, unreadCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: otherUserId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profileImage: true,
          phone: true,
          role: true,
          technicianProfile: {
            select: { profession: true, isVerified: true, avgRating: true },
          },
        },
      }),
      this.prisma.message.count({
        where: {
          conversationId,
          receiverId: userId,
          isRead: false,
        },
      }),
    ]);

    return {
      id: conversation.id,
      participant: otherUser,
      unreadCount,
      createdAt: conversation.createdAt,
    };
  }

  async deleteConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const participants = JSON.parse(conversation.participantIds) as string[];
    if (!participants.includes(userId)) {
      throw new ForbiddenException('Not a participant in this conversation');
    }

    // Delete all messages and the conversation
    await this.prisma.$transaction([
      this.prisma.message.deleteMany({ where: { conversationId } }),
      this.prisma.conversation.delete({ where: { id: conversationId } }),
    ]);

    return { message: 'Conversation deleted successfully' };
  }

  // ==========================================
  // MESSAGE OPERATIONS
  // ==========================================

  async sendMessage(conversationId: string, senderId: string, dto: SendMessageDto) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const participants = JSON.parse(conversation.participantIds) as string[];
    if (!participants.includes(senderId)) {
      throw new ForbiddenException('Not a participant in this conversation');
    }

    const receiverId = participants.find((p) => p !== senderId);

    // Create message and update conversation in a transaction
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          senderId,
          receiverId,
          content: dto.content,
          imageUrl: dto.imageUrl,
        },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
            },
          },
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return message;
  }

  async getMessages(conversationId: string, userId: string, query: QueryMessagesDto) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const participants = JSON.parse(conversation.participantIds) as string[];
    if (!participants.includes(userId)) {
      throw new ForbiddenException('Not a participant in this conversation');
    }

    const where: any = { conversationId };

    // Cursor-based pagination for efficiency
    if (query.before) {
      const beforeMessage = await this.prisma.message.findUnique({
        where: { id: query.before },
        select: { createdAt: true },
      });
      if (beforeMessage) {
        where.createdAt = { lt: beforeMessage.createdAt };
      }
    }

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
            },
          },
        },
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);

    // Return messages in chronological order
    return {
      data: messages.reverse(),
      total,
      hasMore: messages.length === query.take,
    };
  }

  async markMessagesAsRead(
    conversationId: string,
    userId: string,
    messageIds: string[],
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const participants = JSON.parse(conversation.participantIds) as string[];
    if (!participants.includes(userId)) {
      throw new ForbiddenException('Not a participant in this conversation');
    }

    // Only mark messages where user is the receiver
    const result = await this.prisma.message.updateMany({
      where: {
        id: { in: messageIds },
        conversationId,
        receiverId: userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { markedCount: result.count };
  }

  async markAllAsRead(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const participants = JSON.parse(conversation.participantIds) as string[];
    if (!participants.includes(userId)) {
      throw new ForbiddenException('Not a participant in this conversation');
    }

    const result = await this.prisma.message.updateMany({
      where: {
        conversationId,
        receiverId: userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { markedCount: result.count };
  }

  // ==========================================
  // STATISTICS
  // ==========================================

  async getUnreadCount(userId: string) {
    const count = await this.prisma.message.count({
      where: {
        receiverId: userId,
        isRead: false,
      },
    });

    return { unreadCount: count };
  }

  async getConversationUnreadCount(conversationId: string, userId: string) {
    const count = await this.prisma.message.count({
      where: {
        conversationId,
        receiverId: userId,
        isRead: false,
      },
    });

    return { unreadCount: count };
  }
}
