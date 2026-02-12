import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Query,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UploadService } from './upload.service';
import {
  UploadFileDto,
  GetSignedUrlDto,
  DeleteFileDto,
  UploadType,
} from './dto/upload.dto';

@ApiTags('Upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  // ==========================================
  // SINGLE FILE UPLOAD
  // ==========================================

  @Post('single')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a single file' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        type: {
          type: 'string',
          enum: Object.values(UploadType),
        },
        folder: {
          type: 'string',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  async uploadSingle(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 20 * 1024 * 1024 }), // 20MB max
        ],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser('id') userId: string,
    @Query('type') type: UploadType = UploadType.DOCUMENT,
    @Query('folder') folder?: string,
  ) {
    return this.uploadService.uploadFile(file, type, userId, folder);
  }

  // ==========================================
  // PROFILE IMAGE UPLOAD
  // ==========================================

  @Post('profile')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload profile image' })
  @ApiResponse({ status: 201, description: 'Profile image uploaded' })
  async uploadProfileImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.uploadService.uploadFile(file, UploadType.PROFILE, userId);
  }

  // ==========================================
  // NEED IMAGES UPLOAD
  // ==========================================

  @Post('need')
  @UseInterceptors(FilesInterceptor('files', 5))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload need images (max 5)' })
  @ApiResponse({ status: 201, description: 'Need images uploaded' })
  async uploadNeedImages(
    @UploadedFiles()
    files: Express.Multer.File[],
    @CurrentUser('id') userId: string,
    @Query('needId') needId?: string,
  ) {
    return this.uploadService.uploadMultipleFiles(
      files,
      UploadType.NEED,
      userId,
      needId,
    );
  }

  // ==========================================
  // REALIZATION IMAGES UPLOAD
  // ==========================================

  @Post('realization')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload realization images (max 10)' })
  @ApiResponse({ status: 201, description: 'Realization images uploaded' })
  async uploadRealizationImages(
    @UploadedFiles()
    files: Express.Multer.File[],
    @CurrentUser('id') userId: string,
    @Query('realizationId') realizationId?: string,
  ) {
    return this.uploadService.uploadMultipleFiles(
      files,
      UploadType.REALIZATION,
      userId,
      realizationId,
    );
  }

  // ==========================================
  // QUOTATION IMAGES UPLOAD
  // ==========================================

  @Post('quotation')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload quotation images (max 10)' })
  @ApiResponse({ status: 201, description: 'Quotation images uploaded' })
  async uploadQuotationImages(
    @UploadedFiles()
    files: Express.Multer.File[],
    @CurrentUser('id') userId: string,
    @Query('quotationId') quotationId?: string,
  ) {
    return this.uploadService.uploadMultipleFiles(
      files,
      UploadType.QUOTATION,
      userId,
      quotationId,
    );
  }

  // ==========================================
  // DOCUMENT UPLOAD
  // ==========================================

  @Post('document')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document (ID, certificate, etc.)' })
  @ApiResponse({ status: 201, description: 'Document uploaded' })
  async uploadDocument(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 20 * 1024 * 1024 }), // 20MB
        ],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser('id') userId: string,
    @Query('documentType') documentType?: string,
  ) {
    return this.uploadService.uploadFile(
      file,
      UploadType.DOCUMENT,
      userId,
      documentType,
    );
  }

  // ==========================================
  // MESSAGE IMAGE UPLOAD
  // ==========================================

  @Post('message')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload message image' })
  @ApiResponse({ status: 201, description: 'Message image uploaded' })
  async uploadMessageImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser('id') userId: string,
    @Query('conversationId') conversationId?: string,
  ) {
    return this.uploadService.uploadFile(
      file,
      UploadType.MESSAGE,
      userId,
      conversationId,
    );
  }

  // ==========================================
  // SIGNED URL FOR DIRECT UPLOAD
  // ==========================================

  @Post('signed-url')
  @ApiOperation({ summary: 'Get a signed URL for direct S3 upload' })
  @ApiResponse({ status: 200, description: 'Returns signed upload URL' })
  async getSignedUrl(
    @CurrentUser('id') userId: string,
    @Body() dto: GetSignedUrlDto,
  ) {
    return this.uploadService.getSignedUploadUrl(
      dto.fileName,
      dto.contentType,
      dto.type,
      userId,
    );
  }

  // ==========================================
  // DELETE FILE
  // ==========================================

  @Delete()
  @ApiOperation({ summary: 'Delete a file' })
  @ApiResponse({ status: 200, description: 'File deleted' })
  async deleteFile(@Body() dto: DeleteFileDto) {
    await this.uploadService.deleteFile(dto.fileUrl);
    return { message: 'File deleted successfully' };
  }
}
