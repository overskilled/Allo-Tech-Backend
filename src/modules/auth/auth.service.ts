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
import { MailService } from '../mail/mail.service';
import { RegisterDto, CompleteProfileClientDto, CompleteProfileTechnicianDto } from './dto/register.dto';
import { LoginDto, GoogleAuthDto } from './dto/login.dto';
import { ForgotPasswordDto, VerifyResetOtpDto, ResetPasswordDto, ChangePasswordDto } from './dto/password.dto';
import { UserRole, UserStatus } from '@prisma/client';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
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

    await this.mailService.sendEmailVerification(user.email, user.firstName || 'Utilisateur', emailVerifyToken);

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
      let email: string;
      let sub: string;
      let givenName: string;
      let familyName: string;
      let picture: string | undefined;

      if (dto.idToken) {
        // Mobile flow: verify ID token directly
        const ticket = await this.googleClient.verifyIdToken({
          idToken: dto.idToken,
          audience: this.configService.get('GOOGLE_CLIENT_ID'),
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
          throw new UnauthorizedException('Invalid Google token');
        }
        email = payload.email;
        sub = payload.sub;
        givenName = payload.given_name || 'User';
        familyName = payload.family_name || '';
        picture = payload.picture;
      } else if (dto.accessToken) {
        // Web flow: fetch user info using access token
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${dto.accessToken}` },
        });
        if (!res.ok) {
          throw new UnauthorizedException('Invalid Google access token');
        }
        const userInfo = (await res.json()) as {
          email?: string;
          sub?: string;
          given_name?: string;
          family_name?: string;
          picture?: string;
        };
        if (!userInfo.email || !userInfo.sub) {
          throw new UnauthorizedException('Invalid Google token');
        }
        email = userInfo.email;
        sub = userInfo.sub;
        givenName = userInfo.given_name || 'User';
        familyName = userInfo.family_name || '';
        picture = userInfo.picture;
      } else {
        throw new BadRequestException('Either idToken or accessToken is required');
      }

      let user = await this.prisma.user.findUnique({
        where: { email },
      });

      const isNewUser = !user;

      if (!user) {
        // Create new user from Google data
        user = await this.prisma.user.create({
          data: {
            email,
            firstName: givenName,
            lastName: familyName,
            googleId: sub,
            authProvider: 'google',
            profileImage: picture,
            emailVerified: true,
            status: UserStatus.PENDING_VERIFICATION, // Still needs to complete profile
          },
        });
      } else if (!user.googleId) {
        // Link Google account to existing user
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: sub,
            authProvider: 'google',
            emailVerified: true,
            profileImage: user.profileImage || picture,
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
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new BadRequestException('User not found');

    // Prevent agents/admins from having their role overwritten
    if (existing.role === UserRole.AGENT || existing.role === UserRole.ADMIN) {
      throw new BadRequestException('Cannot change role for this account type');
    }

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

    // Prevent agents/admins from accidentally completing a client profile
    if (user.role === UserRole.AGENT || user.role === UserRole.ADMIN) {
      throw new BadRequestException('Cannot complete client profile for this account type');
    }

    // Update user phone and avatar
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone: dto.phone,
        role: UserRole.CLIENT,
        status: UserStatus.TRIAL, // Activate account
        ...(dto.profileImage && { profileImage: dto.profileImage }),
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
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      update: {
        neighborhood: dto.neighborhood,
        city: dto.city,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
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

    await this.mailService.sendWelcome(user.email, user.firstName || 'Utilisateur', 'client');

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

    // Prevent agents/admins from accidentally completing a technician profile
    if (user.role === UserRole.AGENT || user.role === UserRole.ADMIN) {
      throw new BadRequestException('Cannot complete technician profile for this account type');
    }

    // Update user phone and avatar
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone: dto.phone,
        role: UserRole.TECHNICIAN,
        status: UserStatus.TRIAL,
        ...(dto.profileImage && { profileImage: dto.profileImage }),
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
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      update: {
        profession: dto.profession,
        specialties: JSON.stringify(dto.specialties),
        studies: dto.studies,
        certifications: dto.certifications ? JSON.stringify(dto.certifications) : null,
        neighborhood: dto.neighborhood,
        city: dto.city,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
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

    await this.mailService.sendWelcome(user.email, user.firstName || 'Utilisateur', 'technicien');

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
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Always return the same message to avoid email enumeration
    const genericMsg = 'Si ce compte existe, un code de vérification a été envoyé';

    if (!user) return { message: genericMsg };

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetOtp: otpHash,
        passwordResetOtpExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        // Clear any previous temp token
        passwordResetTempToken: null,
        passwordResetTempExpires: null,
      },
    });

    await this.mailService.sendPasswordResetOtp(
      user.email,
      user.firstName || 'Utilisateur',
      otp,
    );

    return { message: genericMsg };
  }

  async verifyResetOtp(dto: VerifyResetOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    const invalid = () => new BadRequestException('Code invalide ou expiré');

    if (!user || !user.passwordResetOtp || !user.passwordResetOtpExpires) {
      throw invalid();
    }

    if (new Date() > user.passwordResetOtpExpires) {
      // Clean up expired OTP
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetOtp: null, passwordResetOtpExpires: null },
      });
      throw new BadRequestException('Code expiré. Veuillez en demander un nouveau.');
    }

    const isValid = await bcrypt.compare(dto.otp, user.passwordResetOtp);
    if (!isValid) throw invalid();

    // OTP is correct — issue a short-lived temp token
    const tempToken = uuidv4();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetOtp: null,
        passwordResetOtpExpires: null,
        passwordResetTempToken: tempToken,
        passwordResetTempExpires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    return { tempToken };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Les mots de passe ne correspondent pas');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetTempToken: dto.tempToken,
        passwordResetTempExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Session expirée. Veuillez recommencer la réinitialisation.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTempToken: null,
        passwordResetTempExpires: null,
      },
    });

    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    });

    return { message: 'Mot de passe réinitialisé avec succès' };
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

    await this.mailService.sendEmailVerification(user.email, user.firstName || 'Utilisateur', emailVerifyToken);

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
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 86400, // 1 day in seconds
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
