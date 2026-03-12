import { Module } from '@nestjs/common';
import { AgentsController, AdminAgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  controllers: [AgentsController, AdminAgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
