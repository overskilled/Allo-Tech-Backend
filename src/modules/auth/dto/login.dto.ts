import { IsEmail, IsString, IsOptional, MinLength, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  // Backward-compatible: the web frontend still sends `email`.
  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  // Mobile guest-gate sends `identifier`, which may be an email OR a phone
  // number. The service resolves which one it is.
  @ApiPropertyOptional({ example: '+237612345678 (or john@example.com)' })
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class AppleAuthDto {
  @ApiProperty({ description: 'Apple identity token (JWT) from the device' })
  @IsString()
  identityToken: string;

  // Apple only returns the name on the FIRST authorization, so the client
  // forwards it when present so we can populate the new account.
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  lastName?: string;
}

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID token from mobile app', required: false })
  @IsString()
  @IsOptional()
  idToken?: string;

  @ApiProperty({ description: 'Google access token from web OAuth flow', required: false })
  @IsString()
  @IsOptional()
  accessToken?: string;

  // Intended role when signing up via Google. Only applied when CREATING a new
  // user; an existing account's role is never changed. Lets "Devenir un
  // technicien" + Google produce a technician instead of always a client.
  @ApiProperty({ description: 'Intended role for a new Google signup', required: false, enum: ['CLIENT', 'TECHNICIAN'] })
  @IsOptional()
  @IsIn(['CLIENT', 'TECHNICIAN'])
  role?: 'CLIENT' | 'TECHNICIAN';
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  refreshToken: string;
}
