import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  MaxLength,
  Min,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCounterProposalDto {
  @ApiPropertyOptional({ description: 'Proposed total amount' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  proposedTotal?: number;

  @ApiPropertyOptional({ description: 'Proposed labor cost' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  proposedLabor?: number;

  @ApiPropertyOptional({ description: 'Proposed materials as JSON' })
  @IsOptional()
  @IsString()
  proposedMaterials?: string;

  @ApiPropertyOptional({ description: 'Message explaining the counter-proposal' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class RespondCounterProposalDto {
  @ApiProperty({ description: 'Accept or reject the counter-proposal' })
  @IsBoolean()
  accept: boolean;

  @ApiPropertyOptional({ description: 'Response message' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  responseMessage?: string;
}
