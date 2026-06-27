import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { MissionsService } from './missions.service';
import {
  ScheduleMissionDto,
  ValidateMissionDto,
  CancelMissionDto,
  RequestCompletionDto,
  AddMissionDocumentDto,
  CreateOnSiteQuotationDto,
  QueryMissionsDto,
} from './dto/mission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Missions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'missions', version: '1' })
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  // ==========================================
  // LIST ENDPOINTS
  // ==========================================

  @Get('client')
  @ApiOperation({ summary: 'Get client\'s missions' })
  @ApiResponse({ status: 200, description: 'Missions list' })
  async getClientMissions(
    @CurrentUser('id') userId: string,
    @Query() query: QueryMissionsDto,
  ) {
    return this.missionsService.getClientMissions(userId, query);
  }

  @Get('technician')
  @ApiOperation({ summary: 'Get technician\'s missions' })
  @ApiResponse({ status: 200, description: 'Missions list' })
  async getTechnicianMissions(
    @CurrentUser('id') userId: string,
    @Query() query: QueryMissionsDto,
  ) {
    return this.missionsService.getTechnicianMissions(userId, query);
  }

  // ==========================================
  // DETAIL ENDPOINT
  // ==========================================

  @Get(':id')
  @ApiOperation({ summary: 'Get mission details' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 200, description: 'Mission details' })
  async getMission(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.missionsService.getMission(id, userId);
  }

  // ==========================================
  // LIFECYCLE ENDPOINTS
  // ==========================================

  @Post(':id/confirm-schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm mission schedule (Technician)' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 200, description: 'Mission schedule confirmed' })
  async confirmMissionSchedule(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.missionsService.confirmMissionSchedule(id, userId);
  }

  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Schedule a mission (Technician)' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 200, description: 'Mission scheduled' })
  async scheduleMission(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ScheduleMissionDto,
  ) {
    return this.missionsService.scheduleMission(id, userId, dto);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a mission (Technician)' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 200, description: 'Mission started' })
  async startMission(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.missionsService.startMission(id, userId);
  }

  @Post(':id/request-completion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request mission completion (Technician)' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 200, description: 'Completion requested' })
  async requestCompletion(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RequestCompletionDto,
  ) {
    return this.missionsService.requestCompletion(id, userId, dto);
  }

  @Post(':id/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate mission completion (Client or Technician)' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 200, description: 'Validation recorded' })
  async validateMission(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ValidateMissionDto,
  ) {
    return this.missionsService.validateMission(id, userId, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a mission (Client) — releases escrow or validates as needed' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 200, description: 'Mission closed' })
  async closeMission(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ValidateMissionDto,
  ) {
    return this.missionsService.closeMission(id, userId, dto);
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Client pays candidature-based mission via PawaPay' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 200, description: 'Payment initiated' })
  async payMission(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: { phoneNumber: string; operator: string },
  ) {
    return this.missionsService.payMission(id, userId, dto);
  }

  @Post(':id/sos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Raise an SOS / emergency alert during a mission' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 200, description: 'SOS alert raised' })
  async raiseSos(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: { latitude?: number; longitude?: number; message?: string },
  ) {
    return this.missionsService.raiseSosAlert(id, userId, dto ?? {});
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a mission' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 200, description: 'Mission cancelled' })
  async cancelMission(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CancelMissionDto,
  ) {
    return this.missionsService.cancelMission(id, userId, dto);
  }

  // ==========================================
  // DOCUMENT ENDPOINTS
  // ==========================================

  @Post(':id/documents')
  @ApiOperation({ summary: 'Add document to mission' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 201, description: 'Document added' })
  async addDocument(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddMissionDocumentDto,
  ) {
    return this.missionsService.addDocument(id, userId, dto);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Get mission documents' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 200, description: 'Documents list' })
  async getDocuments(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.missionsService.getDocuments(id, userId);
  }

  @Delete('documents/:docId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a document' })
  @ApiParam({ name: 'docId', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document removed' })
  async removeDocument(
    @Param('docId') docId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.missionsService.removeDocument(docId, userId);
  }

  // ==========================================
  // ON-SITE QUOTATION
  // ==========================================

  // Accept the legacy `additional-quotation` path too — released app builds
  // (≤ ALLOTECH/13) still POST to it; the route was renamed to on-site-quotation.
  @Post([':id/on-site-quotation', ':id/additional-quotation'])
  @ApiOperation({ summary: 'Create on-site quote during mission (Technician)' })
  @ApiParam({ name: 'id', description: 'Mission ID' })
  @ApiResponse({ status: 201, description: 'On-site quote created' })
  async createOnSiteQuotation(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOnSiteQuotationDto,
  ) {
    return this.missionsService.createOnSiteQuotation(id, userId, dto);
  }
}
