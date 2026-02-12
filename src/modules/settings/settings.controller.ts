import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
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
import { Public } from '../auth/decorators/public.decorator';
import { SettingsService } from './settings.service';
import { SystemSettingsDto, UpdateSettingDto, FeatureFlagDto } from './dto/settings.dto';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ==========================================
  // PUBLIC ENDPOINTS
  // ==========================================

  @Get('public')
  @Public()
  @ApiOperation({ summary: 'Get public system settings' })
  @ApiResponse({ status: 200, description: 'Returns public settings' })
  getPublicSettings() {
    return this.settingsService.getPublicSettings();
  }

  @Get('maintenance')
  @Public()
  @ApiOperation({ summary: 'Check maintenance mode status' })
  @ApiResponse({ status: 200, description: 'Returns maintenance status' })
  async getMaintenanceStatus() {
    const isEnabled = await this.settingsService.isMaintenanceMode();
    const message = await this.settingsService.getMaintenanceMessage();
    return { maintenanceMode: isEnabled, message };
  }

  // ==========================================
  // ADMIN ENDPOINTS
  // ==========================================

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all system settings (admin)' })
  @ApiResponse({ status: 200, description: 'Returns all settings' })
  getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  @Get(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific setting by key' })
  @ApiResponse({ status: 200, description: 'Returns the setting value' })
  async getSetting(@Param('key') key: string) {
    const value = await this.settingsService.getSetting(key);
    return { key, value };
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update multiple system settings' })
  @ApiResponse({ status: 200, description: 'Settings updated' })
  updateSettings(@Body() dto: SystemSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }

  @Put('single')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a single setting' })
  @ApiResponse({ status: 200, description: 'Setting updated' })
  async updateSingleSetting(@Body() dto: UpdateSettingDto) {
    await this.settingsService.updateSetting(dto.key, dto.value);
    return { success: true, key: dto.key, value: dto.value };
  }

  @Post('reset')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset all settings to defaults' })
  @ApiResponse({ status: 200, description: 'Settings reset' })
  resetToDefaults() {
    return this.settingsService.resetToDefaults();
  }

  // ==========================================
  // FEATURE FLAGS
  // ==========================================

  @Get('features/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all feature flags' })
  @ApiResponse({ status: 200, description: 'Returns feature flags' })
  getFeatureFlags() {
    return this.settingsService.getFeatureFlags();
  }

  @Put('features/:feature')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set a feature flag' })
  @ApiResponse({ status: 200, description: 'Feature flag updated' })
  async setFeatureFlag(
    @Param('feature') feature: string,
    @Body('enabled') enabled: boolean,
  ) {
    await this.settingsService.setFeatureFlag(feature, enabled);
    return { feature, enabled };
  }

  // ==========================================
  // MAINTENANCE MODE
  // ==========================================

  @Post('maintenance/enable')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable maintenance mode' })
  @ApiResponse({ status: 200, description: 'Maintenance mode enabled' })
  async enableMaintenanceMode(@Body('message') message?: string) {
    await this.settingsService.setMaintenanceMode(true, message);
    return { maintenanceMode: true, message };
  }

  @Post('maintenance/disable')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable maintenance mode' })
  @ApiResponse({ status: 200, description: 'Maintenance mode disabled' })
  async disableMaintenanceMode() {
    await this.settingsService.setMaintenanceMode(false);
    return { maintenanceMode: false };
  }
}
