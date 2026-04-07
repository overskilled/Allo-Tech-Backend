import { Module } from '@nestjs/common';
import { ChantiersController } from './chantiers.controller';
import { ChantiersService } from './chantiers.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ChantiersController],
  providers: [ChantiersService],
  exports: [ChantiersService],
})
export class ChantiersModule {}
