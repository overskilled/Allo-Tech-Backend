import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemSettingsDto, DEFAULT_SETTINGS } from './dto/settings.dto';

// In-memory cache for settings (for performance)
interface SettingsCache {
  data: Record<string, any>;
  lastUpdated: Date;
}

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private cache: SettingsCache = {
    data: { ...DEFAULT_SETTINGS },
    lastUpdated: new Date(),
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {}

  async onModuleInit() {
    // Load settings from database on startup
    await this.loadSettings();
  }

  // ==========================================
  // SETTINGS MANAGEMENT
  // ==========================================

  async loadSettings() {
    try {
      // Check if SystemSetting model exists (it may need to be added to schema)
      // For now, we'll use a simple key-value approach with a JSON file or env vars
      // In production, you'd want to store these in the database

      // Merge defaults with any stored settings
      this.cache.data = { ...DEFAULT_SETTINGS };
      this.cache.lastUpdated = new Date();

      this.logger.log('System settings loaded');
    } catch (error) {
      this.logger.error('Failed to load settings, using defaults', (error as any).message);
    }
  }

  async getAllSettings(): Promise<Record<string, any>> {
    return this.cache.data;
  }

  async getSetting<T = any>(key: string): Promise<T | undefined> {
    const keys = key.split('.');
    let value: any = this.cache.data;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }

    return value as T;
  }

  async updateSettings(dto: SystemSettingsDto): Promise<Record<string, any>> {
    // Update cache with new values
    Object.entries(dto).forEach(([key, value]) => {
      if (value !== undefined) {
        this.cache.data[key] = value;
      }
    });

    this.cache.lastUpdated = new Date();

    // In production, persist to database here
    this.logger.log('System settings updated');

    return this.cache.data;
  }

  async updateSetting(key: string, value: any): Promise<void> {
    const keys = key.split('.');

    if (keys.length === 1) {
      this.cache.data[key] = value;
    } else {
      // Handle nested keys
      let obj = this.cache.data;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in obj)) {
          obj[keys[i]] = {};
        }
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
    }

    this.cache.lastUpdated = new Date();
  }

  async resetToDefaults(): Promise<Record<string, any>> {
    this.cache.data = { ...DEFAULT_SETTINGS };
    this.cache.lastUpdated = new Date();

    this.logger.log('System settings reset to defaults');

    return this.cache.data;
  }

  // ==========================================
  // FEATURE FLAGS
  // ==========================================

  async getFeatureFlags(): Promise<Record<string, boolean>> {
    return this.cache.data.features || {};
  }

  async isFeatureEnabled(feature: string): Promise<boolean> {
    const features = this.cache.data.features || {};
    return features[feature] === true;
  }

  async setFeatureFlag(feature: string, enabled: boolean): Promise<void> {
    if (!this.cache.data.features) {
      this.cache.data.features = {};
    }
    this.cache.data.features[feature] = enabled;
    this.cache.lastUpdated = new Date();

    this.logger.log(`Feature flag '${feature}' set to ${enabled}`);
  }

  // ==========================================
  // MAINTENANCE MODE
  // ==========================================

  async isMaintenanceMode(): Promise<boolean> {
    return this.cache.data.maintenanceMode === true;
  }

  async setMaintenanceMode(enabled: boolean, message?: string): Promise<void> {
    this.cache.data.maintenanceMode = enabled;
    if (message) {
      this.cache.data.maintenanceMessage = message;
    }
    this.cache.lastUpdated = new Date();

    this.logger.log(`Maintenance mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  async getMaintenanceMessage(): Promise<string> {
    return this.cache.data.maintenanceMessage || 'System under maintenance';
  }

  // ==========================================
  // REGISTRATION SETTINGS
  // ==========================================

  async isRegistrationEnabled(): Promise<boolean> {
    return this.cache.data.registrationEnabled !== false;
  }

  async getTrialDurationDays(): Promise<number> {
    return this.cache.data.trialDurationDays || 14;
  }

  async isEmailVerificationRequired(): Promise<boolean> {
    return this.cache.data.requireEmailVerification !== false;
  }

  // ==========================================
  // PLATFORM SETTINGS
  // ==========================================

  async getDefaultCurrency(): Promise<string> {
    return this.cache.data.defaultCurrency || 'XAF';
  }

  async getDefaultLanguage(): Promise<string> {
    return this.cache.data.defaultLanguage || 'fr';
  }

  async getCommissionRate(): Promise<number> {
    return this.cache.data.commissionRate || 10;
  }

  // ==========================================
  // LIMITS
  // ==========================================

  async getMaxImagesPerNeed(): Promise<number> {
    return this.cache.data.maxImagesPerNeed || 5;
  }

  async getMaxFileSizeMb(): Promise<number> {
    return this.cache.data.maxFileSizeMb || 10;
  }

  // ==========================================
  // NOTIFICATION SETTINGS
  // ==========================================

  async isPushNotificationsEnabled(): Promise<boolean> {
    return this.cache.data.pushNotificationsEnabled !== false;
  }

  async isEmailNotificationsEnabled(): Promise<boolean> {
    return this.cache.data.emailNotificationsEnabled !== false;
  }

  // ==========================================
  // SUPPORT SETTINGS
  // ==========================================

  async getSupportEmail(): Promise<string> {
    return this.cache.data.supportEmail || 'support@allotech.com';
  }

  async getSupportPhone(): Promise<string> {
    return this.cache.data.supportPhone || '';
  }

  // ==========================================
  // PUBLIC SETTINGS (for clients)
  // ==========================================

  async getPublicSettings(): Promise<Record<string, any>> {
    return {
      maintenanceMode: this.cache.data.maintenanceMode,
      maintenanceMessage: this.cache.data.maintenanceMessage,
      registrationEnabled: this.cache.data.registrationEnabled,
      defaultCurrency: this.cache.data.defaultCurrency,
      defaultLanguage: this.cache.data.defaultLanguage,
      maxImagesPerNeed: this.cache.data.maxImagesPerNeed,
      maxFileSizeMb: this.cache.data.maxFileSizeMb,
      supportEmail: this.cache.data.supportEmail,
      supportPhone: this.cache.data.supportPhone,
      features: this.cache.data.features,
    };
  }
}
