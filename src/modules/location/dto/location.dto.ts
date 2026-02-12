import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CoordinatesDto {
  @ApiProperty({ description: 'Latitude (-90 to 90)' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Transform(({ value }) => parseFloat(value))
  latitude: number;

  @ApiProperty({ description: 'Longitude (-180 to 180)' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Transform(({ value }) => parseFloat(value))
  longitude: number;
}

export class AddressDto {
  @ApiPropertyOptional({ description: 'Street address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Neighborhood/Quartier' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'State/Region' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Country' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Postal code' })
  @IsOptional()
  @IsString()
  postalCode?: string;
}

export class GeocodeAddressDto {
  @ApiProperty({ description: 'Address to geocode' })
  @IsString()
  address: string;

  @ApiPropertyOptional({ description: 'City for better accuracy' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Country code (e.g., CM for Cameroon)' })
  @IsOptional()
  @IsString()
  country?: string;
}

export class ReverseGeocodeDto extends CoordinatesDto {}

export class NearbySearchDto extends CoordinatesDto {
  @ApiProperty({ description: 'Search radius in km', default: 10 })
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseFloat(value))
  radius: number;

  @ApiPropertyOptional({ description: 'Filter by profession' })
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional({ description: 'Filter by verified only', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  verifiedOnly?: boolean;

  @ApiPropertyOptional({ description: 'Minimum rating filter' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Transform(({ value }) => parseFloat(value))
  minRating?: number;
}

export class DistanceMatrixDto {
  @ApiProperty({ description: 'Origin coordinates' })
  origin: CoordinatesDto;

  @ApiProperty({ description: 'Destination coordinates', type: [CoordinatesDto] })
  @IsArray()
  destinations: CoordinatesDto[];
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  components: {
    address?: string;
    neighborhood?: string;
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };
  confidence: number;
}

export interface DistanceResult {
  distance: number; // in km
  duration?: number; // in minutes (if routing is used)
  origin: CoordinatesDto;
  destination: CoordinatesDto;
}

// Cameroon cities with coordinates (for local geocoding)
export const CAMEROON_CITIES: Record<string, { lat: number; lng: number }> = {
  'Douala': { lat: 4.0511, lng: 9.7679 },
  'Yaoundé': { lat: 3.8480, lng: 11.5021 },
  'Garoua': { lat: 9.3000, lng: 13.3833 },
  'Bamenda': { lat: 5.9631, lng: 10.1591 },
  'Maroua': { lat: 10.5953, lng: 14.3157 },
  'Bafoussam': { lat: 5.4737, lng: 10.4179 },
  'Ngaoundéré': { lat: 7.3167, lng: 13.5833 },
  'Bertoua': { lat: 4.5833, lng: 13.6833 },
  'Loum': { lat: 4.7167, lng: 9.7333 },
  'Kumba': { lat: 4.6333, lng: 9.4333 },
  'Edéa': { lat: 3.8000, lng: 10.1333 },
  'Kribi': { lat: 2.9333, lng: 9.9000 },
  'Limbe': { lat: 4.0167, lng: 9.2000 },
  'Buea': { lat: 4.1500, lng: 9.2333 },
  'Ebolowa': { lat: 2.9000, lng: 11.1500 },
};
