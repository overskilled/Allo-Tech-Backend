import { Module } from '@nestjs/common';
import { RealizationsController } from './realizations.controller';
import { RealizationsService } from './realizations.service';

@Module({
  controllers: [RealizationsController],
  providers: [RealizationsService],
  exports: [RealizationsService],
})
export class RealizationsModule {}
