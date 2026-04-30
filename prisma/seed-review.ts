/**
 * APPLE APP REVIEW — TEST ACCOUNTS
 * =================================
 * Idempotent seed that creates two demo accounts for App Store / Play Store
 * review teams. Safe to run multiple times.
 *
 * Run with: npx ts-node prisma/seed-review.ts
 */

import {
  PrismaClient,
  UserRole,
  UserStatus,
  KycStatus,
  KycDocumentType,
  KycDocumentStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const CLIENT_EMAIL = 'client.review@allotech.test';
const TECH_EMAIL = 'tech.review@allotech.test';
const PASSWORD = 'Test1234!';
const SALT_ROUNDS = 10;

// Placeholder document URL used for the KYC sample (any reachable image works
// — Apple reviewers won't open these, but the schema requires a fileUrl).
const SAMPLE_DOC_URL =
  'https://placehold.co/1200x800/167bda/ffffff/png?text=KYC+Sample+Document';

async function main() {
  console.log('🍎 Seeding Apple App Review test accounts…');

  const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

  // ===========================================
  // CLIENT REVIEW ACCOUNT
  // ===========================================
  console.log(`👤 Upserting client: ${CLIENT_EMAIL}`);

  const client = await prisma.user.upsert({
    where: { email: CLIENT_EMAIL },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
    create: {
      email: CLIENT_EMAIL,
      passwordHash,
      firstName: 'App',
      lastName: 'Reviewer',
      phone: '+237690000001',
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });

  await prisma.clientProfile.upsert({
    where: { userId: client.id },
    update: {
      address: 'Quartier Bastos, Yaoundé',
      neighborhood: 'Bastos',
      city: 'Yaoundé',
      latitude: 3.8908,
      longitude: 11.5167,
    },
    create: {
      userId: client.id,
      address: 'Quartier Bastos, Yaoundé',
      neighborhood: 'Bastos',
      city: 'Yaoundé',
      latitude: 3.8908,
      longitude: 11.5167,
      preferredLanguage: 'fr',
      notificationsEnabled: true,
    },
  });

  // ===========================================
  // TECHNICIAN REVIEW ACCOUNT (verified)
  // ===========================================
  console.log(`🔧 Upserting technician: ${TECH_EMAIL}`);

  const technician = await prisma.user.upsert({
    where: { email: TECH_EMAIL },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
    create: {
      email: TECH_EMAIL,
      passwordHash,
      firstName: 'Test',
      lastName: 'Technicien',
      phone: '+237690000002',
      role: UserRole.TECHNICIAN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });

  await prisma.technicianProfile.upsert({
    where: { userId: technician.id },
    update: {
      isVerified: true,
      verifiedAt: new Date(),
    },
    create: {
      userId: technician.id,
      profession: 'Électricien',
      specialties: JSON.stringify([
        'Installation électrique',
        'Dépannage',
        'Tableau électrique',
      ]),
      studies: 'BTS Électrotechnique',
      certifications: JSON.stringify(['Habilitation électrique']),
      yearsExperience: 6,
      bio: 'Compte de démonstration pour la revue Apple App Store.',
      neighborhood: 'Akwa',
      city: 'Douala',
      latitude: 4.05,
      longitude: 9.7,
      serviceRadius: 15,
      isVerified: true,
      verifiedAt: new Date(),
      avgRating: 4.8,
      totalRatings: 12,
      completedJobs: 18,
      isAvailable: true,
      availableFrom: '08:00',
      availableTo: '18:00',
    },
  });

  // Ensure technician has an active license so they can use all features
  await prisma.license.upsert({
    where: { userId: technician.id },
    update: {
      status: 'ACTIVE',
      plan: 'standard',
    },
    create: {
      userId: technician.id,
      status: 'ACTIVE',
      plan: 'standard',
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  // ===========================================
  // KYC SUBMISSION (approved, so reviewer sees the verified state)
  // ===========================================
  console.log('🛡️  Upserting approved KYC submission…');

  const kyc = await prisma.kycSubmission.upsert({
    where: { technicianId: technician.id },
    update: {
      status: KycStatus.APPROVED,
      submittedAt: new Date(),
      reviewedAt: new Date(),
      adminNotes: 'Auto-approved for App Review demo account.',
      legalFirstName: 'Test',
      legalLastName: 'Technicien',
      dateOfBirth: new Date('1990-05-15'),
      nationality: 'Camerounaise',
      idNumber: 'DEMO-123456789',
      addressLine: 'Akwa, Douala',
      city: 'Douala',
    },
    create: {
      technicianId: technician.id,
      status: KycStatus.APPROVED,
      submittedAt: new Date(),
      reviewedAt: new Date(),
      adminNotes: 'Auto-approved for App Review demo account.',
      legalFirstName: 'Test',
      legalLastName: 'Technicien',
      dateOfBirth: new Date('1990-05-15'),
      nationality: 'Camerounaise',
      idNumber: 'DEMO-123456789',
      addressLine: 'Akwa, Douala',
      city: 'Douala',
    },
  });

  const requiredDocs: KycDocumentType[] = [
    KycDocumentType.ID_FRONT,
    KycDocumentType.ID_BACK,
    KycDocumentType.SELFIE,
  ];

  for (const type of requiredDocs) {
    await prisma.kycDocument.upsert({
      where: {
        submissionId_type: {
          submissionId: kyc.id,
          type,
        },
      },
      update: {
        status: KycDocumentStatus.APPROVED,
        reviewedAt: new Date(),
      },
      create: {
        submissionId: kyc.id,
        type,
        fileUrl: SAMPLE_DOC_URL,
        fileName: `${type.toLowerCase()}.png`,
        mimeType: 'image/png',
        status: KycDocumentStatus.APPROVED,
        reviewedAt: new Date(),
      },
    });
  }

  // ===========================================
  // SUMMARY
  // ===========================================
  console.log('');
  console.log('✅ Done. Test accounts ready:');
  console.log('');
  console.log(`   CLIENT     ${CLIENT_EMAIL}  /  ${PASSWORD}`);
  console.log(`   TECHNICIAN ${TECH_EMAIL}  /  ${PASSWORD}  (verified, KYC approved)`);
  console.log('');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
