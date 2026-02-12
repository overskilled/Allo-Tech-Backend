import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class SystemSettingsDto {
  // Registration & Trial
  @ApiPropertyOptional({ description: 'Enable new user registrations' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  registrationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Trial duration in days' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(90)
  trialDurationDays?: number;

  @ApiPropertyOptional({ description: 'Require email verification' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  requireEmailVerification?: boolean;

  // Maintenance
  @ApiPropertyOptional({ description: 'Enable maintenance mode' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  maintenanceMode?: boolean;

  @ApiPropertyOptional({ description: 'Maintenance message' })
  @IsOptional()
  @IsString()
  maintenanceMessage?: string;

  // Platform Settings
  @ApiPropertyOptional({ description: 'Default currency code' })
  @IsOptional()
  @IsString()
  defaultCurrency?: string;

  @ApiPropertyOptional({ description: 'Default language' })
  @IsOptional()
  @IsString()
  defaultLanguage?: string;

  @ApiPropertyOptional({ description: 'Platform commission percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  commissionRate?: number;

  // Limits
  @ApiPropertyOptional({ description: 'Max images per need' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxImagesPerNeed?: number;

  @ApiPropertyOptional({ description: 'Max file size in MB' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxFileSizeMb?: number;

  // Notifications
  @ApiPropertyOptional({ description: 'Enable push notifications' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  pushNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable email notifications' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  emailNotificationsEnabled?: boolean;

  // Support
  @ApiPropertyOptional({ description: 'Support email address' })
  @IsOptional()
  @IsString()
  supportEmail?: string;

  @ApiPropertyOptional({ description: 'Support phone number' })
  @IsOptional()
  @IsString()
  supportPhone?: string;
}

export class UpdateSettingDto {
  @ApiProperty({ description: 'Setting key' })
  @IsString()
  key: string;

  @ApiProperty({ description: 'Setting value (can be string, number, boolean, or object)' })
  value: any;
}

export class FeatureFlagDto {
  @ApiProperty({ description: 'Feature flag key' })
  @IsString()
  key: string;

  @ApiProperty({ description: 'Feature flag enabled status' })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ description: 'Feature flag description' })
  @IsOptional()
  @IsString()
  description?: string;
}

// Default system settings
export const DEFAULT_SETTINGS: Record<string, any> = {
  // Registration & Trial
  registrationEnabled: true,
  trialDurationDays: 14,
  requireEmailVerification: true,

  // Maintenance
  maintenanceMode: false,
  maintenanceMessage: 'Le système est en maintenance. Veuillez réessayer plus tard.',

  // Platform
  defaultCurrency: 'XAF',
  defaultLanguage: 'fr',
  commissionRate: 10, // 10%

  // Limits
  maxImagesPerNeed: 5,
  maxFileSizeMb: 10,
  maxRealizationImages: 10,

  // Notifications
  pushNotificationsEnabled: true,
  emailNotificationsEnabled: true,

  // Support
  supportEmail: 'support@allotech.com',
  supportPhone: '+237600000000',

  // Feature Flags
  features: {
    teams: true,
    quotations: true,
    payments: true,
    realizations: true,
    recommendations: true,
  },
};
