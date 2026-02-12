import {
  Controller,
  Get,
  Post,
  Put,
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
import { CandidaturesService } from './candidatures.service';
import {
  SubmitCandidatureDto,
  UpdateCandidatureDto,
  RespondToCandidatureDto,
  QueryCandidaturesDto,
} from './dto/candidature.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Candidatures')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'candidatures', version: '1' })
export class CandidaturesController {
  constructor(private readonly candidaturesService: CandidaturesService) {}

  // ==========================================
  // TECHNICIAN ENDPOINTS
  // ==========================================

  @Post()
  @ApiOperation({ summary: 'Submit a candidature for a need (Technician)' })
  @ApiResponse({ status: 201, description: 'Candidature submitted' })
  @ApiResponse({ status: 400, description: 'Invalid request or already applied' })
  async submitCandidature(
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitCandidatureDto,
  ) {
    return this.candidaturesService.submitCandidature(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a candidature (Technician - owner only)' })
  @ApiParam({ name: 'id', description: 'Candidature ID' })
  @ApiResponse({ status: 200, description: 'Candidature updated' })
  async updateCandidature(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateCandidatureDto,
  ) {
    return this.candidaturesService.updateCandidature(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw a candidature (Technician - owner only)' })
  @ApiParam({ name: 'id', description: 'Candidature ID' })
  @ApiResponse({ status: 200, description: 'Candidature withdrawn' })
  async withdrawCandidature(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.candidaturesService.withdrawCandidature(id, userId);
  }

  @Get('my-candidatures')
  @ApiOperation({ summary: 'Get technician\'s own candidatures' })
  @ApiResponse({ status: 200, description: 'Candidatures list' })
  async getMyCandidatures(
    @CurrentUser('id') userId: string,
    @Query() query: QueryCandidaturesDto,
  ) {
    return this.candidaturesService.getTechnicianCandidatures(userId, query);
  }

  @Get('my-stats')
  @ApiOperation({ summary: 'Get candidature statistics (Technician)' })
  @ApiResponse({ status: 200, description: 'Candidature stats' })
  async getMyStats(@CurrentUser('id') userId: string) {
    return this.candidaturesService.getCandidatureStats(userId);
  }

  // ==========================================
  // CLIENT ENDPOINTS
  // ==========================================

  @Get('need/:needId')
  @ApiOperation({ summary: 'Get candidatures for a specific need (Client - owner only)' })
  @ApiParam({ name: 'needId', description: 'Need ID' })
  @ApiResponse({ status: 200, description: 'Candidatures list' })
  async getCandidaturesForNeed(
    @Param('needId') needId: string,
    @CurrentUser('id') userId: string,
    @Query() query: QueryCandidaturesDto,
  ) {
    return this.candidaturesService.getCandidaturesForNeed(needId, userId, query);
  }

  @Post(':id/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept or reject a candidature (Client)' })
  @ApiParam({ name: 'id', description: 'Candidature ID' })
  @ApiResponse({ status: 200, description: 'Response recorded' })
  async respondToCandidature(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RespondToCandidatureDto,
  ) {
    return this.candidaturesService.respondToCandidature(id, userId, dto);
  }

  @Get('received')
  @ApiOperation({ summary: 'Get all candidatures received (Client)' })
  @ApiResponse({ status: 200, description: 'Candidatures list' })
  async getReceivedCandidatures(
    @CurrentUser('id') userId: string,
    @Query() query: QueryCandidaturesDto,
  ) {
    return this.candidaturesService.getClientCandidatures(userId, query);
  }

  // ==========================================
  // GENERAL ENDPOINTS
  // ==========================================

  @Get(':id')
  @ApiOperation({ summary: 'Get candidature by ID' })
  @ApiParam({ name: 'id', description: 'Candidature ID' })
  @ApiResponse({ status: 200, description: 'Candidature details' })
  async getCandidatureById(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.candidaturesService.getCandidatureById(id, userId);
  }
}
