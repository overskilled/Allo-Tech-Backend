import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export enum LicensePlan {
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
}

export class CreateLicenseDto {
  @ApiProperty({ description: 'User ID to create license for' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({ enum: LicensePlan, default: LicensePlan.BASIC })
  @IsOptional()
  @IsEnum(LicensePlan)
  plan?: LicensePlan;
}

export class ActivateLicenseDto {
  @ApiProperty({ enum: LicensePlan })
  @IsEnum(LicensePlan)
  plan: LicensePlan;

  @ApiPropertyOptional({ description: 'License start date (defaults to now)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ description: 'License end date' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Enable auto-renewal', default: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  autoRenew?: boolean;
}

export class RenewLicenseDto {
  @ApiPropertyOptional({ enum: LicensePlan, description: 'Optionally change plan' })
  @IsOptional()
  @IsEnum(LicensePlan)
  plan?: LicensePlan;

  @ApiProperty({ description: 'New end date' })
  @IsDateString()
  endDate: string;
}

export class UpdateLicenseDto {
  @ApiPropertyOptional({ enum: LicensePlan })
  @IsOptional()
  @IsEnum(LicensePlan)
  plan?: LicensePlan;

  @ApiPropertyOptional({ description: 'Enable/disable auto-renewal' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  autoRenew?: boolean;
}

// License plan pricing (in XAF)
export const LICENSE_PRICING = {
  [LicensePlan.BASIC]: {
    monthly: 5000,
    yearly: 50000,
    features: [
      'Profil technicien basique',
      'Jusqu\'à 10 candidatures/mois',
      'Messagerie',
      'Notifications',
    ],
  },
  [LicensePlan.PREMIUM]: {
    monthly: 15000,
    yearly: 150000,
    features: [
      'Tout le plan Basic',
      'Candidatures illimitées',
      'Badge vérifié prioritaire',
      'Statistiques avancées',
      'Support prioritaire',
    ],
  },
  [LicensePlan.ENTERPRISE]: {
    monthly: 35000,
    yearly: 350000,
    features: [
      'Tout le plan Premium',
      'Gestion d\'équipe',
      'API access',
      'Account manager dédié',
      'Formation personnalisée',
    ],
  },
};

export const TRIAL_DURATION_DAYS = 14;
