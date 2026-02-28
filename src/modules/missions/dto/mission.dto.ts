import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  MaxLength,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MissionStatus, NeedUrgency } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ScheduleMissionDto {
  @ApiProperty({ description: 'Scheduled date' })
  @IsDateString()
  scheduledDate: string;

  @ApiPropertyOptional({ description: 'Scheduled time (e.g. "14:00")' })
  @IsOptional()
  @IsString()
  scheduledTime?: string;
}

export class ValidateMissionDto {
  @ApiPropertyOptional({ description: 'Validation notes' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CancelMissionDto {
  @ApiProperty({ description: 'Cancellation reason' })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class RequestCompletionDto {
  @ApiPropertyOptional({ description: 'Completion notes from technician' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class AddMissionDocumentDto {
  @ApiProperty({ description: 'File URL' })
  @IsString()
  fileUrl: string;

  @ApiProperty({ description: 'File name' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: 'File type (image, pdf, document, video)' })
  @IsString()
  fileType: string;

  @ApiPropertyOptional({ description: 'Document caption' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;
}

export class MaterialItemDto {
  @ApiProperty({ description: 'Material name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Quantity needed' })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Unit price' })
  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreateAdditionalQuotationDto {
  @ApiProperty({ description: 'State of work / assessment' })
  @IsString()
  @MaxLength(2000)
  stateOfWork: string;

  @ApiProperty({ enum: NeedUrgency, description: 'Urgency level' })
  @IsEnum(NeedUrgency)
  urgencyLevel: NeedUrgency;

  @ApiProperty({ description: 'Proposed solution' })
  @IsString()
  @MaxLength(2000)
  proposedSolution: string;

  @ApiProperty({ type: [MaterialItemDto], description: 'Materials list' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialItemDto)
  materials: MaterialItemDto[];

  @ApiProperty({ description: 'Labor cost' })
  @IsNumber()
  @Min(0)
  laborCost: number;

  @ApiPropertyOptional({ description: 'Quote validity date' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class QueryMissionsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: MissionStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(MissionStatus)
  status?: MissionStatus;
}
