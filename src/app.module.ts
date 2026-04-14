import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { NeedsModule } from './modules/needs/needs.module';
import { CandidaturesModule } from './modules/candidatures/candidatures.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { MissionsModule } from './modules/missions/missions.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MailModule } from './modules/mail/mail.module';
import { RealizationsModule } from './modules/realizations/realizations.module';
import { LicensesModule } from './modules/licenses/licenses.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { TeamsModule } from './modules/teams/teams.module';
import { ChantiersModule } from './modules/chantiers/chantiers.module';
import { SupportModule } from './modules/support/support.module';
import { AdminModule } from './modules/admin/admin.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ManagerModule } from './modules/manager/manager.module';
import { AgentsModule } from './modules/agents/agents.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { UploadModule } from './modules/upload/upload.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { LocationModule } from './modules/location/location.module';
import { FirebaseModule } from './modules/firebase/firebase.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    MailModule, // Global mail service
    SettingsModule, // Global settings
    UploadModule, // Global upload service
    LocationModule, // Global location service
    FirebaseModule, // Global Firebase (FCM + Storage)
    WalletModule,
    AuthModule,
    UsersModule,
    NeedsModule,
    CandidaturesModule,
    AppointmentsModule,
    QuotationsModule,
    MissionsModule,
    RatingsModule,
    MessagingModule,
    NotificationsModule,
    RealizationsModule,
    LicensesModule,
    PaymentsModule,
    TeamsModule,
    ChantiersModule,
    SupportModule,
    AdminModule,
    ManagerModule,
    AgentsModule,
    ReportingModule,
    TrackingModule,
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
