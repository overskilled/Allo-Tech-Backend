import {
  IsOptional,
  IsString,
  IsEmail,
  IsDateString,
  MinLength,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string;

  @ApiPropertyOptional({ example: '+237612345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '1990-01-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
}

export class UpdateLocationDto {
  @ApiPropertyOptional({ example: 4.0511 })
  @IsNumber()
  latitude: number;

  @ApiPropertyOptional({ example: 9.7679 })
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional({ example: 'Akwa, Douala' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Akwa' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ example: 'Douala' })
  @IsOptional()
  @IsString()
  city?: string;
}

export class UpdateClientProfileDto {
  @ApiPropertyOptional({ example: 'Akwa' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ example: 'Douala' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Rue de la Joie, Immeuble X' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'fr' })
  @IsOptional()
  @IsString()
  preferredLanguage?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  notificationsEnabled?: boolean;
}

export class UpdateTechnicianProfileDto {
  @ApiPropertyOptional({ example: 'Électricien' })
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional({ example: ['Électricité', 'Domotique'] })
  @IsOptional()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional({ example: 'BTS Électrotechnique' })
  @IsOptional()
  @IsString()
  studies?: string;

  @ApiPropertyOptional({ example: ['Certification X', 'Agrément Y'] })
  @IsOptional()
  @IsString({ each: true })
  certifications?: string[];

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  yearsExperience?: number;

  @ApiPropertyOptional({ example: 'Expert en installations électriques...' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: 'Akwa' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ example: 'Douala' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Rue de la Joie' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  serviceRadius?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isAvailable?: boolean;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  availableFrom?: string;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @IsString()
  availableTo?: string;

  @ApiPropertyOptional({ example: [1, 2, 3, 4, 5] })
  @IsOptional()
  @IsNumber({}, { each: true })
  workDays?: number[];
}
