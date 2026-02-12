import {
  Controller,
  Get,
  Post,
  Put,
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
  ApiQuery,
} from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  CancelAppointmentDto,
  QueryAppointmentsDto,
} from './dto/appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Appointments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'appointments', version: '1' })
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // ==========================================
  // CRUD OPERATIONS
  // ==========================================

  @Post()
  @ApiOperation({ summary: 'Create a new appointment (Client)' })
  @ApiResponse({ status: 201, description: 'Appointment created' })
  async createAppointment(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.createAppointment(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an appointment' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiResponse({ status: 200, description: 'Appointment updated' })
  async updateAppointment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointmentsService.updateAppointment(id, userId, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an appointment' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiResponse({ status: 200, description: 'Appointment cancelled' })
  async cancelAppointment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.appointmentsService.cancelAppointment(id, userId, dto);
  }

  // ==========================================
  // STATUS UPDATES (TECHNICIAN)
  // ==========================================

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an appointment (Technician)' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiResponse({ status: 200, description: 'Appointment confirmed' })
  async confirmAppointment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.appointmentsService.confirmAppointment(id, userId);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start an appointment / Begin route (Technician)' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiResponse({ status: 200, description: 'Appointment started' })
  async startAppointment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.appointmentsService.startAppointment(id, userId);
  }

  @Post(':id/arrived')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark technician as arrived (Technician)' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiResponse({ status: 200, description: 'Arrival marked' })
  async technicianArrived(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.appointmentsService.technicianArrived(id, userId);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete an appointment (Technician)' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiResponse({ status: 200, description: 'Appointment completed' })
  async completeAppointment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.appointmentsService.completeAppointment(id, userId);
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark appointment as no-show' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiResponse({ status: 200, description: 'No-show marked' })
  async markNoShow(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.appointmentsService.markNoShow(id, userId);
  }

  // ==========================================
  // QUERY OPERATIONS
  // ==========================================

  @Get('client')
  @ApiOperation({ summary: 'Get client appointments' })
  @ApiResponse({ status: 200, description: 'Appointments list' })
  async getClientAppointments(
    @CurrentUser('id') userId: string,
    @Query() query: QueryAppointmentsDto,
  ) {
    return this.appointmentsService.getClientAppointments(userId, query);
  }

  @Get('technician')
  @ApiOperation({ summary: 'Get technician appointments' })
  @ApiResponse({ status: 200, description: 'Appointments list' })
  async getTechnicianAppointments(
    @CurrentUser('id') userId: string,
    @Query() query: QueryAppointmentsDto,
  ) {
    return this.appointmentsService.getTechnicianAppointments(userId, query);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Get upcoming appointments' })
  @ApiQuery({ name: 'role', enum: ['CLIENT', 'TECHNICIAN'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Upcoming appointments' })
  async getUpcomingAppointments(
    @CurrentUser('id') userId: string,
    @Query('role') role: 'CLIENT' | 'TECHNICIAN',
    @Query('limit') limit?: number,
  ) {
    return this.appointmentsService.getUpcomingAppointments(userId, role, limit);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Get calendar data for a month' })
  @ApiQuery({ name: 'role', enum: ['CLIENT', 'TECHNICIAN'] })
  @ApiQuery({ name: 'month', type: Number })
  @ApiQuery({ name: 'year', type: Number })
  @ApiResponse({ status: 200, description: 'Calendar data' })
  async getCalendarData(
    @CurrentUser('id') userId: string,
    @Query('role') role: 'CLIENT' | 'TECHNICIAN',
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.appointmentsService.getCalendarData(userId, role, month, year);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by ID' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiResponse({ status: 200, description: 'Appointment details' })
  async getAppointmentById(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.appointmentsService.getAppointmentById(id, userId);
  }
}
