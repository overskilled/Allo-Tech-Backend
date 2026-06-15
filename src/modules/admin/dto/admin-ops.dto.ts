import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { NeedStatus, NeedUrgency, MissionStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true;

// ==========================================
// QUERY DTOs (monitoring / lists)
// ==========================================

export class QueryNeedsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: NeedStatus })
  @IsOptional()
  @IsEnum(NeedStatus)
  status?: NeedStatus;

  @ApiPropertyOptional({ enum: NeedUrgency })
  @IsOptional()
  @IsEnum(NeedUrgency)
  urgency?: NeedUrgency;

  @ApiPropertyOptional({ description: 'Filter by city' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'From date (createdAt >=)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'To date (createdAt <=)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Only at-risk needs (open, aging, no candidatures)' })
  @IsOptional()
  @IsBoolean()
  @Transform(toBool)
  issuesOnly?: boolean;
}

export class QueryAdminMissionsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: MissionStatus })
  @IsOptional()
  @IsEnum(MissionStatus)
  status?: MissionStatus;

  @ApiPropertyOptional({ description: 'Filter by city (via linked need)' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'From date (createdAt >=)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'To date (createdAt <=)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Only at-risk missions (stuck, disputed, escrow blocked)' })
  @IsOptional()
  @IsBoolean()
  @Transform(toBool)
  issuesOnly?: boolean;
}

export class HealthQueryDto {
  @ApiPropertyOptional({ default: 3, description: 'Number of days before an item is considered stale' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  staleDays?: number = 3;
}

// ==========================================
// ENFORCEMENT ACTION DTOs
// ==========================================

export class AdminCancelDto {
  @ApiPropertyOptional({ description: 'Reason for the cancellation (audit-logged, sent to parties)' })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class ReassignMissionDto {
  @ApiPropertyOptional({ description: 'Target technician user id' })
  @IsString()
  technicianId: string;

  @ApiPropertyOptional({ description: 'Reason for the reassignment' })
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ description: 'Optional new agreed amount (candidature missions)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  newAmount?: number;
}

export class ForceCompleteDto {
  @ApiPropertyOptional({ description: 'Reason for the override (audit-logged)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ description: 'Optional admin note stored on the mission' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class EscrowReleaseDto {
  @ApiPropertyOptional({ description: 'Reason / note for releasing the held funds' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class EscrowRefundDto {
  @ApiPropertyOptional({ description: 'Reason for refunding the client (audit-logged)' })
  @IsString()
  @MaxLength(500)
  reason: string;
}
