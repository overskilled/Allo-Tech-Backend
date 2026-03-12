import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsArray,
  IsEnum,
  IsInt,
  MaxLength,
  Min,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// ─── Field Visit DTOs ────────────────────────────────────

export class CreateFieldVisitDto {
  @ApiPropertyOptional({ description: 'Full address' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiProperty({ description: 'City' })
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({ description: 'Neighborhood/Quartier' })
  @IsString()
  @MaxLength(200)
  neighborhood: string;

  @ApiPropertyOptional({ description: 'GPS latitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'GPS longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Zone/sector name for grouping' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  zone?: string;

  @ApiPropertyOptional({ description: 'Order within planned route' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  routeOrder?: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ description: 'Scheduled date and time' })
  @IsDateString()
  scheduledAt: string;
}

export class UpdateFieldVisitDto {
  @ApiPropertyOptional({ enum: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] })
  @IsOptional()
  @IsEnum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({ enum: ['INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP', 'ONBOARDED'] })
  @IsOptional()
  @IsEnum(['INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP', 'ONBOARDED'])
  outcome?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Scheduled date/time' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Zone name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  zone?: string;

  @ApiPropertyOptional({ description: 'Route order' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  routeOrder?: number;

  // GPS check-in/check-out
  @ApiPropertyOptional({ description: 'Check-in latitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  checkinLat?: number;

  @ApiPropertyOptional({ description: 'Check-in longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  checkinLng?: number;

  @ApiPropertyOptional({ description: 'Check-out latitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  checkoutLat?: number;

  @ApiPropertyOptional({ description: 'Check-out longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  checkoutLng?: number;
}

export class QueryFieldVisitsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ['INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP', 'ONBOARDED'] })
  @IsOptional()
  @IsString()
  outcome?: string;

  @ApiPropertyOptional({ description: 'Filter by city' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Filter by zone' })
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional({ description: 'Date range start' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Date range end' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

// ─── Onboarding DTOs ─────────────────────────────────────

export class CreateOnboardingDto {
  @ApiProperty({ description: 'Technician full name' })
  @IsString()
  @MaxLength(200)
  technicianName: string;

  @ApiProperty({ description: 'Technician phone number' })
  @IsString()
  @MaxLength(30)
  technicianPhone: string;

  @ApiPropertyOptional({ description: 'Technician email' })
  @IsOptional()
  @IsEmail()
  technicianEmail?: string;

  @ApiProperty({ description: 'Profession' })
  @IsString()
  @MaxLength(200)
  profession: string;

  @ApiPropertyOptional({ description: 'Specialties', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional({ description: 'Years of experience' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @ApiProperty({ description: 'City' })
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({ description: 'Neighborhood' })
  @IsString()
  @MaxLength(200)
  neighborhood: string;

  @ApiPropertyOptional({ description: 'Address' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Field visit ID that originated this onboarding' })
  @IsOptional()
  @IsString()
  fieldVisitId?: string;
}

export class UpdateOnboardingDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'COMPLETED', 'REJECTED'] })
  @IsOptional()
  @IsEnum(['PENDING', 'COMPLETED', 'REJECTED'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  technicianName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  technicianPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  technicianEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  profession?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  neighborhood?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  documents?: any;
}

export class QueryOnboardingsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'COMPLETED', 'REJECTED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by city' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Date range start' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Date range end' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
