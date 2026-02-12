import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsDateString,
  IsArray,
  IsEnum,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// Advertisement DTOs
export class CreateAdvertisementDto {
  @ApiProperty({ description: 'Advertisement title' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Advertisement description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ description: 'Image URL' })
  @IsString()
  imageUrl: string;

  @ApiPropertyOptional({ description: 'Link URL when clicked' })
  @IsOptional()
  @IsString()
  linkUrl?: string;

  @ApiProperty({ description: 'Start date' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Target roles', type: [String], default: ['CLIENT', 'TECHNICIAN'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];
}

export class UpdateAdvertisementDto {
  @ApiPropertyOptional({ description: 'Advertisement title' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Advertisement description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Link URL' })
  @IsOptional()
  @IsString()
  linkUrl?: string;

  @ApiPropertyOptional({ description: 'Start date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Target roles', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];
}

export class QueryAdvertisementsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by target role' })
  @IsOptional()
  @IsString()
  targetRole?: string;
}

// Featured Technician DTOs
export class FeatureTechnicianDto {
  @ApiProperty({ description: 'Technician user ID' })
  @IsString()
  technicianId: string;

  @ApiPropertyOptional({ description: 'Feature priority (higher = more prominent)', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  priority?: number;

  @ApiPropertyOptional({ description: 'Feature end date (optional)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Reason for featuring' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// User Assistance DTOs
export class AssistUserDto {
  @ApiProperty({ description: 'User ID to assist' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Assistance notes' })
  @IsString()
  @MaxLength(2000)
  notes: string;

  @ApiPropertyOptional({ description: 'Action taken' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  action?: string;
}

export class QueryUsersForAssistanceDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by role' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Search by name/email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter users needing assistance' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  needsAssistance?: boolean;
}
