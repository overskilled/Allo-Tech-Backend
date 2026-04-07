import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsInt,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ChantierStatus, ChantierExpenseCategory } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// ── Chantier CRUD ─────────────────────────────────────────

export class CreateChantierDto {
  @ApiProperty({ description: 'Titre du chantier' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Description du chantier' })
  @IsString()
  @MaxLength(5000)
  description: string;

  @ApiProperty({ description: 'Budget total (XAF)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalBudget: number;

  @ApiPropertyOptional({ description: 'Adresse' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Quartier' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ description: 'Ville' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Latitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Date de debut prevue' })
  @IsOptional()
  @IsDateString()
  expectedStartDate?: string;

  @ApiPropertyOptional({ description: 'Date de fin prevue' })
  @IsOptional()
  @IsDateString()
  expectedEndDate?: string;
}

export class UpdateChantierDto {
  @ApiPropertyOptional({ description: 'Titre du chantier' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Description du chantier' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: 'Budget total (XAF)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalBudget?: number;

  @ApiPropertyOptional({ description: 'Adresse' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Quartier' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ description: 'Ville' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Latitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Date de debut prevue' })
  @IsOptional()
  @IsDateString()
  expectedStartDate?: string;

  @ApiPropertyOptional({ description: 'Date de fin prevue' })
  @IsOptional()
  @IsDateString()
  expectedEndDate?: string;
}

// ── Status Change ─────────────────────────────────────────

export class ChangeChantierStatusDto {
  @ApiProperty({ enum: ['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'], description: 'Nouveau statut' })
  @IsEnum(ChantierStatus)
  status: ChantierStatus;

  @ApiPropertyOptional({ description: 'Raison (pour annulation ou mise en pause)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ── Members ───────────────────────────────────────────────

export class InviteMemberDto {
  @ApiProperty({ description: 'ID du technicien a inviter' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Specialite (ex: Electricien, Plombier, Macon)' })
  @IsString()
  @MaxLength(100)
  specialty: string;

  @ApiPropertyOptional({ description: 'Role: supervisor ou worker', default: 'worker' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Tarif journalier (XAF)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dailyRate?: number;

  @ApiPropertyOptional({ description: 'Prix fixe (XAF)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedPrice?: number;
}

export class RespondToInvitationDto {
  @ApiProperty({ description: 'Accepter ou refuser' })
  @IsBoolean()
  accept: boolean;
}

// ── Phases ────────────────────────────────────────────────

export class CreatePhaseDto {
  @ApiProperty({ description: 'Nom de la phase' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'Description de la phase' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Ordre de tri' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Date de debut prevue' })
  @IsOptional()
  @IsDateString()
  expectedStartDate?: string;

  @ApiPropertyOptional({ description: 'Date de fin prevue' })
  @IsOptional()
  @IsDateString()
  expectedEndDate?: string;

  @ApiPropertyOptional({ description: 'Budget alloue a cette phase (XAF)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetAllocated?: number;
}

export class UpdatePhaseDto {
  @ApiPropertyOptional({ description: 'Nom de la phase' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Ordre de tri' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Progression (0-100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @ApiPropertyOptional({ description: 'Date de debut prevue' })
  @IsOptional()
  @IsDateString()
  expectedStartDate?: string;

  @ApiPropertyOptional({ description: 'Date de fin prevue' })
  @IsOptional()
  @IsDateString()
  expectedEndDate?: string;

  @ApiPropertyOptional({ description: 'Budget alloue (XAF)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetAllocated?: number;
}

// ── Expenses ──────────────────────────────────────────────

export class AddExpenseDto {
  @ApiProperty({ description: 'Description de la depense' })
  @IsString()
  @MaxLength(500)
  description: string;

  @ApiProperty({ description: 'Montant (XAF)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ enum: ChantierExpenseCategory, description: 'Categorie' })
  @IsEnum(ChantierExpenseCategory)
  category: ChantierExpenseCategory;

  @ApiPropertyOptional({ description: 'ID de la phase associee' })
  @IsOptional()
  @IsString()
  phaseId?: string;

  @ApiPropertyOptional({ description: 'URL du recu' })
  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @ApiPropertyOptional({ description: 'Date de la depense' })
  @IsOptional()
  @IsDateString()
  expenseDate?: string;
}

// ── Documents ─────────────────────────────────────────────

export class AddChantierDocumentDto {
  @ApiProperty({ description: 'URL du fichier' })
  @IsString()
  fileUrl: string;

  @ApiProperty({ description: 'Nom du fichier' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: 'Type de fichier (image, pdf, plan, receipt, video)' })
  @IsString()
  fileType: string;

  @ApiPropertyOptional({ description: 'Legende' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;
}

// ── Notes ─────────────────────────────────────────────────

export class AddChantierNoteDto {
  @ApiProperty({ description: 'Contenu de la note' })
  @IsString()
  @MaxLength(5000)
  content: string;
}

// ── Query ─────────────────────────────────────────────────

export class QueryChantiersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ChantierStatus, description: 'Filtrer par statut' })
  @IsOptional()
  @IsEnum(ChantierStatus)
  status?: ChantierStatus;
}
