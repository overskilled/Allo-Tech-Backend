import {
  Controller,
  Get,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportingService } from './reporting.service';
import {
  DateRangeDto,
  TechnicianReportQueryDto,
  ClientReportQueryDto,
  ExportFormat,
} from './dto/reporting.dto';

@ApiTags('Reporting')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MANAGER')
@ApiBearerAuth()
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  // ==========================================
  // STATISTICS ENDPOINTS
  // ==========================================

  @Get('clients')
  @ApiOperation({ summary: 'Get client statistics' })
  @ApiResponse({ status: 200, description: 'Returns client stats' })
  getClientStatistics(@Query() query: ClientReportQueryDto) {
    return this.reportingService.getClientStatistics(query);
  }

  @Get('technicians')
  @ApiOperation({ summary: 'Get technician statistics' })
  @ApiResponse({ status: 200, description: 'Returns technician stats' })
  getTechnicianStatistics(@Query() query: TechnicianReportQueryDto) {
    return this.reportingService.getTechnicianStatistics(query);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Get revenue report' })
  @ApiResponse({ status: 200, description: 'Returns revenue report' })
  getRevenueReport(@Query() query: DateRangeDto) {
    return this.reportingService.getRevenueReport(query);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get usage analytics' })
  @ApiResponse({ status: 200, description: 'Returns usage analytics' })
  getUsageAnalytics(@Query() query: DateRangeDto) {
    return this.reportingService.getUsageAnalytics(query);
  }

  // ==========================================
  // EXPORT ENDPOINTS
  // ==========================================

  @Get('export/clients')
  @ApiOperation({ summary: 'Export client report' })
  @ApiResponse({ status: 200, description: 'Returns exported report' })
  async exportClientReport(
    @Query() query: DateRangeDto,
    @Query('format') format: ExportFormat = ExportFormat.CSV,
    @Res() res: Response,
  ) {
    const result = await this.reportingService.exportReport('clients', query, format);

    if (format === ExportFormat.CSV) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
      return res.send(result.data);
    }

    return res.json(result.data);
  }

  @Get('export/technicians')
  @ApiOperation({ summary: 'Export technician report' })
  @ApiResponse({ status: 200, description: 'Returns exported report' })
  async exportTechnicianReport(
    @Query() query: DateRangeDto,
    @Query('format') format: ExportFormat = ExportFormat.CSV,
    @Res() res: Response,
  ) {
    const result = await this.reportingService.exportReport('technicians', query, format);

    if (format === ExportFormat.CSV) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
      return res.send(result.data);
    }

    return res.json(result.data);
  }

  @Get('export/revenue')
  @ApiOperation({ summary: 'Export revenue report' })
  @ApiResponse({ status: 200, description: 'Returns exported report' })
  async exportRevenueReport(
    @Query() query: DateRangeDto,
    @Query('format') format: ExportFormat = ExportFormat.CSV,
    @Res() res: Response,
  ) {
    const result = await this.reportingService.exportReport('revenue', query, format);

    if (format === ExportFormat.CSV) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
      return res.send(result.data);
    }

    return res.json(result.data);
  }

  @Get('export/usage')
  @ApiOperation({ summary: 'Export usage report' })
  @ApiResponse({ status: 200, description: 'Returns exported report' })
  async exportUsageReport(
    @Query() query: DateRangeDto,
    @Query('format') format: ExportFormat = ExportFormat.CSV,
    @Res() res: Response,
  ) {
    const result = await this.reportingService.exportReport('usage', query, format);

    if (format === ExportFormat.CSV) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
      return res.send(result.data);
    }

    return res.json(result.data);
  }
}
