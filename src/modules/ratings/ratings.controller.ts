import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { RatingsService } from './ratings.service';
import {
  CreateRatingDto,
  UpdateRatingDto,
  QueryRatingsDto,
} from './dto/rating.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Ratings')
@Controller({ path: 'ratings', version: '1' })
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  // ==========================================
  // CLIENT ENDPOINTS
  // ==========================================

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Submit a rating for a technician (Client)' })
  @ApiResponse({ status: 201, description: 'Rating submitted' })
  async createRating(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.ratingsService.createRating(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update a rating (Client - owner only)' })
  @ApiParam({ name: 'id', description: 'Rating ID' })
  @ApiResponse({ status: 200, description: 'Rating updated' })
  async updateRating(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateRatingDto,
  ) {
    return this.ratingsService.updateRating(id, userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a rating (Client - owner only)' })
  @ApiParam({ name: 'id', description: 'Rating ID' })
  @ApiResponse({ status: 200, description: 'Rating deleted' })
  async deleteRating(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ratingsService.deleteRating(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-ratings')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get client\'s submitted ratings' })
  @ApiResponse({ status: 200, description: 'Ratings list' })
  async getMyRatings(
    @CurrentUser('id') userId: string,
    @Query() query: QueryRatingsDto,
  ) {
    return this.ratingsService.getClientRatings(userId, query);
  }

  // ==========================================
  // PUBLIC ENDPOINTS
  // ==========================================

  @Public()
  @Get('technician/:technicianId')
  @ApiOperation({ summary: 'Get ratings for a technician' })
  @ApiParam({ name: 'technicianId', description: 'Technician user ID' })
  @ApiResponse({ status: 200, description: 'Ratings list' })
  async getTechnicianRatings(
    @Param('technicianId') technicianId: string,
    @Query() query: QueryRatingsDto,
  ) {
    return this.ratingsService.getTechnicianRatings(technicianId, query);
  }

  @Public()
  @Get('technician/:technicianId/summary')
  @ApiOperation({ summary: 'Get rating summary for a technician' })
  @ApiParam({ name: 'technicianId', description: 'Technician user ID' })
  @ApiResponse({ status: 200, description: 'Rating summary' })
  async getTechnicianRatingSummary(
    @Param('technicianId') technicianId: string,
  ) {
    return this.ratingsService.getTechnicianRatingSummary(technicianId);
  }

  @Public()
  @Get('technician/:technicianId/recent')
  @ApiOperation({ summary: 'Get recent ratings for a technician' })
  @ApiParam({ name: 'technicianId', description: 'Technician user ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Recent ratings' })
  async getRecentRatings(
    @Param('technicianId') technicianId: string,
    @Query('limit') limit?: number,
  ) {
    return this.ratingsService.getRecentRatings(technicianId, limit);
  }
}
