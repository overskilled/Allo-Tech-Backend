import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { AgentsService } from './agents.service';
import {
  CreateFieldVisitDto,
  UpdateFieldVisitDto,
  QueryFieldVisitsDto,
  CreateOnboardingDto,
  UpdateOnboardingDto,
  QueryOnboardingsDto,
} from './dto/agents.dto';

@ApiTags('Agents')
@Controller({ path: 'agents', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiBearerAuth()
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  // ==========================================
  // STATS & PERFORMANCE
  // ==========================================

  @Get('stats')
  @ApiOperation({ summary: 'Get agent stats' })
  @ApiResponse({ status: 200, description: 'Returns agent statistics' })
  getStats(@CurrentUser('id') agentId: string) {
    return this.agentsService.getAgentStats(agentId);
  }

  @Get('performance')
  @ApiOperation({ summary: 'Get agent performance' })
  @ApiResponse({ status: 200, description: 'Returns agent performance metrics' })
  getPerformance(@CurrentUser('id') agentId: string) {
    return this.agentsService.getAgentPerformance(agentId);
  }

  @Get('zones')
  @ApiOperation({ summary: 'Get agent zones' })
  @ApiResponse({ status: 200, description: 'Returns distinct zones' })
  getZones(@CurrentUser('id') agentId: string) {
    return this.agentsService.getAgentZones(agentId);
  }

  // ==========================================
  // FIELD VISITS
  // ==========================================

  @Get('visits')
  @ApiOperation({ summary: 'Get field visits' })
  @ApiResponse({ status: 200, description: 'Returns paginated field visits' })
  getVisits(
    @CurrentUser('id') agentId: string,
    @Query() query: QueryFieldVisitsDto,
  ) {
    return this.agentsService.getFieldVisits(agentId, query);
  }

  @Get('visits/:id')
  @ApiOperation({ summary: 'Get field visit by ID' })
  @ApiResponse({ status: 200, description: 'Returns field visit details' })
  getVisit(
    @CurrentUser('id') agentId: string,
    @Param('id') id: string,
  ) {
    return this.agentsService.getFieldVisit(agentId, id);
  }

  @Post('visits')
  @ApiOperation({ summary: 'Create a field visit' })
  @ApiResponse({ status: 201, description: 'Field visit created' })
  createVisit(
    @CurrentUser('id') agentId: string,
    @Body() dto: CreateFieldVisitDto,
  ) {
    return this.agentsService.createFieldVisit(agentId, dto);
  }

  @Patch('visits/:id')
  @ApiOperation({ summary: 'Update a field visit' })
  @ApiResponse({ status: 200, description: 'Field visit updated' })
  updateVisit(
    @CurrentUser('id') agentId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFieldVisitDto,
  ) {
    return this.agentsService.updateFieldVisit(agentId, id, dto);
  }

  @Delete('visits/:id')
  @ApiOperation({ summary: 'Delete a field visit' })
  @ApiResponse({ status: 200, description: 'Field visit deleted' })
  deleteVisit(
    @CurrentUser('id') agentId: string,
    @Param('id') id: string,
  ) {
    return this.agentsService.deleteFieldVisit(agentId, id);
  }

  @Patch('visits/route-order')
  @ApiOperation({ summary: 'Update route order for zone planning' })
  @ApiResponse({ status: 200, description: 'Route order updated' })
  updateRouteOrder(
    @CurrentUser('id') agentId: string,
    @Body() updates: { id: string; routeOrder: number }[],
  ) {
    return this.agentsService.updateRouteOrder(agentId, updates);
  }

  // ==========================================
  // ONBOARDING
  // ==========================================

  @Get('onboardings')
  @ApiOperation({ summary: 'Get onboardings' })
  @ApiResponse({ status: 200, description: 'Returns paginated onboardings' })
  getOnboardings(
    @CurrentUser('id') agentId: string,
    @Query() query: QueryOnboardingsDto,
  ) {
    return this.agentsService.getOnboardings(agentId, query);
  }

  @Get('onboardings/:id')
  @ApiOperation({ summary: 'Get onboarding by ID' })
  @ApiResponse({ status: 200, description: 'Returns onboarding details' })
  getOnboarding(
    @CurrentUser('id') agentId: string,
    @Param('id') id: string,
  ) {
    return this.agentsService.getOnboarding(agentId, id);
  }

  @Post('onboardings')
  @ApiOperation({ summary: 'Create an onboarding' })
  @ApiResponse({ status: 201, description: 'Onboarding created' })
  createOnboarding(
    @CurrentUser('id') agentId: string,
    @Body() dto: CreateOnboardingDto,
  ) {
    return this.agentsService.createOnboarding(agentId, dto);
  }

  @Patch('onboardings/:id')
  @ApiOperation({ summary: 'Update an onboarding' })
  @ApiResponse({ status: 200, description: 'Onboarding updated' })
  updateOnboarding(
    @CurrentUser('id') agentId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOnboardingDto,
  ) {
    return this.agentsService.updateOnboarding(agentId, id, dto);
  }
}

// ==========================================
// ADMIN ENDPOINTS (separate controller)
// ==========================================

@ApiTags('Admin - Agents')
@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminAgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get platform metrics' })
  @ApiResponse({ status: 200, description: 'Returns platform-wide metrics' })
  getMetrics() {
    return this.agentsService.getPlatformMetrics();
  }

  @Get('agents/performances')
  @ApiOperation({ summary: 'Get all agents performance' })
  @ApiResponse({ status: 200, description: 'Returns all agent performances' })
  getAgentPerformances() {
    return this.agentsService.getAllAgentPerformances();
  }

  @Get('agents/:agentId/performance')
  @ApiOperation({ summary: 'Get specific agent performance' })
  @ApiResponse({ status: 200, description: 'Returns agent performance' })
  getAgentPerformance(@Param('agentId') agentId: string) {
    return this.agentsService.getAgentPerformance(agentId);
  }
}
