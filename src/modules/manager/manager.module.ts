import { Module } from '@nestjs/common';
import { ManagerController } from './manager.controller';
import { ManagerService } from './manager.service';
import { LicensesModule } from '../licenses/licenses.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [LicensesModule, NotificationsModule],
  controllers: [ManagerController],
  providers: [ManagerService],
  exports: [ManagerService],
})
export class ManagerModule {}
