import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UploadType {
  PROFILE = 'profile',
  NEED = 'need',
  REALIZATION = 'realization',
  QUOTATION = 'quotation',
  DOCUMENT = 'document',
  ADVERTISEMENT = 'advertisement',
  MESSAGE = 'message',
}

export enum StorageProvider {
  LOCAL = 'local',
  S3 = 's3',
  CLOUDINARY = 'cloudinary',
  APPWRITE = 'appwrite',
}

export class UploadFileDto {
  @ApiProperty({ enum: UploadType })
  @IsEnum(UploadType)
  type: UploadType;

  @ApiPropertyOptional({ description: 'Custom folder path' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  folder?: string;
}

export class GetSignedUrlDto {
  @ApiProperty({ description: 'File name' })
  @IsString()
  @MaxLength(200)
  fileName: string;

  @ApiProperty({ description: 'Content type (MIME)' })
  @IsString()
  contentType: string;

  @ApiProperty({ enum: UploadType })
  @IsEnum(UploadType)
  type: UploadType;
}

export class DeleteFileDto {
  @ApiProperty({ description: 'File URL or key to delete' })
  @IsString()
  fileUrl: string;
}

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
  originalName: string;
}

export interface SignedUrlResult {
  uploadUrl: string;
  fileUrl: string;
  key: string;
  expiresIn: number;
}

// File size limits by type (in bytes)
export const FILE_SIZE_LIMITS: Record<UploadType, number> = {
  [UploadType.PROFILE]: 5 * 1024 * 1024, // 5MB
  [UploadType.NEED]: 10 * 1024 * 1024, // 10MB
  [UploadType.REALIZATION]: 10 * 1024 * 1024, // 10MB
  [UploadType.QUOTATION]: 10 * 1024 * 1024, // 10MB
  [UploadType.DOCUMENT]: 20 * 1024 * 1024, // 20MB
  [UploadType.ADVERTISEMENT]: 5 * 1024 * 1024, // 5MB
  [UploadType.MESSAGE]: 10 * 1024 * 1024, // 10MB
};

// Allowed MIME types by upload type
export const ALLOWED_MIME_TYPES: Record<UploadType, string[]> = {
  [UploadType.PROFILE]: ['image/jpeg', 'image/png', 'image/webp'],
  [UploadType.NEED]: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  [UploadType.REALIZATION]: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  [UploadType.QUOTATION]: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  [UploadType.DOCUMENT]: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  [UploadType.ADVERTISEMENT]: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  [UploadType.MESSAGE]: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
};
