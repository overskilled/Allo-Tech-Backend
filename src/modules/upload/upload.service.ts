import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  UploadType,
  StorageProvider,
  UploadResult,
  SignedUrlResult,
  FILE_SIZE_LIMITS,
  ALLOWED_MIME_TYPES,
} from './dto/upload.dto';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly storageProvider: StorageProvider;
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  // S3 configuration (when using cloud storage)
  private readonly s3Bucket: string;
  private readonly s3Region: string;
  private readonly s3AccessKey: string;
  private readonly s3SecretKey: string;

  constructor(private readonly configService: ConfigService) {
    // Determine storage provider
    const provider = this.configService.get<string>('STORAGE_PROVIDER', 'local');
    this.storageProvider = provider as StorageProvider;

    // Local storage config
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', './uploads');
    this.baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');

    // S3 config (optional)
    this.s3Bucket = this.configService.get<string>('S3_BUCKET', '');
    this.s3Region = this.configService.get<string>('S3_REGION', 'eu-west-1');
    this.s3AccessKey = this.configService.get<string>('S3_ACCESS_KEY', '');
    this.s3SecretKey = this.configService.get<string>('S3_SECRET_KEY', '');

    // Ensure upload directory exists for local storage
    if (this.storageProvider === StorageProvider.LOCAL) {
      this.ensureUploadDirExists();
    }

    this.logger.log(`Upload service initialized with ${this.storageProvider} storage`);
  }

  // ==========================================
  // FILE UPLOAD
  // ==========================================

  async uploadFile(
    file: Express.Multer.File,
    type: UploadType,
    userId: string,
    folder?: string
  ): Promise<UploadResult> {
    // Validate file
    this.validateFile(file, type);

    // Generate unique filename
    const ext = path.extname(file.originalname);
    const filename = `${randomUUID()}${ext}`;
    const filePath = this.getFilePath(type, userId, folder, filename);

    if (this.storageProvider === StorageProvider.LOCAL) {
      return this.uploadToLocal(file, filePath, filename);
    } else if (this.storageProvider === StorageProvider.S3) {
      return this.uploadToS3(file, filePath);
    }

    throw new BadRequestException('Invalid storage provider');
  }

  async uploadMultipleFiles(
    files: Express.Multer.File[],
    type: UploadType,
    userId: string,
    folder?: string
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (const file of files) {
      const result = await this.uploadFile(file, type, userId, folder);
      results.push(result);
    }

    return results;
  }

  // ==========================================
  // FILE DELETION
  // ==========================================

  async deleteFile(fileUrl: string): Promise<void> {
    if (this.storageProvider === StorageProvider.LOCAL) {
      await this.deleteFromLocal(fileUrl);
    } else if (this.storageProvider === StorageProvider.S3) {
      await this.deleteFromS3(fileUrl);
    }
  }

  async deleteMultipleFiles(fileUrls: string[]): Promise<void> {
    await Promise.all(fileUrls.map((url) => this.deleteFile(url)));
  }

  // ==========================================
  // SIGNED URLS (for direct uploads to S3)
  // ==========================================

  async getSignedUploadUrl(
    fileName: string,
    contentType: string,
    type: UploadType,
    userId: string
  ): Promise<SignedUrlResult> {
    if (this.storageProvider !== StorageProvider.S3) {
      throw new BadRequestException('Signed URLs only available for S3 storage');
    }

    // Validate content type
    if (!ALLOWED_MIME_TYPES[type].includes(contentType)) {
      throw new BadRequestException(`File type ${contentType} not allowed for ${type}`);
    }

    const ext = path.extname(fileName);
    const key = this.getFilePath(type, userId, undefined, `${randomUUID()}${ext}`);

    // In production, use AWS SDK to generate signed URL
    // For now, return placeholder
    return {
      uploadUrl: `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${key}?signed=true`,
      fileUrl: `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${key}`,
      key,
      expiresIn: 3600, // 1 hour
    };
  }

  // ==========================================
  // LOCAL STORAGE IMPLEMENTATION
  // ==========================================

  private async uploadToLocal(
    file: Express.Multer.File,
    filePath: string,
    filename: string
  ): Promise<UploadResult> {
    const fullPath = path.join(this.uploadDir, filePath);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(fullPath, file.buffer);

    const url = `${this.baseUrl}/uploads/${filePath}`;

    this.logger.log(`File uploaded to local storage: ${filePath}`);

    return {
      url,
      key: filePath,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
    };
  }

  private async deleteFromLocal(fileUrl: string): Promise<void> {
    try {
      // Extract path from URL
      const urlPath = fileUrl.replace(`${this.baseUrl}/uploads/`, '');
      const fullPath = path.join(this.uploadDir, urlPath);

      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        this.logger.log(`File deleted from local storage: ${urlPath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete file: ${(error as any).message}`);
    }
  }

  // ==========================================
  // S3 STORAGE IMPLEMENTATION
  // ==========================================

  private async uploadToS3(file: Express.Multer.File, key: string): Promise<UploadResult> {
    // In production, use AWS SDK:
    // const s3 = new S3Client({ region: this.s3Region, credentials: {...} });
    // await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));

    // Placeholder implementation
    const url = `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${key}`;

    this.logger.log(`File would be uploaded to S3: ${key}`);

    return {
      url,
      key,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
    };
  }

  private async deleteFromS3(fileUrl: string): Promise<void> {
    // In production, use AWS SDK:
    // const s3 = new S3Client({ region: this.s3Region, credentials: {...} });
    // await s3.send(new DeleteObjectCommand({ Bucket, Key }));

    this.logger.log(`File would be deleted from S3: ${fileUrl}`);
  }

  // ==========================================
  // VALIDATION
  // ==========================================

  private validateFile(file: Express.Multer.File, type: UploadType): void {
    // Check file size
    const maxSize = FILE_SIZE_LIMITS[type];
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File too large. Maximum size for ${type} is ${maxSize / (1024 * 1024)}MB`
      );
    }

    // Check MIME type
    const allowedTypes = ALLOWED_MIME_TYPES[type];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} not allowed for ${type}. Allowed types: ${allowedTypes.join(', ')}`
      );
    }
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private getFilePath(
    type: UploadType,
    userId: string,
    folder?: string,
    filename?: string
  ): string {
    const parts = [type, userId];

    if (folder) {
      parts.push(folder);
    }

    if (filename) {
      parts.push(filename);
    }

    return parts.join('/');
  }

  private ensureUploadDirExists(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Created upload directory: ${this.uploadDir}`);
    }
  }

  // ==========================================
  // IMAGE PROCESSING (Optional)
  // ==========================================

  async resizeImage(file: Express.Multer.File, width: number, height: number): Promise<Buffer> {
    // In production, use sharp:
    // const sharp = require('sharp');
    // return sharp(file.buffer).resize(width, height).jpeg({ quality: 80 }).toBuffer();

    // Placeholder - return original
    return file.buffer;
  }

  async generateThumbnail(file: Express.Multer.File, size = 200): Promise<Buffer> {
    // In production, use sharp:
    // const sharp = require('sharp');
    // return sharp(file.buffer).resize(size, size, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer();

    // Placeholder - return original
    return file.buffer;
  }

  // ==========================================
  // CLEANUP (For scheduled jobs)
  // ==========================================

  async cleanupOrphanedFiles(olderThanDays = 30): Promise<number> {
    // This would scan for files not referenced in database
    // Implementation depends on your file tracking strategy
    return 0;
  }
}
