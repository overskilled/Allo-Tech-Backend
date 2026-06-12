import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { RegisterDto, CompleteProfileClientDto, CompleteProfileTechnicianDto } from './dto/register.dto';
import { LoginDto, GoogleAuthDto, AppleAuthDto } from './dto/login.dto';
import { ForgotPasswordDto, VerifyResetOtpDto, ResetPasswordDto, ChangePasswordDto } from './dto/password.dto';
import { UserRole, UserStatus } from '@prisma/client';
import { AnalyticsService, ANALYTICS_EVENTS } from '../analytics/analytics.service';

// Apple's public keys for verifying the identity token (rotated by Apple;
// `jose` caches and refreshes them automatically).
const APPLE_JWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);
const APPLE_ISSUER = 'https://appleid.apple.com';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly analytics: AnalyticsService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get('GOOGLE_CLIENT_ID'),
    );
  }

  async register(dto: RegisterDto) {
    // Supports two signup paths:
    //  - Web: email + password (verified by email).
    //  - Mobile 1-step: phone + password (usable immediately; no email to verify).
    const hasEmail = !!dto.email;
    const normalizedPhone = dto.phone
      ? dto.phone.replace(/[\s-]/g, '')
      : undefined;
    if (!hasEmail && !normalizedPhone) {
      throw new BadRequestException('Email or phone number is required');
    }

    if (hasEmail) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) throw new ConflictException('Email already registered');
    }
    if (normalizedPhone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { OR: [{ phone: dto.phone }, { phone: normalizedPhone }] },
      });
      if (existingPhone) {
        throw new ConflictException('Phone number already registered');
      }
    }

    const role =
      dto.role === 'TECHNICIAN' ? UserRole.TECHNICIAN : UserRole.CLIENT;
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const phoneOnly = !hasEmail; // mobile 1-step signup

    // Phone-only signups have no email — store NULL rather than inventing a
    // placeholder. `User.email` is `String?` since the 20260528 migration.
    const email = hasEmail ? dto.email! : null;
    const emailVerifyToken = hasEmail ? uuidv4() : undefined;

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        phone: normalizedPhone ?? null,
        role,
        // A phone CLIENT is usable immediately (1-step). Technicians still need
        // their profile + KYC, and email signups must verify their address.
        status:
          phoneOnly && role === UserRole.CLIENT
            ? UserStatus.ACTIVE
            : UserStatus.PENDING_VERIFICATION,
        ...(emailVerifyToken && {
          emailVerifyToken,
          emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      },
    });

    if (hasEmail && emailVerifyToken) {
      await this.mailService.sendEmailVerification(
        user.email,
        user.firstName || 'Utilisateur',
        emailVerifyToken,
      );
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const profile = await this.getUserProfile(user.id, user.role);

    this.analytics.identify(user.id, {
      role: user.role,
      auth_provider: 'local',
      email_verified: user.emailVerified,
    });
    this.analytics.capture({
      distinctId: user.id,
      event: ANALYTICS_EVENTS.USER_REGISTERED,
      properties: {
        role: user.role,
        auth_provider: 'local',
        method: phoneOnly ? 'phone' : 'email',
      },
    });

    return {
      message: phoneOnly
        ? 'Registration successful.'
        : 'Registration successful. Please verify your email.',
      user: this.sanitizeUser(user),
      profile,
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    // Accept either an email (web + legacy) or a phone number (mobile gate).
    const rawIdentifier = (dto.identifier ?? dto.email ?? '').trim();
    if (!rawIdentifier) {
      throw new BadRequestException('Email or phone number is required');
    }

    const isEmail = rawIdentifier.includes('@');
    let user;
    if (isEmail) {
      user = await this.prisma.user.findUnique({
        where: { email: rawIdentifier.toLowerCase() },
      });
    } else {
      // Phone is unique; findFirst keeps this resilient even before the
      // uniqueness migration is applied. Match the raw value and a
      // whitespace/dash-stripped variant to tolerate formatting differences.
      const normalized = rawIdentifier.replace(/[\s-]/g, '');
      user = await this.prisma.user.findFirst({
        where: { OR: [{ phone: rawIdentifier }, { phone: normalized }] },
      });
    }

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

    this.analytics.capture({
      distinctId: user.id,
      event: ANALYTICS_EVENTS.USER_LOGGED_IN,
      properties: {
        role: user.role,
        auth_provider: user.authProvider ?? 'local',
        method: isEmail ? 'email' : 'phone',
      },
    });

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

      this.analytics.identify(user.id, {
        role: user.role,
        auth_provider: 'google',
        email_verified: true,
      });
      this.analytics.capture({
        distinctId: user.id,
        event: isNewUser
          ? ANALYTICS_EVENTS.OAUTH_SIGNUP
          : ANALYTICS_EVENTS.USER_LOGGED_IN,
        properties: { provider: 'google', role: user.role },
      });

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
      // Surface the real reason (token expired, audience mismatch, clock skew,
      // cert-fetch network failure, …). Without this it is swallowed into a
      // generic 401 and impossible to debug.
      this.logger.error(
        `Google ID token verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException('Google authentication failed');
    }
  }

  async appleAuth(dto: AppleAuthDto) {
    let email: string | undefined;
    let sub: string;

    try {
      // Audience is the app's bundle id for native sign-in (or the Services ID
      // for the web flow). Configure APPLE_CLIENT_ID = com.overskilled.allotech.
      const audience = this.configService.get<string>('APPLE_CLIENT_ID');
      const { payload } = await jwtVerify(dto.identityToken, APPLE_JWKS, {
        issuer: APPLE_ISSUER,
        audience,
      });

      sub = payload.sub as string;
      email = payload.email as string | undefined;
      if (!sub) {
        throw new UnauthorizedException('Invalid Apple token');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Apple authentication failed');
    }

    // Match by appleId first, then by email (account linking), else create.
    let user = await this.prisma.user.findFirst({ where: { appleId: sub } });
    const isNewUser = !user;

    if (!user && email) {
      user = await this.prisma.user.findUnique({ where: { email } });
    }

    if (!user) {
      // Apple may withhold the real email (the user picked "Hide my email"
      // and didn't share even the private-relay forwarder). When that
      // happens, we store NULL rather than fabricating one.
      user = await this.prisma.user.create({
        data: {
          email: email ?? null,
          firstName: dto.firstName || 'Utilisateur',
          lastName: dto.lastName || '',
          appleId: sub,
          authProvider: 'apple',
          emailVerified: !!email,
          status: UserStatus.PENDING_VERIFICATION, // still needs to complete profile
        },
      });
    } else if (!user.appleId) {
      // Link Apple to an existing account.
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { appleId: sub, authProvider: user.authProvider || 'apple' },
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

    this.analytics.identify(user.id, { role: user.role, auth_provider: 'apple' });
    this.analytics.capture({
      distinctId: user.id,
      event: isNewUser
        ? ANALYTICS_EVENTS.OAUTH_SIGNUP
        : ANALYTICS_EVENTS.USER_LOGGED_IN,
      properties: { provider: 'apple', role: user.role },
    });

    return {
      isNewUser,
      user: this.sanitizeUser(user),
      profile,
      ...tokens,
    };
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

    this.analytics.identify(user.id, { role: user.role });
    this.analytics.capture({
      distinctId: user.id,
      event: ANALYTICS_EVENTS.ROLE_SELECTED,
      properties: { role: user.role },
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

  async completeTechnicianProfile(
    userId: string,
    dto: CompleteProfileTechnicianDto,
    audit?: { ipAddress?: string; userAgent?: string },
  ) {
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

    // The phone set at registration is the user's login credential. Never
    // overwrite it here — doing so previously let a slightly different number
    // entered during profile setup replace the real one, after which phone
    // login could no longer find the account ("Invalid credentials"). Only set
    // the phone when the account has none yet (e.g. email/web signups), and
    // normalize it the same way registration does so lookups stay consistent.
    const phoneUpdate =
      !user.phone && dto.phone
        ? { phone: dto.phone.replace(/[\s-]/g, '') }
        : {};

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...phoneUpdate,
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

    // ── Engagement (legal commitment record) ───────────────────────
    // Persisted as an audit trail. Only written once — if the technician
    // somehow re-runs the flow, we keep the original record intact and
    // ignore the new signature (Prisma's @unique on userId enforces this).
    if (
      dto.engagementAcceptedAt &&
      dto.engagementSignedName &&
      dto.engagementSignatureImage
    ) {
      // Strip the optional data URL prefix so we store just the raw base64.
      const cleanSignature = dto.engagementSignatureImage.replace(
        /^data:image\/[a-zA-Z]+;base64,/,
        '',
      );
      await this.prisma.technicianEngagement.upsert({
        where: { userId },
        create: {
          userId,
          signedName: dto.engagementSignedName,
          signatureImage: cleanSignature,
          ipAddress: audit?.ipAddress,
          userAgent: audit?.userAgent,
          acceptedAt: new Date(dto.engagementAcceptedAt),
        },
        // Keep the original signing event intact — never overwrite.
        update: {},
      });
    }

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

  /**
   * Resolve a free-form identifier (email OR E.164 phone) to a User record.
   * Phone identifiers are normalised by stripping spaces/dashes/parens; emails
   * are lowercased. Returns null if not found.
   */
  private async findUserByIdentifier(identifier: string) {
    const trimmed = identifier.trim();
    const isEmail = trimmed.includes('@');
    if (isEmail) {
      return this.prisma.user.findUnique({ where: { email: trimmed.toLowerCase() } });
    }
    const normalizedPhone = trimmed.replace(/[\s\-()]/g, '');
    return this.prisma.user.findUnique({ where: { phone: normalizedPhone } });
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const isEmail = dto.identifier.includes('@');
    const user = await this.findUserByIdentifier(dto.identifier);

    // Always return the same message to avoid email/phone enumeration.
    const genericMsg = 'Si ce compte existe, un code de vérification a été envoyé';
    if (!user) return { message: genericMsg };

    // Generate a 6-digit OTP.
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

    // Deliver the OTP via the channel the user asked for. We avoid silently
    // switching channels (e.g. asking for an SMS but emailing instead) so
    // that the front-end's "code envoyé au …" hint stays truthful.
    try {
      if (isEmail) {
        if (!user.email) {
          this.logger.warn(`forgotPassword: user ${user.id} has no email; cannot deliver OTP`);
          return { message: genericMsg };
        }
        await this.mailService.sendPasswordResetOtp(
          user.email,
          user.firstName || 'Utilisateur',
          otp,
        );
      } else {
        if (!user.phone) {
          this.logger.warn(`forgotPassword: user ${user.id} has no phone; cannot deliver SMS OTP`);
          return { message: genericMsg };
        }
        await this.smsService.sendPasswordResetOtp(user.phone, otp);
      }
    } catch (err) {
      // Don't expose delivery failures to clients (still return the generic
      // message), but log so they're findable in monitoring.
      this.logger.error(`forgotPassword delivery failed for user ${user.id}: ${(err as Error).message}`);
    }

    return { message: genericMsg };
  }

  async verifyResetOtp(dto: VerifyResetOtpDto) {
    const user = await this.findUserByIdentifier(dto.identifier);

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

    // OTP is correct issue a short-lived temp token
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
