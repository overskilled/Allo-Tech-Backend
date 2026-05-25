import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  KycStatus,
  KycDocumentStatus,
  KycDocumentType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createPaginatedResult } from '../../common/dto/pagination.dto';
import { AnalyticsService, ANALYTICS_EVENTS } from '../analytics/analytics.service';
import {
  UpsertKycInfoDto,
  UploadKycDocumentDto,
  ReviewDocumentDto,
  RejectSubmissionDto,
  ReviewSubmissionDto,
  QueryKycQueueDto,
} from './dto/kyc.dto';

// Only the front and back of an ID document are required. Selfie + proof of
// address + certifications are optional and no longer enforced at submission.
const REQUIRED_DOCUMENTS: KycDocumentType[] = [
  KycDocumentType.ID_FRONT,
  KycDocumentType.ID_BACK,
];

const SUBMISSION_INCLUDE = {
  documents: { orderBy: { uploadedAt: 'asc' as const } },
  technician: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      profileImage: true,
      createdAt: true,
      technicianProfile: {
        select: {
          profession: true,
          city: true,
          isVerified: true,
        },
      },
    },
  },
  reviewer: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.KycSubmissionInclude;

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    private readonly analytics: AnalyticsService,
  ) {}

  // ==========================================
  // TECHNICIAN-FACING
  // ==========================================

  async getMySubmission(userId: string) {
    await this.assertTechnician(userId);

    const submission = await this.prisma.kycSubmission.findUnique({
      where: { technicianId: userId },
      include: SUBMISSION_INCLUDE,
    });

    if (!submission) {
      return {
        status: KycStatus.NOT_STARTED,
        documents: [],
        requiredDocuments: REQUIRED_DOCUMENTS,
      };
    }

    return {
      ...submission,
      requiredDocuments: REQUIRED_DOCUMENTS,
    };
  }

  async upsertInfo(userId: string, dto: UpsertKycInfoDto) {
    await this.assertTechnician(userId);

    const existing = await this.prisma.kycSubmission.findUnique({
      where: { technicianId: userId },
    });

    if (existing && this.isLocked(existing.status)) {
      throw new BadRequestException(
        'Submission is locked while under review. Wait for the admin decision.',
      );
    }

    const data = {
      legalFirstName: dto.legalFirstName,
      legalLastName: dto.legalLastName,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      nationality: dto.nationality,
      idNumber: dto.idNumber,
      addressLine: dto.addressLine,
      city: dto.city,
    };

    const submission = await this.prisma.kycSubmission.upsert({
      where: { technicianId: userId },
      create: {
        technicianId: userId,
        status: KycStatus.DRAFT,
        ...data,
      },
      update: {
        ...data,
        status:
          existing?.status === KycStatus.NOT_STARTED ||
          existing?.status === KycStatus.RESUBMISSION_REQUIRED
            ? KycStatus.DRAFT
            : existing?.status,
      },
      include: SUBMISSION_INCLUDE,
    });

    return submission;
  }

  async uploadDocument(userId: string, dto: UploadKycDocumentDto) {
    await this.assertTechnician(userId);

    const submission = await this.prisma.kycSubmission.upsert({
      where: { technicianId: userId },
      create: {
        technicianId: userId,
        status: KycStatus.DRAFT,
      },
      update: {},
    });

    if (this.isLocked(submission.status)) {
      throw new BadRequestException(
        'Submission is locked while under review. Wait for the admin decision.',
      );
    }

    // Upsert by (submissionId, type) — re-upload replaces the previous file
    const document = await this.prisma.kycDocument.upsert({
      where: {
        submissionId_type: {
          submissionId: submission.id,
          type: dto.type,
        },
      },
      create: {
        submissionId: submission.id,
        type: dto.type,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        status: KycDocumentStatus.PENDING,
      },
      update: {
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        status: KycDocumentStatus.PENDING,
        rejectionReason: null,
        reviewedAt: null,
        uploadedAt: new Date(),
      },
    });

    // If submission was awaiting resubmission, return it to DRAFT
    if (
      submission.status === KycStatus.RESUBMISSION_REQUIRED ||
      submission.status === KycStatus.NOT_STARTED
    ) {
      await this.prisma.kycSubmission.update({
        where: { id: submission.id },
        data: { status: KycStatus.DRAFT },
      });
    }

    return document;
  }

  async deleteDocument(userId: string, documentId: string) {
    await this.assertTechnician(userId);

    const document = await this.prisma.kycDocument.findUnique({
      where: { id: documentId },
      include: { submission: true },
    });

    if (!document || document.submission.technicianId !== userId) {
      throw new NotFoundException('Document not found');
    }

    if (this.isLocked(document.submission.status)) {
      throw new BadRequestException(
        'Cannot delete a document while the submission is under review.',
      );
    }

    await this.prisma.kycDocument.delete({ where: { id: documentId } });
    return { success: true };
  }

  async submit(userId: string) {
    await this.assertTechnician(userId);

    const submission = await this.prisma.kycSubmission.findUnique({
      where: { technicianId: userId },
      include: { documents: true },
    });

    if (!submission) {
      throw new BadRequestException(
        'Provide your information and documents before submitting.',
      );
    }

    if (this.isLocked(submission.status)) {
      throw new BadRequestException('Submission already under review.');
    }

    if (submission.status === KycStatus.APPROVED) {
      throw new BadRequestException('Your KYC is already approved.');
    }

    const missing = REQUIRED_DOCUMENTS.filter(
      (type) => !submission.documents.some((d) => d.type === type),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required documents: ${missing.join(', ')}`,
      );
    }

    if (
      !submission.legalFirstName ||
      !submission.legalLastName ||
      !submission.dateOfBirth ||
      !submission.idNumber
    ) {
      throw new BadRequestException(
        'Legal name, date of birth, and ID number are required.',
      );
    }

    const updated = await this.prisma.kycSubmission.update({
      where: { id: submission.id },
      data: {
        status: KycStatus.SUBMITTED,
        submittedAt: new Date(),
        adminNotes: null,
      },
      include: SUBMISSION_INCLUDE,
    });

    this.analytics.identify(updated.technicianId, { kyc_status: 'SUBMITTED' });
    this.analytics.capture({
      distinctId: updated.technicianId,
      event: ANALYTICS_EVENTS.KYC_SUBMITTED,
      properties: { submission_id: updated.id },
      groups: { technician: updated.technicianId },
    });

    return updated;
  }

  // ==========================================
  // ADMIN-FACING
  // ==========================================

  async getQueue(query: QueryKycQueueDto) {
    const where: Prisma.KycSubmissionWhereInput = {};

    if (query.status) {
      where.status = query.status as KycStatus;
    } else {
      // Default queue surfaces every submission that needs admin attention,
      // including those waiting for the technician to fix something.
      where.status = {
        in: [
          KycStatus.SUBMITTED,
          KycStatus.UNDER_REVIEW,
          KycStatus.RESUBMISSION_REQUIRED,
        ],
      };
    }

    if (query.search) {
      where.technician = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.kycSubmission.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { submittedAt: 'asc' },
        include: SUBMISSION_INCLUDE,
      }),
      this.prisma.kycSubmission.count({ where }),
    ]);

    return createPaginatedResult(items, total, query);
  }

  /**
   * Unified technician listing for the admin KYC view.
   *
   * `verified` filter:
   *   - 'unverified' (default) → technicians with isVerified=false
   *   - 'verified'             → technicians with isVerified=true
   *   - 'all'                  → every technician
   */
  async getPendingTechnicians(
    query: QueryKycQueueDto & { verified?: 'all' | 'verified' | 'unverified' },
  ) {
    const verified = query.verified ?? 'unverified';
    const where: Prisma.UserWhereInput = { role: 'TECHNICIAN' };

    if (verified === 'unverified') {
      where.technicianProfile = { isVerified: false };
    } else if (verified === 'verified') {
      where.technicianProfile = { isVerified: true };
    } else {
      where.technicianProfile = { isNot: null };
    }

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          profileImage: true,
          createdAt: true,
          technicianProfile: {
            select: { profession: true, city: true, isVerified: true },
          },
          kycSubmission: {
            select: { id: true, status: true, submittedAt: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return createPaginatedResult(users, total, query);
  }

  /**
   * Send a reminder (email + in-app notification) to a technician asking them
   * to start or finish their KYC verification.
   */
  async remindTechnician(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        role: true,
        technicianProfile: { select: { isVerified: true } },
      },
    });

    if (!user) throw new NotFoundException('Technician not found');
    if (user.role !== 'TECHNICIAN') {
      throw new BadRequestException('User is not a technician');
    }
    if (user.technicianProfile?.isVerified) {
      throw new BadRequestException('Technician is already verified');
    }

    await this.notificationsService.create({
      userId: user.id,
      type: 'SYSTEM',
      title: 'Vérification KYC requise',
      body: 'Merci de soumettre votre pièce d\'identité depuis l\'app pour finaliser votre profil.',
    });

    await this.mailService.send({
      to: user.email,
      subject: 'Finalisez votre vérification AlloTech',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #167bda; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">AlloTech</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2>Bonjour ${user.firstName},</h2>
            <p>Pour continuer à recevoir des missions sur AlloTech, vous devez finaliser votre vérification d'identité (KYC).</p>
            <p>Ouvrez l'application, allez dans <strong>Profil → Vérification KYC</strong>, et soumettez :</p>
            <ul>
              <li>Votre pièce d'identité (CNI, passeport ou permis de conduire)</li>
              <li>Une photo de vous tenant la pièce</li>
            </ul>
            <p>Notre équipe valide les dossiers sous 24-48h.</p>
            <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">Si vous avez déjà soumis votre dossier, vous pouvez ignorer ce message.</p>
          </div>
        </div>
      `,
    });

    return { success: true };
  }

  async getById(submissionId: string) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id: submissionId },
      include: SUBMISSION_INCLUDE,
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    return submission;
  }

  async startReview(submissionId: string, adminId: string) {
    const submission = await this.getById(submissionId);

    if (
      submission.status !== KycStatus.SUBMITTED &&
      submission.status !== KycStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException(
        'Only submitted submissions can be reviewed.',
      );
    }

    const reviewing = await this.prisma.kycSubmission.update({
      where: { id: submissionId },
      data: {
        status: KycStatus.UNDER_REVIEW,
        reviewedBy: adminId,
      },
      include: SUBMISSION_INCLUDE,
    });

    this.analytics.capture({
      distinctId: reviewing.technicianId,
      event: ANALYTICS_EVENTS.KYC_REVIEW_STARTED,
      properties: { submission_id: submissionId, admin_id: adminId },
      groups: { technician: reviewing.technicianId },
    });

    return reviewing;
  }

  async reviewDocument(
    documentId: string,
    decision: KycDocumentStatus,
    dto: ReviewDocumentDto,
  ) {
    const document = await this.prisma.kycDocument.findUnique({
      where: { id: documentId },
    });
    if (!document) throw new NotFoundException('Document not found');

    if (decision === KycDocumentStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('rejectionReason is required to reject');
    }

    return this.prisma.kycDocument.update({
      where: { id: documentId },
      data: {
        status: decision,
        rejectionReason:
          decision === KycDocumentStatus.REJECTED ? dto.rejectionReason : null,
        reviewedAt: new Date(),
      },
    });
  }

  async approveSubmission(
    submissionId: string,
    adminId: string,
    dto: ReviewSubmissionDto,
  ) {
    const submission = await this.getById(submissionId);

    if (
      submission.status !== KycStatus.SUBMITTED &&
      submission.status !== KycStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException(
        'Only submitted submissions can be approved.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Mark all PENDING docs as APPROVED automatically on overall approval
      await tx.kycDocument.updateMany({
        where: {
          submissionId,
          status: KycDocumentStatus.PENDING,
        },
        data: {
          status: KycDocumentStatus.APPROVED,
          reviewedAt: new Date(),
        },
      });

      const updated = await tx.kycSubmission.update({
        where: { id: submissionId },
        data: {
          status: KycStatus.APPROVED,
          reviewedAt: new Date(),
          reviewedBy: adminId,
          adminNotes: dto.notes,
        },
        include: SUBMISSION_INCLUDE,
      });

      // Promote technician profile + activate user
      await tx.technicianProfile.update({
        where: { userId: submission.technicianId },
        data: {
          isVerified: true,
          verifiedAt: new Date(),
        },
      });

      await tx.user.update({
        where: { id: submission.technicianId },
        data: { status: 'ACTIVE' },
      });

      return updated;
    });

    this.analytics.identify(submission.technicianId, {
      kyc_status: 'APPROVED',
      is_verified: true,
      status: 'ACTIVE',
    });
    this.analytics.capture({
      distinctId: submission.technicianId,
      event: ANALYTICS_EVENTS.KYC_APPROVED,
      properties: { submission_id: submissionId, admin_id: adminId },
      groups: { technician: submission.technicianId },
    });

    await this.notifyApproved(result.technician);
    return result;
  }

  async rejectSubmission(
    submissionId: string,
    adminId: string,
    dto: RejectSubmissionDto,
  ) {
    const submission = await this.getById(submissionId);

    if (
      submission.status !== KycStatus.SUBMITTED &&
      submission.status !== KycStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException(
        'Only submitted submissions can be rejected.',
      );
    }

    const nextStatus = dto.allowResubmission
      ? KycStatus.RESUBMISSION_REQUIRED
      : KycStatus.REJECTED;

    const updated = await this.prisma.kycSubmission.update({
      where: { id: submissionId },
      data: {
        status: nextStatus,
        reviewedAt: new Date(),
        reviewedBy: adminId,
        adminNotes: dto.reason,
      },
      include: SUBMISSION_INCLUDE,
    });

    this.analytics.identify(updated.technicianId, { kyc_status: nextStatus });
    this.analytics.capture({
      distinctId: updated.technicianId,
      event:
        nextStatus === KycStatus.RESUBMISSION_REQUIRED
          ? ANALYTICS_EVENTS.KYC_RESUBMISSION_REQUIRED
          : ANALYTICS_EVENTS.KYC_REJECTED,
      properties: { submission_id: submissionId, admin_id: adminId },
      groups: { technician: updated.technicianId },
    });

    await this.notifyRejected(updated.technician, dto.reason, nextStatus);
    return updated;
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private isLocked(status: KycStatus): boolean {
    return status === KycStatus.SUBMITTED || status === KycStatus.UNDER_REVIEW;
  }

  private async assertTechnician(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'TECHNICIAN') {
      throw new ForbiddenException('Only technicians can submit KYC');
    }
  }

  private async notifyApproved(technician: {
    id: string;
    email: string;
    firstName: string;
  }) {
    await this.notificationsService.create({
      userId: technician.id,
      type: 'SYSTEM',
      title: 'KYC approuvé',
      body:
        'Votre dossier KYC a été approuvé. Vous pouvez désormais recevoir des missions.',
    });

    await this.mailService.send({
      to: technician.email,
      subject: 'KYC approuvé - AlloTech',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #16a34a; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">AlloTech</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2>Félicitations ${technician.firstName} !</h2>
            <p>Votre dossier KYC a été approuvé. Vous êtes maintenant un technicien vérifié.</p>
            <p>Connectez-vous pour commencer à recevoir des demandes.</p>
          </div>
        </div>
      `,
    });
  }

  private async notifyRejected(
    technician: { id: string; email: string; firstName: string },
    reason: string,
    status: KycStatus,
  ) {
    const allowResubmission = status === KycStatus.RESUBMISSION_REQUIRED;

    await this.notificationsService.create({
      userId: technician.id,
      type: 'SYSTEM',
      title: allowResubmission ? 'KYC à corriger' : 'KYC refusé',
      body: reason,
    });

    await this.mailService.send({
      to: technician.email,
      subject: allowResubmission
        ? 'Documents à corriger - AlloTech'
        : 'KYC refusé - AlloTech',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc2626; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">AlloTech</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2>Bonjour ${technician.firstName},</h2>
            <p>${
              allowResubmission
                ? 'Votre dossier KYC nécessite des corrections.'
                : 'Votre dossier KYC a été refusé.'
            }</p>
            <p><strong>Motif :</strong> ${reason}</p>
            ${
              allowResubmission
                ? '<p>Vous pouvez mettre à jour vos documents et soumettre à nouveau depuis votre espace.</p>'
                : '<p>Pour plus d\'informations, contactez notre support.</p>'
            }
          </div>
        </div>
      `,
    });
  }
}
