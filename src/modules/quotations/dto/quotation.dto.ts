import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsEnum,
  IsDateString,
  ValidateNested,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { QuotationStatus, NeedUrgency } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

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

export class CreateQuotationDto {
  @ApiProperty({ description: 'Need ID this quotation is for' })
  @IsString()
  needId: string;

  @ApiProperty({ description: 'State of work / Site assessment' })
  @IsString()
  @MaxLength(2000)
  stateOfWork: string;

  @ApiProperty({ enum: NeedUrgency, description: 'Assessed urgency level' })
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

  @ApiPropertyOptional({ description: 'Site images URLs' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}

export class UpdateQuotationDto {
  @ApiPropertyOptional({ description: 'State of work / Site assessment' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  stateOfWork?: string;

  @ApiPropertyOptional({ enum: NeedUrgency, description: 'Assessed urgency level' })
  @IsOptional()
  @IsEnum(NeedUrgency)
  urgencyLevel?: NeedUrgency;

  @ApiPropertyOptional({ description: 'Proposed solution' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  proposedSolution?: string;

  @ApiPropertyOptional({ type: [MaterialItemDto], description: 'Materials list' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialItemDto)
  materials?: MaterialItemDto[];

  @ApiPropertyOptional({ description: 'Labor cost' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  laborCost?: number;

  @ApiPropertyOptional({ description: 'Quote validity date' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class RespondToQuotationDto {
  @ApiProperty({ enum: ['ACCEPTED', 'REJECTED'], description: 'Response to quotation' })
  @IsEnum(['ACCEPTED', 'REJECTED'])
  response: 'ACCEPTED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Response message' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class AddQuotationImageDto {
  @ApiProperty({ description: 'Image URL' })
  @IsString()
  imageUrl: string;

  @ApiPropertyOptional({ description: 'Image caption' })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional({ description: 'Image type', enum: ['site', 'material', 'work'] })
  @IsOptional()
  @IsEnum(['site', 'material', 'work'])
  type?: string;
}

export class QueryQuotationsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: QuotationStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(QuotationStatus)
  status?: QuotationStatus;

  @ApiPropertyOptional({ description: 'Filter by need ID' })
  @IsOptional()
  @IsString()
  needId?: string;
}
