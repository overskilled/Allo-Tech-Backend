import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const professions = await prisma.technicianOnboarding.groupBy({
    by: ['profession'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log('=== TechnicianOnboarding professions ===');
  for (const p of professions) {
    const hex = [...p.profession].map(c => c.charCodeAt(0).toString(16)).join(' ');
    console.log(`"${p.profession}" (count: ${p._count.id}) [hex: ${hex}]`);
  }

  const profiles = await prisma.technicianProfile.groupBy({
    by: ['profession'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log('\n=== TechnicianProfile professions ===');
  for (const p of profiles) {
    console.log(`"${p.profession}" (count: ${p._count.id})`);
  }
}

main().finally(() => prisma.$disconnect());
