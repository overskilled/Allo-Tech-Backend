import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateConversationDto {
  @ApiProperty({ description: 'User ID to start conversation with' })
  @IsString()
  participantId: string;

  @ApiPropertyOptional({ description: 'Initial message content' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  initialMessage?: string;
}

export class SendMessageDto {
  @ApiProperty({ description: 'Message content' })
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ description: 'Message type', enum: ['text', 'image', 'document', 'voice'] })
  @IsOptional()
  @IsString()
  messageType?: string;

  @ApiPropertyOptional({ description: 'Image URL if sending an image' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'File URL for document or voice' })
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional({ description: 'Original file name' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileName?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsOptional()
  @IsNumber()
  fileSize?: number;

  @ApiPropertyOptional({ description: 'Voice message duration in seconds' })
  @IsOptional()
  @IsNumber()
  duration?: number;
}

export class MarkMessagesReadDto {
  @ApiProperty({ description: 'Message IDs to mark as read' })
  @IsArray()
  @IsString({ each: true })
  messageIds: string[];
}

export class QueryConversationsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search in conversation messages' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter unread only' })
  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean;
}

export class QueryMessagesDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Load messages before this message ID (for pagination)' })
  @IsOptional()
  @IsString()
  before?: string;
}

// WebSocket event payloads
export class WsMessagePayload {
  conversationId: string;
  content: string;
  messageType?: string;
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
}

export class WsTypingPayload {
  conversationId: string;
  isTyping: boolean;
}

export class WsMarkReadPayload {
  conversationId: string;
  messageIds: string[];
}
