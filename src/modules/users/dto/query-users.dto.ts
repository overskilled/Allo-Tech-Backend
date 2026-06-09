import { IsOptional, IsString, IsEnum, IsBoolean, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export enum UserRoleFilter {
  CLIENT = 'CLIENT',
  TECHNICIAN = 'TECHNICIAN',
  AGENT = 'AGENT',
  ADMIN = 'ADMIN',
}

export enum UserStatusFilter {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class QueryUsersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: UserRoleFilter })
  @IsOptional()
  @IsEnum(UserRoleFilter)
  role?: UserRoleFilter;

  @ApiPropertyOptional({ enum: UserStatusFilter })
  @IsOptional()
  @IsEnum(UserStatusFilter)
  status?: UserStatusFilter;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  emailVerified?: boolean;
}

export class QueryTechniciansDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({
    description:
      'Filter by category name (matched against profession/specialties)',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Minimum average rating (0-5)' })
  @IsOptional()
  minRating?: number;

  @ApiPropertyOptional({
    description:
      'Latitude of the search centre. When provided with longitude, results are limited to a bounding box of ~radiusKm around this point ("near me").',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude of the search centre (see latitude).' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Search radius in km around latitude/longitude. Defaults to 10km when a centre is given.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsNumber()
  radiusKm?: number;
}
