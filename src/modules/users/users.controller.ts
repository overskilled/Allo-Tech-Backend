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
import { UsersService } from './users.service';
import {
  UpdateUserDto,
  UpdateLocationDto,
  UpdateClientProfileDto,
  UpdateTechnicianProfileDto,
} from './dto/update-user.dto';
import { QueryUsersDto, QueryTechniciansDto } from './dto/query-users.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { UserStatus } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ==========================================
  // CURRENT USER OPERATIONS
  // ==========================================

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Put('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'User profile updated' })
  async updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(userId, dto);
  }

  @Patch('me/location')
  @ApiOperation({ summary: 'Update current user location' })
  @ApiResponse({ status: 200, description: 'Location updated' })
  async updateMyLocation(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.usersService.updateLocation(userId, dto);
  }

  @Patch('me/profile-image')
  @ApiOperation({ summary: 'Update profile image URL' })
  @ApiResponse({ status: 200, description: 'Profile image updated' })
  async updateMyProfileImage(
    @CurrentUser('id') userId: string,
    @Body('imageUrl') imageUrl: string,
  ) {
    return this.usersService.updateProfileImage(userId, imageUrl);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete current user account' })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  async deleteMyAccount(@CurrentUser('id') userId: string) {
    return this.usersService.deleteAccount(userId, userId);
  }

  // ==========================================
  // CLIENT PROFILE OPERATIONS
  // ==========================================

  @Put('me/client-profile')
  @ApiOperation({ summary: 'Update client profile' })
  @ApiResponse({ status: 200, description: 'Client profile updated' })
  async updateMyClientProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateClientProfileDto,
  ) {
    return this.usersService.updateClientProfile(userId, dto);
  }

  @Get('me/favorites')
  @ApiOperation({ summary: 'Get favorite technicians' })
  @ApiResponse({ status: 200, description: 'Favorites retrieved' })
  async getMyFavorites(@CurrentUser('id') userId: string) {
    return this.usersService.getFavorites(userId);
  }

  @Post('me/favorites/:technicianId')
  @ApiOperation({ summary: 'Add technician to favorites' })
  @ApiParam({ name: 'technicianId', description: 'Technician user ID' })
  @ApiResponse({ status: 201, description: 'Favorite added' })
  async addFavorite(
    @CurrentUser('id') userId: string,
    @Param('technicianId') technicianId: string,
  ) {
    return this.usersService.addFavorite(userId, technicianId);
  }

  @Delete('me/favorites/:technicianId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove technician from favorites' })
  @ApiParam({ name: 'technicianId', description: 'Technician user ID' })
  @ApiResponse({ status: 200, description: 'Favorite removed' })
  async removeFavorite(
    @CurrentUser('id') userId: string,
    @Param('technicianId') technicianId: string,
  ) {
    return this.usersService.removeFavorite(userId, technicianId);
  }

  @Get('me/statistics')
  @ApiOperation({ summary: 'Get client statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  async getMyStatistics(@CurrentUser('id') userId: string) {
    return this.usersService.getClientStatistics(userId);
  }

  @Get('me/recommendations')
  @ApiOperation({ summary: 'Get recommended technicians for client' })
  @ApiResponse({ status: 200, description: 'Recommendations retrieved' })
  async getRecommendations(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getRecommendedTechnicians(userId, limit || 10);
  }

  // ==========================================
  // TECHNICIAN PROFILE OPERATIONS
  // ==========================================

  @Put('me/technician-profile')
  @ApiOperation({ summary: 'Update technician profile' })
  @ApiResponse({ status: 200, description: 'Technician profile updated' })
  async updateMyTechnicianProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTechnicianProfileDto,
  ) {
    return this.usersService.updateTechnicianProfile(userId, dto);
  }

  @Get('me/technician-statistics')
  @ApiOperation({ summary: 'Get technician statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  async getTechnicianStatistics(@CurrentUser('id') userId: string) {
    return this.usersService.getTechnicianStatistics(userId);
  }

  @Get('me/realizations')
  @ApiOperation({ summary: 'Get technician realizations (portfolio)' })
  @ApiResponse({ status: 200, description: 'Realizations retrieved' })
  async getMyRealizations(@CurrentUser('id') userId: string) {
    return this.usersService.getRealizations(userId);
  }

  @Post('me/realizations')
  @ApiOperation({ summary: 'Add a realization to portfolio' })
  @ApiResponse({ status: 201, description: 'Realization added' })
  async addRealization(
    @CurrentUser('id') userId: string,
    @Body() dto: { title: string; description?: string; imageUrl: string },
  ) {
    return this.usersService.addRealization(userId, dto);
  }

  @Delete('me/realizations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a realization from portfolio' })
  @ApiParam({ name: 'id', description: 'Realization ID' })
  @ApiResponse({ status: 200, description: 'Realization deleted' })
  async deleteRealization(
    @CurrentUser('id') userId: string,
    @Param('id') realizationId: string,
  ) {
    return this.usersService.deleteRealization(userId, realizationId);
  }

  // ==========================================
  // PUBLIC TECHNICIAN ENDPOINTS
  // ==========================================

  @Public()
  @Get('technicians')
  @ApiOperation({ summary: 'List all technicians' })
  @ApiResponse({ status: 200, description: 'Technicians list' })
  async listTechnicians(@Query() query: QueryTechniciansDto) {
    return this.usersService.findAllTechnicians(query);
  }

  @Public()
  @Get('technicians/:id')
  @ApiOperation({ summary: 'Get technician profile by ID' })
  @ApiParam({ name: 'id', description: 'User ID of the technician' })
  @ApiResponse({ status: 200, description: 'Technician profile' })
  async getTechnicianProfile(@Param('id') id: string) {
    return this.usersService.getTechnicianProfile(id);
  }

  // ==========================================
  // USER BY ID OPERATIONS
  // ==========================================

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User profile' })
  async getUserById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  // ==========================================
  // ADMIN OPERATIONS
  // ==========================================

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'List all users (Admin/Manager only)' })
  @ApiResponse({ status: 200, description: 'Users list' })
  async listUsers(@Query() query: QueryUsersDto) {
    return this.usersService.findAllUsers(query);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Update user status (Admin/Manager only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User status updated' })
  async updateUserStatus(
    @Param('id') id: string,
    @Body('status') status: UserStatus,
  ) {
    return this.usersService.updateUserStatus(id, status);
  }

  @Patch(':id/verify-technician')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Verify technician (Admin/Manager only)' })
  @ApiParam({ name: 'id', description: 'User ID of the technician' })
  @ApiResponse({ status: 200, description: 'Technician verified' })
  async verifyTechnician(@Param('id') id: string) {
    return this.usersService.verifyTechnician(id);
  }

  @Patch(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Deactivate user account (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Account deactivated' })
  async deactivateUser(
    @Param('id') id: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.usersService.deactivateAccount(id, currentUserId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user account (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.usersService.deleteAccount(id, currentUserId);
  }
}
