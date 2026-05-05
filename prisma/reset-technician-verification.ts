/**
 * One-shot: mark every technician as unverified and reset their KYC submission
 * so they have to resubmit through the in-app flow.
 *
 * - TechnicianProfile.isVerified -> false
 * - TechnicianProfile.verifiedAt -> null
 * - Existing KycSubmission.status -> RESUBMISSION_REQUIRED (so the technician
 *   keeps their already-uploaded documents and just needs to resubmit them
 *   for review). Documents already APPROVED stay APPROVED so they don't
 *   re-upload identical files; documents PENDING/REJECTED keep their state.
 *
 * The technician will see a banner on the KYC screen and a notification
 * (email + in-app) once they resubmit and the admin approves/rejects.
 *
 * Run: npx ts-node prisma/reset-technician-verification.ts
 *      Add --hard to also delete existing KycSubmissions and force a fresh start.
 *
 * Idempotent: safe to run more than once.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const HARD = process.argv.includes('--hard');

async function main() {
  console.log(
    `🔄 Resetting technician verification${HARD ? ' (hard reset — KYC submissions will be deleted)' : ''}…`,
  );

  // 1) Mark every technician profile as unverified
  const profiles = await prisma.technicianProfile.updateMany({
    where: { isVerified: true },
    data: {
      isVerified: false,
      verifiedAt: null,
    },
  });
  console.log(`   Unverified ${profiles.count} TechnicianProfile row(s).`);

  if (HARD) {
    // Hard reset: delete every KycSubmission (cascade deletes documents).
    const subs = await prisma.kycSubmission.deleteMany({});
    console.log(`   Deleted ${subs.count} KycSubmission row(s).`);
  } else {
    // Soft reset: existing submissions go back to RESUBMISSION_REQUIRED so
    // the technician sees the "Vérification requise" banner and can edit.
    const subs = await prisma.kycSubmission.updateMany({
      where: {
        status: { in: ['APPROVED', 'SUBMITTED', 'UNDER_REVIEW', 'DRAFT'] },
      },
      data: {
        status: 'RESUBMISSION_REQUIRED',
        adminNotes:
          'Vérification réinitialisée par AlloTech. Veuillez soumettre à nouveau votre pièce d\'identité (CNI, passeport ou permis de conduire) pour finaliser la validation.',
        reviewedAt: null,
        reviewedBy: null,
      },
    });
    console.log(`   Reset ${subs.count} KycSubmission row(s) to RESUBMISSION_REQUIRED.`);
  }

  // Optional: count of technicians who now need to act
  const technicianCount = await prisma.user.count({
    where: { role: 'TECHNICIAN' },
  });
  const verifiedRemaining = await prisma.technicianProfile.count({
    where: { isVerified: true },
  });

  console.log('');
  console.log('✅ Done.');
  console.log(`   Total technicians: ${technicianCount}`);
  console.log(`   Verified after reset: ${verifiedRemaining}`);
  console.log(
    '   Each technician will see the KYC banner on next app open and must resubmit.',
  );
}

main()
  .catch((err) => {
    console.error('❌ Reset failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
