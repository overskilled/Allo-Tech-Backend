    import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { MessagingService } from './messaging.service';
import {
  CreateConversationDto,
  SendMessageDto,
  MarkMessagesReadDto,
  QueryConversationsDto,
  QueryMessagesDto,
} from './dto/messaging.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Messaging')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'messaging', version: '1' })
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  // ==========================================
  // CONVERSATION ENDPOINTS
  // ==========================================

  @Post('conversations')
  @ApiOperation({ summary: 'Create or get existing conversation with a user' })
  @ApiResponse({ status: 201, description: 'Conversation created or retrieved' })
  async createConversation(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messagingService.createOrGetConversation(userId, dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Get all conversations' })
  @ApiResponse({ status: 200, description: 'Conversations list' })
  async getConversations(
    @CurrentUser('id') userId: string,
    @Query() query: QueryConversationsDto,
  ) {
    return this.messagingService.getConversations(userId, query);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get conversation details' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'Conversation details' })
  async getConversation(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagingService.getConversationWithDetails(id, userId);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'Conversation deleted' })
  async deleteConversation(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagingService.deleteConversation(id, userId);
  }

  // ==========================================
  // MESSAGE ENDPOINTS
  // ==========================================

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message in a conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 201, description: 'Message sent' })
  async sendMessage(
    @Param('id') conversationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagingService.sendMessage(conversationId, userId, dto);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages in a conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'Messages list' })
  async getMessages(
    @Param('id') conversationId: string,
    @CurrentUser('id') userId: string,
    @Query() query: QueryMessagesDto,
  ) {
    return this.messagingService.getMessages(conversationId, userId, query);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark specific messages as read' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'Messages marked as read' })
  async markMessagesRead(
    @Param('id') conversationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: MarkMessagesReadDto,
  ) {
    return this.messagingService.markMessagesAsRead(
      conversationId,
      userId,
      dto.messageIds,
    );
  }

  @Post('conversations/:id/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all messages in conversation as read' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'All messages marked as read' })
  async markAllRead(
    @Param('id') conversationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagingService.markAllAsRead(conversationId, userId);
  }

  // ==========================================
  // STATISTICS ENDPOINTS
  // ==========================================

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread message count' })
  @ApiResponse({ status: 200, description: 'Unread count' })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    return this.messagingService.getUnreadCount(userId);
  }
}
