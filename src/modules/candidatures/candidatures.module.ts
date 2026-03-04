import { Module } from '@nestjs/common';
import { CandidaturesController } from './candidatures.controller';
import { CandidaturesService } from './candidatures.service';
import { MissionsModule } from '../missions/missions.module';

@Module({
  imports: [MissionsModule],
  controllers: [CandidaturesController],
  providers: [CandidaturesService],
  exports: [CandidaturesService],
})
export class CandidaturesModule {}
