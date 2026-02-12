import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
} from '@nestjs/swagger';
import { NeedsService } from './needs.service';
import { CreateNeedDto, UpdateNeedDto, AddNeedImageDto } from './dto/create-need.dto';
import { QueryNeedsDto, QueryClientNeedsDto } from './dto/query-needs.dto';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateSubCategoryDto,
  UpdateSubCategoryDto,
} from './dto/category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { NeedStatus } from '@prisma/client';

@ApiTags('Needs')
@Controller({ path: 'needs', version: '1' })
export class NeedsController {
  constructor(private readonly needsService: NeedsService) {}

  // ==========================================
  // PUBLIC CATEGORY ENDPOINTS
  // ==========================================

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Get all categories' })
  @ApiResponse({ status: 200, description: 'Categories list' })
  async getCategories() {
    return this.needsService.getAllCategories(false);
  }

  @Public()
  @Get('categories/:id')
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category details' })
  async getCategoryById(@Param('id') id: string) {
    return this.needsService.getCategoryById(id);
  }

  // ==========================================
  // ADMIN CATEGORY ENDPOINTS
  // ==========================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('categories')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create category (Admin/Manager)' })
  @ApiResponse({ status: 201, description: 'Category created' })
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.needsService.createCategory(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Put('categories/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update category (Admin/Manager)' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.needsService.updateCategory(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('categories/:id')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete category (Admin)' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category deleted' })
  async deleteCategory(@Param('id') id: string) {
    return this.needsService.deleteCategory(id);
  }

  // ==========================================
  // ADMIN SUB-CATEGORY ENDPOINTS
  // ==========================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('categories/:categoryId/sub-categories')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create sub-category (Admin/Manager)' })
  @ApiParam({ name: 'categoryId', description: 'Parent category ID' })
  @ApiResponse({ status: 201, description: 'Sub-category created' })
  async createSubCategory(
    @Param('categoryId') categoryId: string,
    @Body() dto: CreateSubCategoryDto,
  ) {
    return this.needsService.createSubCategory(categoryId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Put('sub-categories/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update sub-category (Admin/Manager)' })
  @ApiParam({ name: 'id', description: 'Sub-category ID' })
  @ApiResponse({ status: 200, description: 'Sub-category updated' })
  async updateSubCategory(
    @Param('id') id: string,
    @Body() dto: UpdateSubCategoryDto,
  ) {
    return this.needsService.updateSubCategory(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('sub-categories/:id')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete sub-category (Admin)' })
  @ApiParam({ name: 'id', description: 'Sub-category ID' })
  @ApiResponse({ status: 200, description: 'Sub-category deleted' })
  async deleteSubCategory(@Param('id') id: string) {
    return this.needsService.deleteSubCategory(id);
  }

  // ==========================================
  // CLIENT NEED ENDPOINTS
  // ==========================================

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new need (Client)' })
  @ApiResponse({ status: 201, description: 'Need created' })
  async createNeed(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateNeedDto,
  ) {
    return this.needsService.createNeed(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-needs')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get client\'s own needs' })
  @ApiResponse({ status: 200, description: 'Client needs list' })
  async getMyNeeds(
    @CurrentUser('id') userId: string,
    @Query() query: QueryClientNeedsDto,
  ) {
    return this.needsService.getClientNeeds(userId, query);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update need (Client - owner only)' })
  @ApiParam({ name: 'id', description: 'Need ID' })
  @ApiResponse({ status: 200, description: 'Need updated' })
  async updateNeed(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNeedDto,
  ) {
    return this.needsService.updateNeed(id, userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete need (Client - owner only)' })
  @ApiParam({ name: 'id', description: 'Need ID' })
  @ApiResponse({ status: 200, description: 'Need deleted' })
  async deleteNeed(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.needsService.deleteNeed(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel need (Client - owner only)' })
  @ApiParam({ name: 'id', description: 'Need ID' })
  @ApiResponse({ status: 200, description: 'Need cancelled' })
  async cancelNeed(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.needsService.cancelNeed(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reopen')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen cancelled need (Client - owner only)' })
  @ApiParam({ name: 'id', description: 'Need ID' })
  @ApiResponse({ status: 200, description: 'Need reopened' })
  async reopenNeed(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.needsService.reopenNeed(id, userId);
  }

  // ==========================================
  // NEED IMAGE ENDPOINTS
  // ==========================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/images')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Add image to need' })
  @ApiParam({ name: 'id', description: 'Need ID' })
  @ApiResponse({ status: 201, description: 'Image added' })
  async addNeedImage(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddNeedImageDto,
  ) {
    return this.needsService.addNeedImage(id, userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/images')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove image from need' })
  @ApiParam({ name: 'id', description: 'Need ID' })
  @ApiResponse({ status: 200, description: 'Image removed' })
  async removeNeedImage(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('imageUrl') imageUrl: string,
  ) {
    return this.needsService.removeNeedImage(id, userId, imageUrl);
  }

  // ==========================================
  // TECHNICIAN NEED ENDPOINTS
  // ==========================================

  @UseGuards(JwtAuthGuard)
  @Get('available')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get available needs for technician' })
  @ApiResponse({ status: 200, description: 'Available needs list' })
  async getAvailableNeeds(
    @CurrentUser('id') userId: string,
    @Query() query: QueryNeedsDto,
  ) {
    return this.needsService.getAvailableNeeds(userId, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('nearby')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get nearby needs for technician' })
  @ApiResponse({ status: 200, description: 'Nearby needs list' })
  async getNearbyNeeds(
    @CurrentUser('id') userId: string,
    @Query() query: QueryNeedsDto,
  ) {
    return this.needsService.getNearbyNeeds(userId, query);
  }

  // ==========================================
  // GENERAL ENDPOINTS
  // ==========================================

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get need by ID' })
  @ApiParam({ name: 'id', description: 'Need ID' })
  @ApiResponse({ status: 200, description: 'Need details' })
  async getNeedById(@Param('id') id: string) {
    return this.needsService.getNeedById(id);
  }

  // ==========================================
  // ADMIN STATUS UPDATE
  // ==========================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch(':id/status')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update need status (Admin/Manager)' })
  @ApiParam({ name: 'id', description: 'Need ID' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async updateNeedStatus(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('status') status: NeedStatus,
  ) {
    return this.needsService.updateNeedStatus(id, status, userId);
  }
}
