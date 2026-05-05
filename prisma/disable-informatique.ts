/**
 * One-shot: deactivate the "Informatique" NeedCategory.
 *
 * We don't DELETE the row because existing Need / NeedSubCategory records
 * may foreign-key to it. Setting `isActive = false` removes it from
 * client-facing listings while preserving historical references.
 *
 * Run with: npx ts-node prisma/disable-informatique.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.needCategory.updateMany({
    where: { name: 'Informatique' },
    data: { isActive: false },
  });

  console.log(
    `Deactivated ${result.count} NeedCategory row(s) named "Informatique".`,
  );

  // Also deactivate any sub-categories under Informatique (cosmetic — they
  // won't render once the parent is hidden).
  const subResult = await prisma.needSubCategory.updateMany({
    where: { category: { name: 'Informatique' } },
    data: { isActive: false },
  });
  console.log(
    `Deactivated ${subResult.count} NeedSubCategory row(s) under "Informatique".`,
  );
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
