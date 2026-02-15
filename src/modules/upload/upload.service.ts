import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Storage, ID } from 'node-appwrite';
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

  // S3 configuration
  private readonly s3Bucket: string;
  private readonly s3Region: string;
  private readonly s3AccessKey: string;
  private readonly s3SecretKey: string;

  // Appwrite configuration
  private appwriteStorage: Storage | null = null;
  private readonly appwriteBucketId: string;
  private readonly appwriteEndpoint: string;
  private readonly appwriteProjectId: string;

  constructor(private readonly configService: ConfigService) {
    const provider = this.configService.get<string>('STORAGE_PROVIDER', 'local');
    this.storageProvider = provider as StorageProvider;

    // Local storage config
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', './uploads');
    this.baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');

    // S3 config
    this.s3Bucket = this.configService.get<string>('S3_BUCKET', '');
    this.s3Region = this.configService.get<string>('S3_REGION', 'eu-west-1');
    this.s3AccessKey = this.configService.get<string>('S3_ACCESS_KEY', '');
    this.s3SecretKey = this.configService.get<string>('S3_SECRET_KEY', '');

    // Appwrite config
    this.appwriteEndpoint = this.configService.get<string>('APPWRITE_ENDPOINT', '');
    this.appwriteProjectId = this.configService.get<string>('APPWRITE_PROJECT_ID', '');
    this.appwriteBucketId = this.configService.get<string>('APPWRITE_BUCKET_ID', '');
    const appwriteApiKey = this.configService.get<string>('APPWRITE_API_KEY', '');

    if (this.storageProvider === StorageProvider.APPWRITE && this.appwriteEndpoint && appwriteApiKey) {
      const client = new Client()
        .setEndpoint(this.appwriteEndpoint)
        .setProject(this.appwriteProjectId)
        .setKey(appwriteApiKey);
      this.appwriteStorage = new Storage(client);
      this.logger.log('Appwrite storage client initialized');
    }

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
    folder?: string,
  ): Promise<UploadResult> {
    this.validateFile(file, type);

    const ext = path.extname(file.originalname);
    const filename = `${randomUUID()}${ext}`;
    const filePath = this.getFilePath(type, userId, folder, filename);

    if (this.storageProvider === StorageProvider.APPWRITE) {
      return this.uploadToAppwrite(file, filePath);
    } else if (this.storageProvider === StorageProvider.LOCAL) {
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
    folder?: string,
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
    if (this.storageProvider === StorageProvider.APPWRITE) {
      await this.deleteFromAppwrite(fileUrl);
    } else if (this.storageProvider === StorageProvider.LOCAL) {
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
    userId: string,
  ): Promise<SignedUrlResult> {
    if (this.storageProvider !== StorageProvider.S3) {
      throw new BadRequestException('Signed URLs only available for S3 storage');
    }

    if (!ALLOWED_MIME_TYPES[type].includes(contentType)) {
      throw new BadRequestException(`File type ${contentType} not allowed for ${type}`);
    }

    const ext = path.extname(fileName);
    const key = this.getFilePath(type, userId, undefined, `${randomUUID()}${ext}`);

    return {
      uploadUrl: `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${key}?signed=true`,
      fileUrl: `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${key}`,
      key,
      expiresIn: 3600,
    };
  }

  // ==========================================
  // APPWRITE STORAGE IMPLEMENTATION
  // ==========================================

  private async uploadToAppwrite(
    file: Express.Multer.File,
    filePath: string,
  ): Promise<UploadResult> {
    if (!this.appwriteStorage) {
      throw new BadRequestException('Appwrite storage is not configured');
    }

    const fileId = ID.unique();
    const blob = new File([file.buffer], file.originalname, { type: file.mimetype });

    const result = await this.appwriteStorage.createFile(
      this.appwriteBucketId,
      fileId,
      blob,
    );

    // Build the public file URL
    const url = `${this.appwriteEndpoint}/storage/buckets/${this.appwriteBucketId}/files/${result.$id}/view?project=${this.appwriteProjectId}`;

    this.logger.log(`File uploaded to Appwrite: ${result.$id} (${filePath})`);

    return {
      url,
      key: result.$id,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
    };
  }

  private async deleteFromAppwrite(fileUrl: string): Promise<void> {
    if (!this.appwriteStorage) return;

    try {
      // Extract file ID from the URL or use directly if already an ID
      const match = fileUrl.match(/\/files\/([^/]+)\//);
      const fileId = match ? match[1] : fileUrl;

      await this.appwriteStorage.deleteFile(this.appwriteBucketId, fileId);
      this.logger.log(`File deleted from Appwrite: ${fileId}`);
    } catch (error) {
      this.logger.error(`Failed to delete file from Appwrite: ${(error as any).message}`);
    }
  }

  // ==========================================
  // LOCAL STORAGE IMPLEMENTATION
  // ==========================================

  private async uploadToLocal(
    file: Express.Multer.File,
    filePath: string,
    filename: string,
  ): Promise<UploadResult> {
    const fullPath = path.join(this.uploadDir, filePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

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
    this.logger.log(`File would be deleted from S3: ${fileUrl}`);
  }

  // ==========================================
  // VALIDATION
  // ==========================================

  private validateFile(file: Express.Multer.File, type: UploadType): void {
    const maxSize = FILE_SIZE_LIMITS[type];
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File too large. Maximum size for ${type} is ${maxSize / (1024 * 1024)}MB`,
      );
    }

    const allowedTypes = ALLOWED_MIME_TYPES[type];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} not allowed for ${type}. Allowed types: ${allowedTypes.join(', ')}`,
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
    filename?: string,
  ): string {
    const parts = [type, userId];
    if (folder) parts.push(folder);
    if (filename) parts.push(filename);
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
    return file.buffer;
  }

  async generateThumbnail(file: Express.Multer.File, size = 200): Promise<Buffer> {
    return file.buffer;
  }

  // ==========================================
  // CLEANUP (For scheduled jobs)
  // ==========================================

  async cleanupOrphanedFiles(olderThanDays = 30): Promise<number> {
    return 0;
  }
}
