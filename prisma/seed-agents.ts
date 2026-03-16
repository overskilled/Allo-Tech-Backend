/**
 * AGENT SEED
 * ==========
 * Seeds the 3 real agents into the database.
 * Run with: npx ts-node prisma/seed-agents.ts
 *
 * Agents:
 *  - Mendomo Raissa   (679737098)
 *  - Onono Roussin    (686108969)
 *  - Ekane Lagloire   (679283581)
 */

import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

const agents = [
  {
    firstName: 'Mendomo',
    lastName: 'Raissa',
    phone: '+237679737098',
    email: 'mendomo.raissa@allotechafrica.com',
  },
  {
    firstName: 'Onono',
    lastName: 'Roussin',
    phone: '+237686108969',
    email: 'onono.roussin@allotechafrica.com',
  },
  {
    firstName: 'Ekane',
    lastName: 'Lagloire',
    phone: '+237679283581',
    email: 'ekane.lagloire@allotechafrica.com',
  },
  {
    firstName: 'Mah',
    lastName: 'Danielle',
    phone: '+237698745944',
    email: 'mah.danielle@allotechafrica.com',
  },
  {
    firstName: 'Adidangaba',
    lastName: 'Florence',
    phone: '+237658861068',
    email: 'adidangaba.florence@allotechafrica.com',
  },
];

async function main() {
  console.log('🌱 Seeding agents...');

  const defaultPassword = await bcrypt.hash('Agent@123', SALT_ROUNDS);

  for (const agent of agents) {
    const user = await prisma.user.upsert({
      where: { email: agent.email },
      update: {
        phone: agent.phone,
        role: UserRole.AGENT,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: agent.email,
        passwordHash: defaultPassword,
        firstName: agent.firstName,
        lastName: agent.lastName,
        phone: agent.phone,
        role: UserRole.AGENT,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    });

    console.log(`✅ Agent upserted: ${user.firstName} ${user.lastName} (${user.email})`);
  }

  console.log('\n🔐 Agent accounts:');
  for (const agent of agents) {
    console.log(`  ${agent.firstName} ${agent.lastName}: ${agent.email} / Agent@123`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
