import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateNotificationDto {
  @ApiProperty({ description: 'User ID to send notification to' })
  @IsString()
  userId: string;

  @ApiProperty({ enum: NotificationType, description: 'Notification type' })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ description: 'Notification title' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Notification body' })
  @IsString()
  @MaxLength(500)
  body: string;

  @ApiPropertyOptional({ description: 'Additional data as JSON object' })
  @IsOptional()
  data?: Record<string, any>;
}

export class BulkNotificationDto {
  @ApiProperty({ description: 'User IDs to send notification to' })
  @IsArray()
  @IsString({ each: true })
  userIds: string[];

  @ApiProperty({ enum: NotificationType, description: 'Notification type' })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ description: 'Notification title' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Notification body' })
  @IsString()
  @MaxLength(500)
  body: string;

  @ApiPropertyOptional({ description: 'Additional data as JSON object' })
  @IsOptional()
  data?: Record<string, any>;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ description: 'Enable push notifications' })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable email notifications' })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable appointment notifications' })
  @IsOptional()
  @IsBoolean()
  appointmentNotifications?: boolean;

  @ApiPropertyOptional({ description: 'Enable message notifications' })
  @IsOptional()
  @IsBoolean()
  messageNotifications?: boolean;

  @ApiPropertyOptional({ description: 'Enable payment notifications' })
  @IsOptional()
  @IsBoolean()
  paymentNotifications?: boolean;

  @ApiPropertyOptional({ description: 'Enable rating notifications' })
  @IsOptional()
  @IsBoolean()
  ratingNotifications?: boolean;

  @ApiPropertyOptional({ description: 'Enable system notifications' })
  @IsOptional()
  @IsBoolean()
  systemNotifications?: boolean;
}

export class RegisterDeviceDto {
  @ApiProperty({ description: 'FCM device token' })
  @IsString()
  token: string;

  @ApiPropertyOptional({ description: 'Device platform', enum: ['ios', 'android', 'web'] })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ description: 'Device name/identifier' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class QueryNotificationsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: NotificationType, description: 'Filter by type' })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ description: 'Filter unread only' })
  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean;
}
