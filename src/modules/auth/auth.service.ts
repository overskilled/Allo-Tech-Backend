import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto, CompleteProfileClientDto, CompleteProfileTechnicianDto } from './dto/register.dto';
import { LoginDto, GoogleAuthDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto } from './dto/password.dto';
import { UserRole, UserStatus } from '@prisma/client';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get('GOOGLE_CLIENT_ID'),
    );
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const emailVerifyToken = uuidv4();

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        phone: dto.phone,
        status: UserStatus.PENDING_VERIFICATION,
        emailVerifyToken,
        emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // In production, send verification email here
    // await this.emailService.sendVerificationEmail(user.email, emailVerifyToken);

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      message: 'Registration successful. Please verify your email.',
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account is suspended');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const profile = await this.getUserProfile(user.id, user.role);

    return {
      user: this.sanitizeUser(user),
      profile,
      ...tokens,
    };
  }

  async googleAuth(dto: GoogleAuthDto) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: this.configService.get('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();

      if (!payload || !payload.email) {
        throw new UnauthorizedException('Invalid Google token');
      }

      let user = await this.prisma.user.findUnique({
        where: { email: payload.email },
      });

      const isNewUser = !user;

      if (!user) {
        // Create new user from Google data
        user = await this.prisma.user.create({
          data: {
            email: payload.email,
            firstName: payload.given_name || 'User',
            lastName: payload.family_name || '',
            googleId: payload.sub,
            authProvider: 'google',
            profileImage: payload.picture,
            emailVerified: true,
            status: UserStatus.PENDING_VERIFICATION, // Still needs to complete profile
          },
        });
      } else if (!user.googleId) {
        // Link Google account to existing user
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: payload.sub,
            authProvider: 'google',
            emailVerified: true,
            profileImage: user.profileImage || payload.picture,
          },
        });
      }

      if (user.status === 'SUSPENDED') {
        throw new UnauthorizedException('Account is suspended');
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      const tokens = await this.generateTokens(user.id, user.email, user.role);
      const profile = await this.getUserProfile(user.id, user.role);

      return {
        isNewUser,
        user: this.sanitizeUser(user),
        profile,
        ...tokens,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Google authentication failed');
    }
  }

  async selectRole(userId: string, role: 'CLIENT' | 'TECHNICIAN') {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: role as UserRole },
    });

    return {
      message: 'Role selected successfully',
      user: this.sanitizeUser(user),
    };
  }

  async completeClientProfile(userId: string, dto: CompleteProfileClientDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Update user phone
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone: dto.phone,
        role: UserRole.CLIENT,
        status: UserStatus.TRIAL, // Activate account
      },
    });

    // Create or update client profile
    const profile = await this.prisma.clientProfile.upsert({
      where: { userId },
      create: {
        userId,
        neighborhood: dto.neighborhood,
        city: dto.city,
        address: dto.address,
      },
      update: {
        neighborhood: dto.neighborhood,
        city: dto.city,
        address: dto.address,
      },
    });

    // Create trial license
    await this.prisma.license.upsert({
      where: { userId },
      create: {
        userId,
        status: 'TRIAL',
        trialStartDate: new Date(),
        trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days trial
      },
      update: {},
    });

    return {
      message: 'Profile completed successfully',
      profile,
    };
  }

  async completeTechnicianProfile(userId: string, dto: CompleteProfileTechnicianDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Update user phone
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone: dto.phone,
        role: UserRole.TECHNICIAN,
        status: UserStatus.TRIAL,
      },
    });

    // Create or update technician profile
    const profile = await this.prisma.technicianProfile.upsert({
      where: { userId },
      create: {
        userId,
        profession: dto.profession,
        specialties: JSON.stringify(dto.specialties),
        studies: dto.studies,
        certifications: dto.certifications ? JSON.stringify(dto.certifications) : null,
        neighborhood: dto.neighborhood,
        city: dto.city,
        address: dto.address,
      },
      update: {
        profession: dto.profession,
        specialties: JSON.stringify(dto.specialties),
        studies: dto.studies,
        certifications: dto.certifications ? JSON.stringify(dto.certifications) : null,
        neighborhood: dto.neighborhood,
        city: dto.city,
        address: dto.address,
      },
    });

    // Create trial license
    await this.prisma.license.upsert({
      where: { userId },
      create: {
        userId,
        status: 'TRIAL',
        trialStartDate: new Date(),
        trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days trial
      },
      update: {},
    });

    return {
      message: 'Profile completed successfully',
      profile,
    };
  }

  async refreshToken(refreshToken: string) {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    const tokens = await this.generateTokens(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.role,
    );

    return tokens;
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          token: refreshToken,
        },
        data: { revokedAt: new Date() },
      });
    } else {
      // Revoke all tokens for user
      await this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Logged out successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // Don't reveal if email exists
      return { message: 'If the email exists, a reset link has been sent' };
    }

    const resetToken = uuidv4();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // In production, send reset email here
    // await this.emailService.sendPasswordResetEmail(user.email, resetToken);

    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: dto.token,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    });

    return { message: 'Password reset successful' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      throw new BadRequestException('User not found or uses OAuth');
    }

    const isPasswordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);

    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password changed successfully' };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerifyToken: token,
        emailVerifyExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpires: null,
      },
    });

    return { message: 'Email verified successfully' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        clientProfile: true,
        technicianProfile: true,
        license: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      user: this.sanitizeUser(user),
      profile: user.role === 'CLIENT' ? user.clientProfile : user.technicianProfile,
      license: user.license,
    };
  }

  // ==========================================
  // SESSION MANAGEMENT
  // ==========================================

  async getActiveSessions(userId: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
      count: sessions.length,
    };
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.refreshToken.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
    });

    if (!session) {
      throw new BadRequestException('Session not found');
    }

    await this.prisma.refreshToken.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    return { message: 'Session revoked successfully' };
  }

  async revokeAllSessions(userId: string, exceptCurrentToken?: string) {
    const where: any = {
      userId,
      revokedAt: null,
    };

    if (exceptCurrentToken) {
      where.token = { not: exceptCurrentToken };
    }

    await this.prisma.refreshToken.updateMany({
      where,
      data: { revokedAt: new Date() },
    });

    return { message: 'All sessions revoked successfully' };
  }

  // ==========================================
  // ACCOUNT MANAGEMENT
  // ==========================================

  async deactivateAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Update user status
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.INACTIVE },
    });

    // Revoke all sessions
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });

    return { message: 'Account deactivated successfully' };
  }

  async reactivateAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.status !== 'INACTIVE') {
      throw new BadRequestException('Account is not deactivated');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    });

    return { message: 'Account reactivated successfully' };
  }

  async resendVerificationEmail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    const emailVerifyToken = uuidv4();

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifyToken,
        emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // In production, send verification email here
    // await this.emailService.sendVerificationEmail(user.email, emailVerifyToken);

    return { message: 'Verification email sent' };
  }

  // Private helper methods

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET', 'your-secret-key'),
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = uuidv4();

    // Store refresh token
    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  private async getUserProfile(userId: string, role: string) {
    if (role === 'CLIENT') {
      return this.prisma.clientProfile.findUnique({ where: { userId } });
    } else if (role === 'TECHNICIAN') {
      return this.prisma.technicianProfile.findUnique({ where: { userId } });
    }
    return null;
  }

  private sanitizeUser(user: any) {
    const { passwordHash, emailVerifyToken, passwordResetToken, ...sanitized } = user;
    return sanitized;
  }
}
