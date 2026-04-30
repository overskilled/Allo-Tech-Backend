import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { KycService } from './kyc.service';
import {
  UpsertKycInfoDto,
  UploadKycDocumentDto,
} from './dto/kyc.dto';

@ApiTags('Technicians - KYC')
@Controller('technicians/kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TECHNICIAN')
@ApiBearerAuth()
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my KYC submission and required documents' })
  @ApiResponse({ status: 200 })
  getMine(@CurrentUser('id') userId: string) {
    return this.kycService.getMySubmission(userId);
  }

  @Put('me/info')
  @ApiOperation({ summary: 'Save legal information for my KYC submission' })
  upsertInfo(
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertKycInfoDto,
  ) {
    return this.kycService.upsertInfo(userId, dto);
  }

  @Post('me/documents')
  @ApiOperation({
    summary: 'Attach a document to my KYC submission (URL from /upload)',
  })
  uploadDocument(
    @CurrentUser('id') userId: string,
    @Body() dto: UploadKycDocumentDto,
  ) {
    return this.kycService.uploadDocument(userId, dto);
  }

  @Delete('me/documents/:documentId')
  @ApiOperation({ summary: 'Delete one of my KYC documents' })
  deleteDocument(
    @CurrentUser('id') userId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.kycService.deleteDocument(userId, documentId);
  }

  @Post('me/submit')
  @ApiOperation({ summary: 'Submit my KYC for admin review' })
  submit(@CurrentUser('id') userId: string) {
    return this.kycService.submit(userId);
  }
}
