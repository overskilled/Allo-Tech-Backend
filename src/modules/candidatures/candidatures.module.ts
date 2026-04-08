import { Module } from '@nestjs/common';
import { CandidaturesController } from './candidatures.controller';
import { CandidaturesService } from './candidatures.service';
import { MissionsModule } from '../missions/missions.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [MissionsModule, NotificationsModule],
  controllers: [CandidaturesController],
  providers: [CandidaturesService],
  exports: [CandidaturesService],
})
export class CandidaturesModule {}
