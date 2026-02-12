import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CandidatureStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class SubmitCandidatureDto {
  @ApiProperty({ description: 'Need ID to apply for' })
  @IsString()
  needId: string;

  @ApiPropertyOptional({ description: 'Message to the client' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({ description: 'Proposed date for the service' })
  @IsOptional()
  @IsDateString()
  proposedDate?: string;

  @ApiPropertyOptional({ description: 'Proposed price for the service' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  proposedPrice?: number;
}

export class UpdateCandidatureDto {
  @ApiPropertyOptional({ description: 'Message to the client' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({ description: 'Proposed date for the service' })
  @IsOptional()
  @IsDateString()
  proposedDate?: string;

  @ApiPropertyOptional({ description: 'Proposed price for the service' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  proposedPrice?: number;
}

export class RespondToCandidatureDto {
  @ApiProperty({ enum: ['ACCEPTED', 'REJECTED'], description: 'Response to candidature' })
  @IsEnum(['ACCEPTED', 'REJECTED'])
  response: 'ACCEPTED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Message to the technician' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class QueryCandidaturesDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CandidatureStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(CandidatureStatus)
  status?: CandidatureStatus;

  @ApiPropertyOptional({ description: 'Filter by need ID' })
  @IsOptional()
  @IsString()
  needId?: string;
}
