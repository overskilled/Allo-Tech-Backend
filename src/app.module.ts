import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { NeedsModule } from './modules/needs/needs.module';
import { CandidaturesModule } from './modules/candidatures/candidatures.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MailModule } from './modules/mail/mail.module';
import { RealizationsModule } from './modules/realizations/realizations.module';
import { LicensesModule } from './modules/licenses/licenses.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { TeamsModule } from './modules/teams/teams.module';
import { SupportModule } from './modules/support/support.module';
import { AdminModule } from './modules/admin/admin.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ManagerModule } from './modules/manager/manager.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { UploadModule } from './modules/upload/upload.module';
import { LocationModule } from './modules/location/location.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    MailModule, // Global mail service
    SettingsModule, // Global settings
    UploadModule, // Global upload service
    LocationModule, // Global location service
    AuthModule,
    UsersModule,
    NeedsModule,
    CandidaturesModule,
    AppointmentsModule,
    QuotationsModule,
    RatingsModule,
    MessagingModule,
    NotificationsModule,
    RealizationsModule,
    LicensesModule,
    PaymentsModule,
    TeamsModule,
    SupportModule,
    AdminModule,
    ManagerModule,
    ReportingModule,
  ],
  controllers: [],
  providers: [
    // Global JWT Auth Guard - all routes require auth unless marked @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
