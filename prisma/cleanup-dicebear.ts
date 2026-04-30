/**
 * One-shot cleanup: nulls out any User.profileImage that points to api.dicebear.com.
 * Run with: npx ts-node prisma/cleanup-dicebear.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: { profileImage: { contains: 'api.dicebear.com' } },
    data: { profileImage: null },
  });
  console.log(`Cleared dicebear profileImage on ${result.count} user(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
