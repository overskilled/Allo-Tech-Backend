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
import { ManagerService } from './manager.service';
import {
  CreateAdvertisementDto,
  UpdateAdvertisementDto,
  QueryAdvertisementsDto,
  FeatureTechnicianDto,
  AssistUserDto,
  QueryUsersForAssistanceDto,
} from './dto/manager.dto';
import { ActivateLicenseDto, RenewLicenseDto } from '../licenses/dto/license.dto';

@ApiTags('Manager')
@Controller('manager')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiBearerAuth()
export class ManagerController {
  constructor(private readonly managerService: ManagerService) {}

  // ==========================================
  // DASHBOARD
  // ==========================================

  @Get('dashboard')
  @ApiOperation({ summary: 'Get manager dashboard overview' })
  @ApiResponse({ status: 200, description: 'Returns dashboard stats' })
  getDashboard() {
    return this.managerService.getManagerDashboard();
  }

  // ==========================================
  // ACCOUNT VALIDATION
  // ==========================================

  @Get('accounts/pending')
  @ApiOperation({ summary: 'Get pending account validations' })
  @ApiResponse({ status: 200, description: 'Returns pending accounts' })
  getPendingAccounts(@Query() query: QueryUsersForAssistanceDto) {
    return this.managerService.getPendingAccounts(query);
  }

  @Post('accounts/:userId/validate')
  @ApiOperation({ summary: 'Validate a user account' })
  @ApiResponse({ status: 200, description: 'Account validated' })
  validateAccount(
    @Param('userId') userId: string,
    @CurrentUser('id') managerId: string,
  ) {
    return this.managerService.validateAccount(userId, managerId);
  }

  @Post('accounts/:userId/reject')
  @ApiOperation({ summary: 'Reject a user account' })
  @ApiResponse({ status: 200, description: 'Account rejected' })
  rejectAccount(
    @Param('userId') userId: string,
    @Body('reason') reason: string,
  ) {
    return this.managerService.rejectAccount(userId, reason);
  }

  // ==========================================
  // LICENSE MANAGEMENT
  // ==========================================

  @Get('licenses')
  @ApiOperation({ summary: 'Get all licenses' })
  @ApiResponse({ status: 200, description: 'Returns licenses' })
  getLicenses(@Query() query: any) {
    return this.managerService.getLicensesOverview(query);
  }

  @Get('licenses/expiring')
  @ApiOperation({ summary: 'Get licenses expiring soon' })
  @ApiResponse({ status: 200, description: 'Returns expiring licenses' })
  getExpiringLicenses(@Query('days') days?: number) {
    return this.managerService.getExpiringLicenses(days || 7);
  }

  @Post('licenses/:id/activate')
  @ApiOperation({ summary: 'Activate a license' })
  @ApiResponse({ status: 200, description: 'License activated' })
  activateLicense(@Param('id') id: string, @Body() dto: ActivateLicenseDto) {
    return this.managerService.activateLicense(id, dto);
  }

  @Post('licenses/:id/renew')
  @ApiOperation({ summary: 'Renew a license' })
  @ApiResponse({ status: 200, description: 'License renewed' })
  renewLicense(@Param('id') id: string, @Body() dto: RenewLicenseDto) {
    return this.managerService.renewLicense(id, dto);
  }

  // ==========================================
  // USER ASSISTANCE
  // ==========================================

  @Get('users')
  @ApiOperation({ summary: 'Get users for assistance' })
  @ApiResponse({ status: 200, description: 'Returns users' })
  getUsersForAssistance(@Query() query: QueryUsersForAssistanceDto) {
    return this.managerService.getUsersForAssistance(query);
  }

  @Post('users/assist')
  @ApiOperation({ summary: 'Assist a user' })
  @ApiResponse({ status: 200, description: 'User assisted' })
  assistUser(@CurrentUser('id') managerId: string, @Body() dto: AssistUserDto) {
    return this.managerService.assistUser(managerId, dto);
  }

  // ==========================================
  // ADVERTISEMENT MANAGEMENT
  // ==========================================

  @Get('advertisements')
  @ApiOperation({ summary: 'Get all advertisements' })
  @ApiResponse({ status: 200, description: 'Returns advertisements' })
  getAdvertisements(@Query() query: QueryAdvertisementsDto) {
    return this.managerService.getAdvertisements(query);
  }

  @Post('advertisements')
  @ApiOperation({ summary: 'Create an advertisement' })
  @ApiResponse({ status: 201, description: 'Advertisement created' })
  createAdvertisement(@Body() dto: CreateAdvertisementDto) {
    return this.managerService.createAdvertisement(dto);
  }

  @Put('advertisements/:id')
  @ApiOperation({ summary: 'Update an advertisement' })
  @ApiResponse({ status: 200, description: 'Advertisement updated' })
  updateAdvertisement(@Param('id') id: string, @Body() dto: UpdateAdvertisementDto) {
    return this.managerService.updateAdvertisement(id, dto);
  }

  @Delete('advertisements/:id')
  @ApiOperation({ summary: 'Delete an advertisement' })
  @ApiResponse({ status: 200, description: 'Advertisement deleted' })
  deleteAdvertisement(@Param('id') id: string) {
    return this.managerService.deleteAdvertisement(id);
  }

  @Post('advertisements/:id/impression')
  @ApiOperation({ summary: 'Record ad impression' })
  @ApiResponse({ status: 200, description: 'Impression recorded' })
  recordImpression(@Param('id') id: string) {
    return this.managerService.recordAdImpression(id);
  }

  @Post('advertisements/:id/click')
  @ApiOperation({ summary: 'Record ad click' })
  @ApiResponse({ status: 200, description: 'Click recorded' })
  recordClick(@Param('id') id: string) {
    return this.managerService.recordAdClick(id);
  }

  // ==========================================
  // FEATURED TECHNICIANS
  // ==========================================

  @Get('featured-technicians')
  @ApiOperation({ summary: 'Get featured technicians' })
  @ApiResponse({ status: 200, description: 'Returns featured technicians' })
  getFeaturedTechnicians(@Query('limit') limit?: number) {
    return this.managerService.getFeaturedTechnicians(limit || 10);
  }

  @Post('featured-technicians')
  @ApiOperation({ summary: 'Feature a technician' })
  @ApiResponse({ status: 200, description: 'Technician featured' })
  featureTechnician(@Body() dto: FeatureTechnicianDto) {
    return this.managerService.featureTechnician(dto);
  }

  @Delete('featured-technicians/:technicianId')
  @ApiOperation({ summary: 'Unfeature a technician' })
  @ApiResponse({ status: 200, description: 'Technician unfeatured' })
  unfeatureTechnician(@Param('technicianId') technicianId: string) {
    return this.managerService.unfeatureTechnician(technicianId);
  }
}
