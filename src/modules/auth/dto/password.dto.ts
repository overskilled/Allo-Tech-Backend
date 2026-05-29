import { IsString, MinLength, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
  @ApiProperty({ description: 'Temporary token returned by verify-reset-otp' })
  @IsString()
  tempToken: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
  })
  newPassword: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  confirmPassword: string;
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
