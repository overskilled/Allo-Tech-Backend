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
import { QuotationsService } from './quotations.service';
import {
  CreateQuotationDto,
  UpdateQuotationDto,
  RespondToQuotationDto,
  AddQuotationImageDto,
  QueryQuotationsDto,
} from './dto/quotation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Quotations')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'quotations', version: '1' })
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  // ==========================================
  // TECHNICIAN ENDPOINTS
  // ==========================================

  @Post()
  @ApiOperation({ summary: 'Create a new quotation (Technician)' })
  @ApiResponse({ status: 201, description: 'Quotation created' })
  async createQuotation(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateQuotationDto,
  ) {
    return this.quotationsService.createQuotation(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a quotation (Technician)' })
  @ApiParam({ name: 'id', description: 'Quotation ID' })
  @ApiResponse({ status: 200, description: 'Quotation updated' })
  async updateQuotation(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateQuotationDto,
  ) {
    return this.quotationsService.updateQuotation(id, userId, dto);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit quotation to client (Technician)' })
  @ApiParam({ name: 'id', description: 'Quotation ID' })
  @ApiResponse({ status: 200, description: 'Quotation submitted' })
  async submitQuotation(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.quotationsService.submitQuotation(id, userId);
  }

  @Get('technician')
  @ApiOperation({ summary: 'Get technician\'s quotations' })
  @ApiResponse({ status: 200, description: 'Quotations list' })
  async getTechnicianQuotations(
    @CurrentUser('id') userId: string,
    @Query() query: QueryQuotationsDto,
  ) {
    return this.quotationsService.getTechnicianQuotations(userId, query);
  }

  // ==========================================
  // CLIENT ENDPOINTS
  // ==========================================

  @Post(':id/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept or reject a quotation (Client)' })
  @ApiParam({ name: 'id', description: 'Quotation ID' })
  @ApiResponse({ status: 200, description: 'Response recorded' })
  async respondToQuotation(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RespondToQuotationDto,
  ) {
    return this.quotationsService.respondToQuotation(id, userId, dto);
  }

  @Get('client')
  @ApiOperation({ summary: 'Get client\'s received quotations' })
  @ApiResponse({ status: 200, description: 'Quotations list' })
  async getClientQuotations(
    @CurrentUser('id') userId: string,
    @Query() query: QueryQuotationsDto,
  ) {
    return this.quotationsService.getClientQuotations(userId, query);
  }

  @Get('need/:needId')
  @ApiOperation({ summary: 'Get quotations for a specific need (Client)' })
  @ApiParam({ name: 'needId', description: 'Need ID' })
  @ApiResponse({ status: 200, description: 'Quotations list' })
  async getQuotationsForNeed(
    @Param('needId') needId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.quotationsService.getQuotationsForNeed(needId, userId);
  }

  // ==========================================
  // IMAGE ENDPOINTS
  // ==========================================

  @Post(':id/images')
  @ApiOperation({ summary: 'Add image to quotation (Technician)' })
  @ApiParam({ name: 'id', description: 'Quotation ID' })
  @ApiResponse({ status: 201, description: 'Image added' })
  async addImage(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddQuotationImageDto,
  ) {
    return this.quotationsService.addImage(id, userId, dto);
  }

  @Delete('images/:imageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove image from quotation (Technician)' })
  @ApiParam({ name: 'imageId', description: 'Image ID' })
  @ApiResponse({ status: 200, description: 'Image removed' })
  async removeImage(
    @Param('imageId') imageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.quotationsService.removeImage(imageId, userId);
  }

  // ==========================================
  // GENERAL ENDPOINTS
  // ==========================================

  @Get(':id')
  @ApiOperation({ summary: 'Get quotation by ID' })
  @ApiParam({ name: 'id', description: 'Quotation ID' })
  @ApiResponse({ status: 200, description: 'Quotation details' })
  async getQuotationById(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.quotationsService.getQuotationById(id, userId);
  }
}
