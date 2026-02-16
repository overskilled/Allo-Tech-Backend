import { IsEmail, IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;
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
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  refreshToken: string;
}
