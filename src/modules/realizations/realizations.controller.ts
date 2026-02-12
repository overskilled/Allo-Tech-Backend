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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RealizationsService } from './realizations.service';
import {
  CreateRealizationDto,
  UpdateRealizationDto,
  AddImagesDto,
  QueryRealizationsDto,
} from './dto/realization.dto';

@ApiTags('Realizations')
@Controller('realizations')
export class RealizationsController {
  constructor(private readonly realizationsService: RealizationsService) {}

  // ==========================================
  // TECHNICIAN ENDPOINTS
  // ==========================================

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TECHNICIAN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new realization (technician only)' })
  @ApiResponse({ status: 201, description: 'Realization created successfully' })
  create(@CurrentUser('id') technicianId: string, @Body() dto: CreateRealizationDto) {
    return this.realizationsService.create(technicianId, dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TECHNICIAN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a realization (owner only)' })
  @ApiResponse({ status: 200, description: 'Realization updated successfully' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') technicianId: string,
    @Body() dto: UpdateRealizationDto,
  ) {
    return this.realizationsService.update(id, technicianId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TECHNICIAN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a realization (owner only)' })
  @ApiResponse({ status: 200, description: 'Realization deleted successfully' })
  delete(@Param('id') id: string, @CurrentUser('id') technicianId: string) {
    return this.realizationsService.delete(id, technicianId);
  }

  @Post(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TECHNICIAN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add before/after images to realization' })
  @ApiResponse({ status: 200, description: 'Images added successfully' })
  addImages(
    @Param('id') id: string,
    @CurrentUser('id') technicianId: string,
    @Body() dto: AddImagesDto,
  ) {
    return this.realizationsService.addImages(id, technicianId, dto);
  }

  @Delete(':id/images/before')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TECHNICIAN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a before image' })
  @ApiResponse({ status: 200, description: 'Image removed successfully' })
  removeBeforeImage(
    @Param('id') id: string,
    @CurrentUser('id') technicianId: string,
    @Body('imageUrl') imageUrl: string,
  ) {
    return this.realizationsService.removeImage(id, technicianId, imageUrl, 'before');
  }

  @Delete(':id/images/after')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TECHNICIAN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove an after image' })
  @ApiResponse({ status: 200, description: 'Image removed successfully' })
  removeAfterImage(
    @Param('id') id: string,
    @CurrentUser('id') technicianId: string,
    @Body('imageUrl') imageUrl: string,
  ) {
    return this.realizationsService.removeImage(id, technicianId, imageUrl, 'after');
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TECHNICIAN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my realizations (technician)' })
  @ApiResponse({ status: 200, description: 'Returns technician realizations' })
  getMyRealizations(
    @CurrentUser('id') technicianId: string,
    @Query() query: QueryRealizationsDto,
  ) {
    return this.realizationsService.getMyRealizations(technicianId, query);
  }

  @Get('my/categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TECHNICIAN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my realization categories' })
  @ApiResponse({ status: 200, description: 'Returns categories with counts' })
  getMyCategories(@CurrentUser('id') technicianId: string) {
    return this.realizationsService.getCategories(technicianId);
  }

  // ==========================================
  // PUBLIC ENDPOINTS
  // ==========================================

  @Get('recent')
  @Public()
  @ApiOperation({ summary: 'Get recent public realizations' })
  @ApiResponse({ status: 200, description: 'Returns recent realizations' })
  getRecent(@Query('limit') limit?: number) {
    return this.realizationsService.getRecentRealizations(limit || 10);
  }

  @Get('categories')
  @Public()
  @ApiOperation({ summary: 'Get all public realization categories' })
  @ApiResponse({ status: 200, description: 'Returns categories with counts' })
  getCategories() {
    return this.realizationsService.getCategories();
  }

  @Get('technician/:technicianId')
  @Public()
  @ApiOperation({ summary: 'Get public realizations of a technician' })
  @ApiResponse({ status: 200, description: 'Returns technician public realizations' })
  getTechnicianRealizations(
    @Param('technicianId') technicianId: string,
    @Query() query: QueryRealizationsDto,
  ) {
    return this.realizationsService.getTechnicianRealizations(technicianId, query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a realization by ID' })
  @ApiResponse({ status: 200, description: 'Returns the realization' })
  getById(@Param('id') id: string, @CurrentUser('id') requesterId?: string) {
    return this.realizationsService.getById(id, requesterId);
  }
}
