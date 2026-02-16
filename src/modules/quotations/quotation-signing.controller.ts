import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { QuotationsService } from './quotations.service';
import { SignQuotationDto } from './dto/quotation.dto';

@ApiTags('Quotation Signing (Public)')
@Controller({ path: 'quotations/sign', version: '1' })
export class QuotationSigningController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Get quotation details by signing token (Public)' })
  @ApiParam({ name: 'token', description: 'Signing token' })
  @ApiResponse({ status: 200, description: 'Quotation details for signing' })
  async getQuotationByToken(@Param('token') token: string) {
    return this.quotationsService.getQuotationByToken(token);
  }

  @Post(':token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign a quotation (Public)' })
  @ApiParam({ name: 'token', description: 'Signing token' })
  @ApiResponse({ status: 200, description: 'Quotation signed successfully' })
  async signQuotation(
    @Param('token') token: string,
    @Body() dto: SignQuotationDto,
  ) {
    return this.quotationsService.signQuotation(token, dto.signature);
  }
}
