import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminOpsService } from './admin-ops.service';
import {
  QueryNeedsDto,
  QueryAdminMissionsDto,
  HealthQueryDto,
  AdminCancelDto,
  ReassignMissionDto,
  ForceCompleteDto,
  EscrowReleaseDto,
  EscrowRefundDto,
} from './dto/admin-ops.dto';

/**
 * Admin Operations Console — 360 monitoring + enforcement over demandes (Need)
 * and missions. Read/health endpoints are open to ADMIN + AGENT; every
 * enforcement action is ADMIN-only and audit-logged.
 */
@ApiTags('Admin Ops')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminOpsController {
  constructor(private readonly opsService: AdminOpsService) {}

  // ==========================================
  // HEALTH / ISSUES
  // ==========================================

  @Get('ops/health')
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'Operations health summary (stuck / disputed / escrow-blocked counts)' })
  @ApiResponse({ status: 200, description: 'Returns issue counts' })
  getOpsHealth(@Query() query: HealthQueryDto) {
    return this.opsService.getOpsHealth(query);
  }

  // ==========================================
  // NEEDS (demandes)
  // ==========================================

  @Get('needs')
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'List/filter demandes' })
  listNeeds(@Query() query: QueryNeedsDto) {
    return this.opsService.listNeeds(query);
  }

  @Get('needs/:id')
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'Get one demande with its candidatures, quotations, missions, payments' })
  getNeed(@Param('id') id: string) {
    return this.opsService.getNeed(id);
  }

  @Post('needs/:id/cancel')
  @ApiOperation({ summary: 'Admin-cancel a demande (cascades to its non-terminal missions)' })
  cancelNeed(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminCancelDto,
  ) {
    return this.opsService.cancelNeed(id, adminId, dto);
  }

  // ==========================================
  // MISSIONS
  // ==========================================

  @Get('missions')
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'List/filter missions' })
  listMissions(@Query() query: QueryAdminMissionsDto) {
    return this.opsService.listMissions(query);
  }

  @Get('missions/:id')
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'Get one mission — full 360 detail' })
  getMission(@Param('id') id: string) {
    return this.opsService.getMission(id);
  }

  @Post('missions/:id/cancel')
  @ApiOperation({ summary: 'Admin-cancel a mission' })
  cancelMission(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminCancelDto,
  ) {
    return this.opsService.cancelMission(id, adminId, dto);
  }

  @Post('missions/:id/reassign')
  @ApiOperation({ summary: 'Reassign a non-started, money-neutral mission to another technician' })
  reassignMission(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ReassignMissionDto,
  ) {
    return this.opsService.reassignMission(id, adminId, dto);
  }

  @Post('missions/:id/force-complete')
  @ApiOperation({ summary: 'Override both-party validation and mark the mission COMPLETED' })
  forceCompleteMission(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ForceCompleteDto,
  ) {
    return this.opsService.forceCompleteMission(id, adminId, dto);
  }

  @Post('missions/:id/escrow/release')
  @ApiOperation({ summary: 'Release held escrow to the technician and close the mission' })
  releaseEscrow(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: EscrowReleaseDto,
  ) {
    return this.opsService.releaseEscrow(id, adminId, dto);
  }

  @Post('missions/:id/escrow/refund')
  @ApiOperation({ summary: 'Refund the held escrow to the client (reverses any wallet credit)' })
  refundEscrow(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: EscrowRefundDto,
  ) {
    return this.opsService.refundEscrow(id, adminId, dto);
  }
}
