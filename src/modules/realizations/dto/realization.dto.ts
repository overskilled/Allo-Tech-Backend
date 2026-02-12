import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateRealizationDto {
  @ApiProperty({ description: 'Title of the realization' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Description of the work done' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Main image URL' })
  @IsString()
  imageUrl: string;

  @ApiPropertyOptional({ description: 'Category of the realization' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: 'Before images URLs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  beforeImages?: string[];

  @ApiPropertyOptional({ description: 'After images URLs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  afterImages?: string[];

  @ApiPropertyOptional({ description: 'Date when work was completed' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({ description: 'Whether the realization is publicly visible', default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isPublic?: boolean;
}

export class UpdateRealizationDto {
  @ApiPropertyOptional({ description: 'Title of the realization' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Description of the work done' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Main image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Category of the realization' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: 'Before images URLs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  beforeImages?: string[];

  @ApiPropertyOptional({ description: 'After images URLs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  afterImages?: string[];

  @ApiPropertyOptional({ description: 'Date when work was completed' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({ description: 'Whether the realization is publicly visible' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isPublic?: boolean;
}

export class AddImagesDto {
  @ApiPropertyOptional({ description: 'Before images URLs to add', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  beforeImages?: string[];

  @ApiPropertyOptional({ description: 'After images URLs to add', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  afterImages?: string[];
}

export class QueryRealizationsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by visibility' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isPublic?: boolean;
}
