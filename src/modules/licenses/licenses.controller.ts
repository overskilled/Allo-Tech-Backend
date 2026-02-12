import {
  Controller,
  Get,
  Post,
  Put,
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
import { LicensesService } from './licenses.service';
import {
  ActivateLicenseDto,
  RenewLicenseDto,
  UpdateLicenseDto,
} from './dto/license.dto';

@ApiTags('Licenses')
@Controller('licenses')
export class LicensesController {
  constructor(private readonly licensesService: LicensesService) {}

  // ==========================================
  // USER ENDPOINTS
  // ==========================================

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my license' })
  @ApiResponse({ status: 200, description: 'Returns user license' })
  getMyLicense(@CurrentUser('id') userId: string) {
    return this.licensesService.getMyLicense(userId);
  }

  @Get('my/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check my license status' })
  @ApiResponse({ status: 200, description: 'Returns license status' })
  checkMyStatus(@CurrentUser('id') userId: string) {
    return this.licensesService.checkLicenseStatus(userId);
  }

  @Post('my/trial')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TECHNICIAN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start trial license (technician only)' })
  @ApiResponse({ status: 201, description: 'Trial license created' })
  startTrial(@CurrentUser('id') userId: string) {
    return this.licensesService.createTrialLicense(userId);
  }

  @Put('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update my license settings' })
  @ApiResponse({ status: 200, description: 'License updated' })
  async updateMyLicense(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateLicenseDto,
  ) {
    const license = await this.licensesService.getLicenseByUserId(userId);
    return this.licensesService.updateLicense(license!.id, userId, dto);
  }

  @Post('my/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel my license (disable auto-renew)' })
  @ApiResponse({ status: 200, description: 'License cancelled' })
  async cancelMyLicense(@CurrentUser('id') userId: string) {
    const license = await this.licensesService.getLicenseByUserId(userId);
    return this.licensesService.cancelLicense(license!.id, userId);
  }

  // ==========================================
  // PUBLIC ENDPOINTS
  // ==========================================

  @Get('pricing')
  @Public()
  @ApiOperation({ summary: 'Get license pricing' })
  @ApiResponse({ status: 200, description: 'Returns pricing information' })
  getPricing() {
    return this.licensesService.getPricing();
  }

  // ==========================================
  // ADMIN ENDPOINTS
  // ==========================================

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all licenses (admin)' })
  @ApiResponse({ status: 200, description: 'Returns all licenses' })
  getAllLicenses(
    @Query('status') status?: string,
    @Query('plan') plan?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.licensesService.getAllLicenses({ status, plan, page, limit });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get license by ID (admin)' })
  @ApiResponse({ status: 200, description: 'Returns the license' })
  getLicenseById(@Param('id') id: string) {
    return this.licensesService.getLicenseById(id);
  }

  @Post(':id/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate a license (admin)' })
  @ApiResponse({ status: 200, description: 'License activated' })
  activateLicense(@Param('id') id: string, @Body() dto: ActivateLicenseDto) {
    return this.licensesService.activateLicense(id, dto);
  }

  @Post(':id/renew')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Renew a license (admin)' })
  @ApiResponse({ status: 200, description: 'License renewed' })
  renewLicense(@Param('id') id: string, @Body() dto: RenewLicenseDto) {
    return this.licensesService.renewLicense(id, dto);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get license by user ID (admin)' })
  @ApiResponse({ status: 200, description: 'Returns user license' })
  getLicenseByUserId(@Param('userId') userId: string) {
    return this.licensesService.getMyLicense(userId);
  }

  @Post('process/expiring')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process expiring licenses (send warnings)' })
  @ApiResponse({ status: 200, description: 'Processing complete' })
  processExpiring() {
    return this.licensesService.processExpiringLicenses();
  }

  @Post('process/expired')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process expired licenses' })
  @ApiResponse({ status: 200, description: 'Processing complete' })
  processExpired() {
    return this.licensesService.processExpiredLicenses();
  }
}
