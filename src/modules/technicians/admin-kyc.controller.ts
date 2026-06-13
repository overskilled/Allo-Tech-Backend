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
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { KycDocumentStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { KycService } from './kyc.service';
import {
  QueryKycQueueDto,
  ReviewDocumentDto,
  ReviewSubmissionDto,
  RejectSubmissionDto,
} from './dto/kyc.dto';

@ApiTags('Admin - KYC')
@Controller('admin/kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminKycController {
  constructor(private readonly kycService: KycService) {}

  @Get('queue')
  @ApiOperation({
    summary:
      'List KYC submissions needing admin attention (default: SUBMITTED, UNDER_REVIEW, RESUBMISSION_REQUIRED)',
  })
  @ApiResponse({ status: 200 })
  getQueue(@Query() query: QueryKycQueueDto) {
    return this.kycService.getQueue(query);
  }

  @Get('pending-technicians')
  @ApiOperation({
    summary:
      'List technicians (filterable: unverified by default, verified, or all) with their KYC status.',
  })
  @ApiResponse({ status: 200 })
  getPendingTechnicians(@Query() query: QueryKycQueueDto) {
    return this.kycService.getPendingTechnicians(query);
  }

  @Get('pending-technicians/summary')
  @ApiOperation({
    summary:
      'Aggregated technician counts per KYC bucket (pending review, submitted, no submission, verified, …) for the admin dashboard tiles.',
  })
  @ApiResponse({ status: 200 })
  getPendingTechniciansSummary(@Query('search') search?: string) {
    return this.kycService.getPendingTechniciansSummary(search);
  }

  @Post('technicians/:userId/remind')
  @ApiOperation({
    summary: 'Send a KYC reminder email + in-app notification to a technician',
  })
  remindTechnician(@Param('userId') userId: string) {
    return this.kycService.remindTechnician(userId);
  }

  @Get(':submissionId')
  @ApiOperation({ summary: 'Get a KYC submission by ID' })
  getById(@Param('submissionId') submissionId: string) {
    return this.kycService.getById(submissionId);
  }

  @Post(':submissionId/start-review')
  @ApiOperation({ summary: 'Claim a submission for review (status → UNDER_REVIEW)' })
  startReview(
    @Param('submissionId') submissionId: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.kycService.startReview(submissionId, adminId);
  }

  @Post('documents/:documentId/approve')
  @ApiOperation({ summary: 'Approve a single document' })
  approveDocument(@Param('documentId') documentId: string) {
    return this.kycService.reviewDocument(
      documentId,
      KycDocumentStatus.APPROVED,
      {},
    );
  }

  @Post('documents/:documentId/reject')
  @ApiOperation({ summary: 'Reject a single document (rejectionReason required)' })
  rejectDocument(
    @Param('documentId') documentId: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.kycService.reviewDocument(
      documentId,
      KycDocumentStatus.REJECTED,
      dto,
    );
  }

  @Post(':submissionId/approve')
  @ApiOperation({
    summary:
      'Approve the whole submission. Auto-approves remaining PENDING docs and marks technician as verified.',
  })
  approveSubmission(
    @Param('submissionId') submissionId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ReviewSubmissionDto,
  ) {
    return this.kycService.approveSubmission(submissionId, adminId, dto);
  }

  @Post(':submissionId/reject')
  @ApiOperation({
    summary:
      'Reject the submission. Pass allowResubmission=true to let the technician update and resubmit.',
  })
  rejectSubmission(
    @Param('submissionId') submissionId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: RejectSubmissionDto,
  ) {
    return this.kycService.rejectSubmission(submissionId, adminId, dto);
  }
}
