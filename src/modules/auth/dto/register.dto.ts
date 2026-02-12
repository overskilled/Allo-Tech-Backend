import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsDateString,
  IsEnum,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RegisterRole {
  CLIENT = 'CLIENT',
  TECHNICIAN = 'TECHNICIAN',
}

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @MinLength(2)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(2)
  lastName: string;

  @ApiPropertyOptional({ example: '1990-01-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: '+237612345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Douala' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Engineer' })
  @IsOptional()
  @IsString()
  profession?: string;
}

export class CompleteProfileClientDto {
  @ApiProperty({ example: 'Akwa' })
  @IsString()
  neighborhood: string;

  @ApiProperty({ example: 'Douala' })
  @IsString()
  city: string;

  @ApiProperty({ example: '+237612345678' })
  @IsString()
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}

export class CompleteProfileTechnicianDto {
  @ApiProperty({ example: 'Electrician' })
  @IsString()
  profession: string;

  @ApiProperty({ example: ['Electrical Installation', 'Wiring'] })
  @IsString({ each: true })
  specialties: string[];

  @ApiPropertyOptional({ example: 'Technical School of Douala' })
  @IsOptional()
  @IsString()
  studies?: string;

  @ApiPropertyOptional({ example: ['Certified Electrician Level 3'] })
  @IsOptional()
  @IsString({ each: true })
  certifications?: string[];

  @ApiProperty({ example: 'Akwa' })
  @IsString()
  neighborhood: string;

  @ApiProperty({ example: 'Douala' })
  @IsString()
  city: string;

  @ApiProperty({ example: '+237612345678' })
  @IsString()
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}
