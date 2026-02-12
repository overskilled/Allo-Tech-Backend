import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateRatingDto {
  @ApiProperty({ description: 'Technician user ID to rate' })
  @IsString()
  technicianId: string;

  @ApiProperty({ description: 'Rating score (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  score: number;

  @ApiPropertyOptional({ description: 'Comment (required if score is 1-2)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class UpdateRatingDto {
  @ApiPropertyOptional({ description: 'Rating score (1-5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  score?: number;

  @ApiPropertyOptional({ description: 'Comment' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class QueryRatingsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Minimum score filter' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  minScore?: number;

  @ApiPropertyOptional({ description: 'Maximum score filter' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxScore?: number;
}
