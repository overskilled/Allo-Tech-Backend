import {
  IsString,
  MinLength,
  Matches,
  Length,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    description:
      'Account identifier — an email address OR a phone number in E.164 format (e.g. "+237680000000"). The OTP is delivered by email or SMS accordingly.',
    example: '+237680000000',
  })
  @IsString()
  @MinLength(3)
  identifier: string;
}

export class VerifyResetOtpDto {
  @ApiProperty({
    description: 'Same identifier used in /auth/forgot-password (email or E.164 phone).',
    example: '+237680000000',
  })
  @IsString()
  @MinLength(3)
  identifier: string;

  @ApiProperty({ example: '482951' })
  @IsString()
  @Length(6, 6, { message: 'Le code OTP doit contenir exactement 6 chiffres' })
  otp: string;
}

export class ResetPasswordDto {
  // The OTP flow sends `tempToken`; the web reset link sends `token`. Both are
  // accepted (resolved in the service) so a single endpoint serves both paths.
  @ApiPropertyOptional({ description: 'Temporary token returned by verify-reset-otp' })
  @IsOptional()
  @IsString()
  tempToken?: string;

  @ApiPropertyOptional({ description: 'Reset token carried by the web reset link (alias of tempToken)' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
  })
  newPassword: string;

  // Optional: the web page validates the match client-side and may omit this.
  // When present, the service still enforces it.
  @ApiPropertyOptional({ example: 'NewSecurePass123!' })
  @IsOptional()
  @IsString()
  confirmPassword?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
  })
  newPassword: string;
}
