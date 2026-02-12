import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { LocationService } from './location.service';
import {
  GeocodeAddressDto,
  CoordinatesDto,
  NearbySearchDto,
  DistanceMatrixDto,
} from './dto/location.dto';

@ApiTags('Location')
@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  // ==========================================
  // PUBLIC ENDPOINTS
  // ==========================================

  @Get('cities')
  @Public()
  @ApiOperation({ summary: 'Get list of supported cities' })
  @ApiResponse({ status: 200, description: 'Returns cities with coordinates' })
  getCities() {
    return this.locationService.getCities();
  }

  @Get('city')
  @Public()
  @ApiOperation({ summary: 'Get coordinates for a city' })
  @ApiResponse({ status: 200, description: 'Returns city coordinates' })
  getCityCoordinates(@Query('name') name: string) {
    const coords = this.locationService.getCityCoordinates(name);
    return coords || { error: 'City not found' };
  }

  // ==========================================
  // GEOCODING ENDPOINTS
  // ==========================================

  @Post('geocode')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Geocode an address to coordinates' })
  @ApiResponse({ status: 200, description: 'Returns coordinates for address' })
  async geocodeAddress(@Body() dto: GeocodeAddressDto) {
    const result = await this.locationService.geocodeAddress(dto);
    return result || { error: 'Address not found' };
  }

  @Post('reverse-geocode')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reverse geocode coordinates to address' })
  @ApiResponse({ status: 200, description: 'Returns address for coordinates' })
  async reverseGeocode(@Body() dto: CoordinatesDto) {
    const result = await this.locationService.reverseGeocode(dto);
    return result || { error: 'Location not found' };
  }

  // ==========================================
  // DISTANCE ENDPOINTS
  // ==========================================

  @Post('distance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Calculate distance between two points' })
  @ApiResponse({ status: 200, description: 'Returns distance in km' })
  calculateDistance(
    @Body('from') from: CoordinatesDto,
    @Body('to') to: CoordinatesDto,
  ) {
    const distance = this.locationService.calculateDistance(
      from.latitude,
      from.longitude,
      to.latitude,
      to.longitude,
    );
    return { distance, unit: 'km' };
  }

  @Post('distance-matrix')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Calculate distances to multiple destinations' })
  @ApiResponse({ status: 200, description: 'Returns distance matrix' })
  async calculateDistanceMatrix(@Body() dto: DistanceMatrixDto) {
    return this.locationService.calculateDistanceMatrix(dto.origin, dto.destinations);
  }

  // ==========================================
  // NEARBY SEARCH
  // ==========================================

  @Get('nearby/technicians')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Find nearby technicians' })
  @ApiResponse({ status: 200, description: 'Returns nearby technicians' })
  findNearbyTechnicians(@Query() query: NearbySearchDto) {
    return this.locationService.findNearbyTechnicians(query);
  }
}
