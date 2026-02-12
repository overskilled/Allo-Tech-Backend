import {
  Controller,
  Get,
  Post,
  Put,
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
import { SupportService } from './support.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  CreateResponseDto,
  QueryTicketsDto,
} from './dto/support.dto';

@ApiTags('Support')
@Controller('support')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // ==========================================
  // USER ENDPOINTS
  // ==========================================

  @Post('tickets')
  @ApiOperation({ summary: 'Create a support ticket' })
  @ApiResponse({ status: 201, description: 'Ticket created successfully' })
  createTicket(@CurrentUser('id') userId: string, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(userId, dto);
  }

  @Get('tickets/my')
  @ApiOperation({ summary: 'Get my support tickets' })
  @ApiResponse({ status: 200, description: 'Returns user tickets' })
  getMyTickets(@CurrentUser('id') userId: string, @Query() query: QueryTicketsDto) {
    return this.supportService.getMyTickets(userId, query);
  }

  @Get('tickets/my/:id')
  @ApiOperation({ summary: 'Get ticket by ID' })
  @ApiResponse({ status: 200, description: 'Returns the ticket' })
  getTicketById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.supportService.getTicketById(id, userId);
  }

  @Post('tickets/:id/responses')
  @ApiOperation({ summary: 'Add response to ticket' })
  @ApiResponse({ status: 201, description: 'Response added successfully' })
  addResponse(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateResponseDto,
  ) {
    return this.supportService.addResponse(id, userId, dto);
  }

  @Post('tickets/:id/close')
  @ApiOperation({ summary: 'Close my ticket' })
  @ApiResponse({ status: 200, description: 'Ticket closed' })
  closeTicket(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.supportService.closeTicket(id, userId);
  }

  @Post('tickets/:id/reopen')
  @ApiOperation({ summary: 'Reopen my ticket' })
  @ApiResponse({ status: 200, description: 'Ticket reopened' })
  reopenTicket(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.supportService.reopenTicket(id, userId);
  }

  // ==========================================
  // STAFF ENDPOINTS
  // ==========================================

  @Get('admin/tickets')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get all tickets (staff)' })
  @ApiResponse({ status: 200, description: 'Returns all tickets' })
  getAllTickets(@Query() query: QueryTicketsDto) {
    return this.supportService.getAllTickets(query);
  }

  @Get('admin/tickets/stats')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get ticket statistics' })
  @ApiResponse({ status: 200, description: 'Returns ticket stats' })
  getTicketStats() {
    return this.supportService.getTicketStats();
  }

  @Get('admin/tickets/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get ticket details (staff)' })
  @ApiResponse({ status: 200, description: 'Returns ticket details' })
  getStaffTicketById(@Param('id') id: string) {
    return this.supportService.getStaffTicketById(id);
  }

  @Put('admin/tickets/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Update ticket (staff)' })
  @ApiResponse({ status: 200, description: 'Ticket updated' })
  updateTicket(@Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.supportService.updateTicket(id, dto);
  }

  @Post('admin/tickets/:id/responses')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Add staff response to ticket' })
  @ApiResponse({ status: 201, description: 'Response added' })
  addStaffResponse(
    @Param('id') id: string,
    @CurrentUser('id') staffId: string,
    @Body() dto: CreateResponseDto,
  ) {
    return this.supportService.addStaffResponse(id, staffId, dto);
  }

  @Post('admin/tickets/:id/assign')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Assign ticket to self' })
  @ApiResponse({ status: 200, description: 'Ticket assigned' })
  assignTicket(@Param('id') id: string, @CurrentUser('id') staffId: string) {
    return this.supportService.assignTicket(id, staffId);
  }

  @Post('admin/tickets/:id/resolve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Resolve ticket' })
  @ApiResponse({ status: 200, description: 'Ticket resolved' })
  resolveTicket(@Param('id') id: string) {
    return this.supportService.resolveTicket(id);
  }
}
