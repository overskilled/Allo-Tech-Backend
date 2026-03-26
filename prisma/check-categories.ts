import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cats = await prisma.needCategory.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { needs: true, subCategories: true } },
    },
  });

  console.log('\n=== All NeedCategories ===');
  for (const c of cats) {
    console.log(`${c.id} | ${c.name.padEnd(20)} | needs: ${c._count.needs} | subs: ${c._count.subCategories} | active: ${c.isActive}`);
  }

  // Find duplicates
  const nameMap = new Map<string, typeof cats>();
  for (const c of cats) {
    const key = c.name.trim().toLowerCase();
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key)!.push(c);
  }

  console.log('\n=== Duplicates ===');
  for (const [name, entries] of nameMap) {
    if (entries.length > 1) {
      console.log(`"${name}" appears ${entries.length} times:`);
      for (const e of entries) {
        console.log(`  - ${e.id} | needs: ${e._count.needs} | subs: ${e._count.subCategories}`);
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
