import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CoordinatesDto,
  GeocodeAddressDto,
  NearbySearchDto,
  GeocodingResult,
  DistanceResult,
  CAMEROON_CITIES,
} from './dto/location.dto';

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly geocodingApiKey: string;
  private readonly geocodingProvider: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {
    this.geocodingApiKey = this.configService.get<string>('GEOCODING_API_KEY', '');
    this.geocodingProvider = this.configService.get<string>('GEOCODING_PROVIDER', 'local');

    if (!this.geocodingApiKey && this.geocodingProvider !== 'local') {
      this.logger.warn('Geocoding API key not configured, using local geocoding');
    }
  }

  // ==========================================
  // GEOCODING
  // ==========================================

  async geocodeAddress(dto: GeocodeAddressDto): Promise<GeocodingResult | null> {
    // Try local geocoding first for Cameroon cities
    const localResult = this.geocodeLocally(dto.address, dto.city);
    if (localResult) {
      return localResult;
    }

    // If external geocoding is configured
    if (this.geocodingApiKey && this.geocodingProvider === 'google') {
      return this.geocodeWithGoogle(dto);
    }

    if (this.geocodingApiKey && this.geocodingProvider === 'nominatim') {
      return this.geocodeWithNominatim(dto);
    }

    return null;
  }

  async reverseGeocode(coords: CoordinatesDto): Promise<GeocodingResult | null> {
    // Try to find nearest known city
    const nearestCity = this.findNearestCity(coords.latitude, coords.longitude);

    if (nearestCity) {
      return {
        latitude: coords.latitude,
        longitude: coords.longitude,
        formattedAddress: `${nearestCity.name}, Cameroon`,
        components: {
          city: nearestCity.name,
          country: 'Cameroon',
        },
        confidence: nearestCity.distance < 10 ? 0.9 : 0.5,
      };
    }

    // External reverse geocoding
    if (this.geocodingApiKey && this.geocodingProvider === 'nominatim') {
      return this.reverseGeocodeWithNominatim(coords);
    }

    return null;
  }

  // ==========================================
  // LOCAL GEOCODING
  // ==========================================

  private geocodeLocally(address: string, city?: string): GeocodingResult | null {
    const searchText = `${address} ${city || ''}`.toLowerCase();

    // Check for known cities
    for (const [cityName, coords] of Object.entries(CAMEROON_CITIES)) {
      if (searchText.includes(cityName.toLowerCase())) {
        return {
          latitude: coords.lat,
          longitude: coords.lng,
          formattedAddress: `${address}, ${cityName}, Cameroon`,
          components: {
            address,
            city: cityName,
            country: 'Cameroon',
          },
          confidence: 0.7,
        };
      }
    }

    // If city is explicitly provided
    if (city && CAMEROON_CITIES[city]) {
      const coords = CAMEROON_CITIES[city];
      return {
        latitude: coords.lat,
        longitude: coords.lng,
        formattedAddress: `${address}, ${city}, Cameroon`,
        components: {
          address,
          city,
          country: 'Cameroon',
        },
        confidence: 0.6,
      };
    }

    return null;
  }

  private findNearestCity(lat: number, lng: number): { name: string; distance: number } | null {
    let nearest: { name: string; distance: number } | null = null;

    for (const [cityName, coords] of Object.entries(CAMEROON_CITIES)) {
      const distance = this.calculateDistance(lat, lng, coords.lat, coords.lng);

      if (!nearest || distance < nearest.distance) {
        nearest = { name: cityName, distance };
      }
    }

    return nearest;
  }

  // ==========================================
  // EXTERNAL GEOCODING PROVIDERS
  // ==========================================

  private async geocodeWithGoogle(dto: GeocodeAddressDto): Promise<GeocodingResult | null> {
    try {
      const address = encodeURIComponent(
        `${dto.address}${dto.city ? `, ${dto.city}` : ''}${dto.country ? `, ${dto.country}` : ', Cameroon'}`
      );

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${this.geocodingApiKey}`
      );

      const data = await response.json();

      if ((data as any).status === 'OK' && (data as any).results.length > 0) {
        const result = (data as any).results[0];
        return {
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng,
          formattedAddress: result.formatted_address,
          components: this.parseGoogleAddressComponents(result.address_components),
          confidence: this.mapGoogleLocationType(result.geometry.location_type),
        };
      }

      return null;
    } catch (error) {
      this.logger.error(`Google geocoding error: ${(error as any).message}`);
      return null;
    }
  }

  private async geocodeWithNominatim(dto: GeocodeAddressDto): Promise<GeocodingResult | null> {
    try {
      const query = encodeURIComponent(
        `${dto.address}${dto.city ? `, ${dto.city}` : ''}${dto.country ? `, ${dto.country}` : ', Cameroon'}`
      );

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
        {
          headers: {
            'User-Agent': 'AlloTech/1.0',
          },
        }
      );

      const data = await response.json();

      if ((data as any).length > 0) {
        const result = (data as any)[0];
        return {
          latitude: parseFloat(result.lat),
          longitude: parseFloat(result.lon),
          formattedAddress: result.display_name,
          components: {
            city: result.address?.city || result.address?.town,
            region: result.address?.state,
            country: result.address?.country,
          },
          confidence: parseFloat(result.importance) || 0.5,
        };
      }

      return null;
    } catch (error) {
      this.logger.error(`Nominatim geocoding error: ${(error as any).message}`);
      return null;
    }
  }

  private async reverseGeocodeWithNominatim(
    coords: CoordinatesDto
  ): Promise<GeocodingResult | null> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`,
        {
          headers: {
            'User-Agent': 'AlloTech/1.0',
          },
        }
      );

      const data = await response.json();

      if (data && (data as any).display_name) {
        return {
          latitude: coords.latitude,
          longitude: coords.longitude,
          formattedAddress: (data as any).display_name,
          components: {
            address: (data as any).address?.road,
            neighborhood: (data as any).address?.suburb || (data as any).address?.neighbourhood,
            city: (data as any).address?.city || (data as any).address?.town,
            region: (data as any).address?.state,
            country: (data as any).address?.country,
          },
          confidence: 0.8,
        };
      }

      return null;
    } catch (error) {
      this.logger.error(`Nominatim reverse geocoding error: ${(error as any).message}`);
      return null;
    }
  }

  // ==========================================
  // DISTANCE CALCULATION
  // ==========================================

  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    // Haversine formula
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10; // Round to 1 decimal
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async calculateDistanceMatrix(
    origin: CoordinatesDto,
    destinations: CoordinatesDto[]
  ): Promise<DistanceResult[]> {
    return destinations.map((dest) => ({
      distance: this.calculateDistance(
        origin.latitude,
        origin.longitude,
        dest.latitude,
        dest.longitude
      ),
      origin,
      destination: dest,
    }));
  }

  // ==========================================
  // NEARBY SEARCH
  // ==========================================

  async findNearbyTechnicians(dto: NearbySearchDto) {
    // Get all technicians with location
    const where: any = {
      role: 'TECHNICIAN',
      status: 'ACTIVE',
      technicianProfile: {
        latitude: { not: null },
        longitude: { not: null },
      },
    };

    if (dto.profession) {
      where.technicianProfile.profession = dto.profession;
    }

    if (dto.verifiedOnly) {
      where.technicianProfile.isVerified = true;
    }

    if (dto.minRating) {
      where.technicianProfile.avgRating = { gte: dto.minRating };
    }

    const technicians = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImage: true,
        technicianProfile: {
          select: {
            profession: true,
            specialties: true,
            latitude: true,
            longitude: true,
            serviceRadius: true,
            avgRating: true,
            totalRatings: true,
            completedJobs: true,
            isVerified: true,
            city: true,
            isAvailable: true,
          },
        },
      },
    });

    // Filter by distance and add distance info
    const nearby = technicians
      .map((tech) => {
        const distance = this.calculateDistance(
          dto.latitude,
          dto.longitude,
          tech.technicianProfile!.latitude!,
          tech.technicianProfile!.longitude!
        );

        return {
          ...tech,
          distance,
          technicianProfile: {
            ...tech.technicianProfile,
            specialties: tech.technicianProfile?.specialties
              ? JSON.parse(tech.technicianProfile.specialties)
              : [],
          },
        };
      })
      .filter((tech) => tech.distance <= dto.radius)
      .sort((a, b) => a.distance - b.distance);

    return {
      searchLocation: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        radius: dto.radius,
      },
      results: nearby,
      totalFound: nearby.length,
    };
  }

  // ==========================================
  // CITY SERVICES
  // ==========================================

  getCities(): Array<{ name: string; latitude: number; longitude: number }> {
    return Object.entries(CAMEROON_CITIES).map(([name, coords]) => ({
      name,
      latitude: coords.lat,
      longitude: coords.lng,
    }));
  }

  getCityCoordinates(cityName: string): CoordinatesDto | null {
    const city = CAMEROON_CITIES[cityName];
    if (city) {
      return {
        latitude: city.lat,
        longitude: city.lng,
      };
    }
    return null;
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private parseGoogleAddressComponents(components: any[]): any {
    const result: any = {};

    components.forEach((comp) => {
      if (comp.types.includes('street_number') || comp.types.includes('route')) {
        result.address = (result.address || '') + comp.long_name + ' ';
      }
      if (comp.types.includes('neighborhood') || comp.types.includes('sublocality')) {
        result.neighborhood = comp.long_name;
      }
      if (comp.types.includes('locality')) {
        result.city = comp.long_name;
      }
      if (comp.types.includes('administrative_area_level_1')) {
        result.region = comp.long_name;
      }
      if (comp.types.includes('country')) {
        result.country = comp.long_name;
      }
      if (comp.types.includes('postal_code')) {
        result.postalCode = comp.long_name;
      }
    });

    if (result.address) {
      result.address = result.address.trim();
    }

    return result;
  }

  private mapGoogleLocationType(type: string): number {
    const confidenceMap: Record<string, number> = {
      ROOFTOP: 1.0,
      RANGE_INTERPOLATED: 0.9,
      GEOMETRIC_CENTER: 0.7,
      APPROXIMATE: 0.5,
    };
    return confidenceMap[type] || 0.5;
  }
}
