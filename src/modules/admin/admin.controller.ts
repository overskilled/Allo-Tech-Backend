import {
  Controller,
  Get,
  Put,
  Post,
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
import { AdminService } from './admin.service';
import {
  QueryUsersDto,
  UpdateUserStatusDto,
  VerifyTechnicianDto,
  SuspendUserDto,
  DateRangeDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ==========================================
  // DASHBOARD
  // ==========================================

  @Get('dashboard')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Returns dashboard stats' })
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('dashboard/growth')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get user growth statistics' })
  @ApiResponse({ status: 200, description: 'Returns growth stats' })
  getGrowthStats(@Query() range: DateRangeDto) {
    return this.adminService.getGrowthStats(range);
  }

  @Get('dashboard/revenue')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get revenue statistics' })
  @ApiResponse({ status: 200, description: 'Returns revenue stats' })
  getRevenueStats(@Query() range: DateRangeDto) {
    return this.adminService.getRevenueStats(range);
  }

  @Get('dashboard/activity')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get recent activity' })
  @ApiResponse({ status: 200, description: 'Returns recent activities' })
  getRecentActivity(@Query('limit') limit?: number) {
    return this.adminService.getRecentActivity(limit || 50);
  }

  // ==========================================
  // USER MANAGEMENT
  // ==========================================

  @Get('users')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'Returns users' })
  getUsers(@Query() query: QueryUsersDto) {
    return this.adminService.getUsers(query);
  }

  @Get('users/:id')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'Returns user details' })
  getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Put('users/:id/status')
  @ApiOperation({ summary: 'Update user status' })
  @ApiResponse({ status: 200, description: 'User status updated' })
  updateUserStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.adminService.updateUserStatus(id, dto);
  }

  @Post('users/:id/suspend')
  @ApiOperation({ summary: 'Suspend user' })
  @ApiResponse({ status: 200, description: 'User suspended' })
  suspendUser(@Param('id') id: string, @Body() dto: SuspendUserDto) {
    return this.adminService.suspendUser(id, dto);
  }

  @Post('users/:id/reactivate')
  @ApiOperation({ summary: 'Reactivate suspended user' })
  @ApiResponse({ status: 200, description: 'User reactivated' })
  reactivateUser(@Param('id') id: string) {
    return this.adminService.reactivateUser(id);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete user (soft delete)' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // ==========================================
  // TECHNICIAN VERIFICATION
  // ==========================================

  @Get('verifications')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get pending technician verifications' })
  @ApiResponse({ status: 200, description: 'Returns pending verifications' })
  getPendingVerifications(@Query() query: QueryUsersDto) {
    return this.adminService.getPendingVerifications(query);
  }

  @Post('verifications/:userId/approve')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Approve technician verification' })
  @ApiResponse({ status: 200, description: 'Technician verified' })
  verifyTechnician(@Param('userId') userId: string, @Body() dto: VerifyTechnicianDto) {
    return this.adminService.verifyTechnician(userId, dto);
  }

  @Post('verifications/:userId/reject')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Reject technician verification' })
  @ApiResponse({ status: 200, description: 'Verification rejected' })
  rejectVerification(
    @Param('userId') userId: string,
    @Body('reason') reason: string,
  ) {
    return this.adminService.rejectVerification(userId, reason);
  }
}
