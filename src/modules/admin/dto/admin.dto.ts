import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export enum UserFilterRole {
  ALL = 'all',
  CLIENT = 'CLIENT',
  TECHNICIAN = 'TECHNICIAN',
  MANAGER = 'MANAGER',
  ADMIN = 'ADMIN',
}

export enum UserFilterStatus {
  ALL = 'all',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class QueryUsersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: UserFilterRole })
  @IsOptional()
  @IsEnum(UserFilterRole)
  role?: UserFilterRole;

  @ApiPropertyOptional({ enum: UserFilterStatus })
  @IsOptional()
  @IsEnum(UserFilterStatus)
  status?: UserFilterStatus;

  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter verified technicians only' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  verified?: boolean;

  @ApiPropertyOptional({ description: 'Filter by city' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'From date' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'To date' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class UpdateUserStatusDto {
  @ApiPropertyOptional({ enum: UserFilterStatus })
  @IsOptional()
  @IsEnum(UserFilterStatus)
  status?: UserFilterStatus;
}

export class VerifyTechnicianDto {
  @ApiPropertyOptional({ description: 'Verification notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class SuspendUserDto {
  @ApiPropertyOptional({ description: 'Reason for suspension' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SystemSettingsDto {
  @ApiPropertyOptional({ description: 'Trial duration in days' })
  @IsOptional()
  trialDurationDays?: number;

  @ApiPropertyOptional({ description: 'Enable new user registrations' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  registrationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Maintenance mode' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  maintenanceMode?: boolean;
}

export class DateRangeDto {
  @ApiPropertyOptional({ description: 'Start date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
