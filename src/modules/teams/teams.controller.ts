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
import { TeamsService } from './teams.service';
import {
  CreateTeamDto,
  UpdateTeamDto,
  AddTeamMemberDto,
  UpdateTeamMemberDto,
  AddMultipleMembersDto,
  QueryTeamsDto,
} from './dto/team.dto';

@ApiTags('Teams')
@Controller('teams')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  // ==========================================
  // TEAM MANAGEMENT
  // ==========================================

  @Post()
  @UseGuards(RolesGuard)
  @Roles('TECHNICIAN')
  @ApiOperation({ summary: 'Create a new team (technician only)' })
  @ApiResponse({ status: 201, description: 'Team created successfully' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateTeamDto) {
    return this.teamsService.create(userId, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my teams' })
  @ApiResponse({ status: 200, description: 'Returns user teams' })
  getMyTeams(@CurrentUser('id') userId: string, @Query() query: QueryTeamsDto) {
    return this.teamsService.getMyTeams(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get team by ID' })
  @ApiResponse({ status: 200, description: 'Returns the team' })
  getTeamById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.teamsService.getTeamById(id, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update team (leader only)' })
  @ApiResponse({ status: 200, description: 'Team updated successfully' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete team (creator only)' })
  @ApiResponse({ status: 200, description: 'Team deleted successfully' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.teamsService.delete(id, userId);
  }

  // ==========================================
  // MEMBER MANAGEMENT
  // ==========================================

  @Get(':id/members')
  @ApiOperation({ summary: 'Get team members' })
  @ApiResponse({ status: 200, description: 'Returns team members' })
  getTeamMembers(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.teamsService.getTeamMembers(id, userId);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add member to team (leader only)' })
  @ApiResponse({ status: 201, description: 'Member added successfully' })
  addMember(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddTeamMemberDto,
  ) {
    return this.teamsService.addMember(id, userId, dto);
  }

  @Post(':id/members/bulk')
  @ApiOperation({ summary: 'Add multiple members to team (leader only)' })
  @ApiResponse({ status: 201, description: 'Members added' })
  addMultipleMembers(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddMultipleMembersDto,
  ) {
    return this.teamsService.addMultipleMembers(id, userId, dto);
  }

  @Put(':id/members/:memberId')
  @ApiOperation({ summary: 'Update member role (leader only)' })
  @ApiResponse({ status: 200, description: 'Member role updated' })
  updateMemberRole(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.teamsService.updateMemberRole(id, memberId, userId, dto);
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove member from team (leader only)' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.teamsService.removeMember(id, memberId, userId);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Leave a team' })
  @ApiResponse({ status: 200, description: 'Successfully left the team' })
  leaveTeam(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.teamsService.leaveTeam(id, userId);
  }

  @Get(':id/search-technicians')
  @ApiOperation({ summary: 'Search technicians to add (leader only)' })
  @ApiResponse({ status: 200, description: 'Returns matching technicians' })
  searchTechniciansToAdd(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('search') search: string,
  ) {
    return this.teamsService.searchTechniciansToAdd(id, userId, search || '');
  }

  // ==========================================
  // ADMIN ENDPOINTS
  // ==========================================

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get all teams (admin)' })
  @ApiResponse({ status: 200, description: 'Returns all teams' })
  getAllTeams(@Query() query: QueryTeamsDto) {
    return this.teamsService.getAllTeams(query);
  }
}
