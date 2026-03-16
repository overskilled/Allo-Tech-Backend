/**
 * COMPREHENSIVE SEED DATA
 * ========================
 * This seed creates a fully operational demo with realistic mission history
 * including needs, candidatures, appointments, quotations, payments, and ratings.
 *
 * Run with: npx prisma db seed
 */

import { PrismaClient, UserRole, UserStatus, NeedStatus, NeedUrgency, CandidatureStatus, AppointmentStatus, QuotationStatus, PaymentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main() {
  console.log('🌱 Starting comprehensive seed...');

  // Clean up transactional data for idempotent re-runs (order matters for FK constraints)
  console.log('🧹 Cleaning up existing seed data...');
  await prisma.rating.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.candidature.deleteMany();
  await prisma.need.deleteMany();
  await prisma.realization.deleteMany();
  await prisma.license.deleteMany();

  // ===========================================
  // 1. SYSTEM SETTINGS
  // ===========================================
  console.log('📋 Seeding system settings...');

  await prisma.systemSetting.upsert({
    where: { key: 'app_name' },
    update: {},
    create: { key: 'app_name', value: 'AlloTech', category: 'general', isPublic: true },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'app_version' },
    update: {},
    create: { key: 'app_version', value: '1.0.0', category: 'general', isPublic: true },
  });

  // License pricing
  await prisma.systemSetting.upsert({
    where: { key: 'license_basic_price' },
    update: {},
    create: { key: 'license_basic_price', value: '5000', category: 'licensing', isPublic: true },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'license_standard_price' },
    update: {},
    create: { key: 'license_standard_price', value: '10000', category: 'licensing', isPublic: true },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'license_premium_price' },
    update: {},
    create: { key: 'license_premium_price', value: '25000', category: 'licensing', isPublic: true },
  });

  // Payment settings
  await prisma.systemSetting.upsert({
    where: { key: 'payment_currency' },
    update: {},
    create: { key: 'payment_currency', value: 'XAF', category: 'payments', isPublic: true },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'payment_commission_rate' },
    update: {},
    create: { key: 'payment_commission_rate', value: '10', category: 'payments', isPublic: false },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'payment_minimum_payout' },
    update: {},
    create: { key: 'payment_minimum_payout', value: '5000', category: 'payments', isPublic: false },
  });

  // Feature flags
  await prisma.systemSetting.upsert({
    where: { key: 'feature_mobile_money' },
    update: {},
    create: { key: 'feature_mobile_money', value: 'true', category: 'features', isPublic: false },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'feature_paypal' },
    update: {},
    create: { key: 'feature_paypal', value: 'true', category: 'features', isPublic: false },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'feature_realtime_tracking' },
    update: {},
    create: { key: 'feature_realtime_tracking', value: 'true', category: 'features', isPublic: true },
  });

  // ===========================================
  // 2. USERS
  // ===========================================
  console.log('👥 Seeding users...');

  const passwordHash = await bcrypt.hash('password123', SALT_ROUNDS);

  // Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@allotech.cm' },
    update: {},
    create: {
      email: 'admin@allotech.cm',
      passwordHash: await bcrypt.hash('Admin@123', SALT_ROUNDS),
      firstName: 'Admin',
      lastName: 'System',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });

  // Manager
  const manager = await prisma.user.upsert({
    where: { email: 'manager@allotech.cm' },
    update: {},
    create: {
      email: 'manager@allotech.cm',
      passwordHash: await bcrypt.hash('Manager@123', SALT_ROUNDS),
      firstName: 'Manager',
      lastName: 'AlloTech',
      role: UserRole.AGENT,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });

  // Helper to randomize coordinates around Douala center (4.0511, 9.7679)
  const randomAround = (center: number, range: number) =>
    center + (Math.random() - 0.5) * 2 * range;

  // Store client location data for creating ClientProfiles — all around Douala
  const clientLocations = [
    {
      address: '12 Rue de la Liberté, Bonamoussadi',
      neighborhood: 'Bonamoussadi',
      city: 'Douala',
      latitude: randomAround(4.0650, 0.008),
      longitude: randomAround(9.7450, 0.008),
    },
    {
      address: '45 Boulevard de la République, Akwa',
      neighborhood: 'Akwa',
      city: 'Douala',
      latitude: randomAround(4.0483, 0.008),
      longitude: randomAround(9.7043, 0.008),
    },
    {
      address: '8 Quartier Bonaberi',
      neighborhood: 'Bonabéri',
      city: 'Douala',
      latitude: randomAround(4.0698, 0.008),
      longitude: randomAround(9.6844, 0.008),
    },
    {
      address: '23 Rue Joss, Deido',
      neighborhood: 'Deido',
      city: 'Douala',
      latitude: randomAround(4.0560, 0.008),
      longitude: randomAround(9.7150, 0.008),
    },
    {
      address: '67 Avenue Douala Manga Bell, Bonapriso',
      neighborhood: 'Bonapriso',
      city: 'Douala',
      latitude: randomAround(4.0200, 0.008),
      longitude: randomAround(9.6950, 0.008),
    },
  ];

  // Clients (5 demo clients) - WITHOUT location fields
  const clients = await Promise.all([
    prisma.user.upsert({
      where: { email: 'client1@demo.com' },
      update: {},
      create: {
        email: 'client1@demo.com',
        passwordHash: passwordHash,
        firstName: 'Jean',
        lastName: 'Dupont',
        phone: '+237690000001',
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'client2@demo.com' },
      update: {},
      create: {
        email: 'client2@demo.com',
        passwordHash: passwordHash,
        firstName: 'Marie',
        lastName: 'Kouam',
        phone: '+237690000002',
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'client3@demo.com' },
      update: {},
      create: {
        email: 'client3@demo.com',
        passwordHash: passwordHash,
        firstName: 'Paul',
        lastName: 'Tagne',
        phone: '+237690000003',
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'client4@demo.com' },
      update: {},
      create: {
        email: 'client4@demo.com',
        passwordHash: passwordHash,
        firstName: 'Alice',
        lastName: 'Nkengfack',
        phone: '+237690000004',
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'client5@demo.com' },
      update: {},
      create: {
        email: 'client5@demo.com',
        passwordHash: passwordHash,
        firstName: 'Bernard',
        lastName: 'Fouda',
        phone: '+237690000005',
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    }),
  ]);

  // Create ClientProfiles with location data
  console.log('📍 Creating client profiles...');
  for (let i = 0; i < clients.length; i++) {
    await prisma.clientProfile.upsert({
      where: { userId: clients[i].id },
      update: {
        address: clientLocations[i].address,
        neighborhood: clientLocations[i].neighborhood,
        city: clientLocations[i].city,
        latitude: clientLocations[i].latitude,
        longitude: clientLocations[i].longitude,
      },
      create: {
        userId: clients[i].id,
        address: clientLocations[i].address,
        neighborhood: clientLocations[i].neighborhood,
        city: clientLocations[i].city,
        latitude: clientLocations[i].latitude,
        longitude: clientLocations[i].longitude,
      },
    });
  }

  // Store technician location data — all around Douala
  const technicianLocations = [
    {
      address: '10 Rue Manga Bell, Bali',
      neighborhood: 'Bali',
      city: 'Douala',
      latitude: randomAround(4.0614, 0.008),
      longitude: randomAround(9.7064, 0.008),
    },
    {
      address: '15 Boulevard de la République, Bepanda',
      neighborhood: 'Bepanda',
      city: 'Douala',
      latitude: randomAround(4.0697, 0.008),
      longitude: randomAround(9.7194, 0.008),
    },
    {
      address: '7 Carrefour Ndokotti',
      neighborhood: 'Ndokotti',
      city: 'Douala',
      latitude: randomAround(4.0450, 0.008),
      longitude: randomAround(9.7350, 0.008),
    },
    {
      address: '33 Rue Franqueville, Akwa',
      neighborhood: 'Akwa',
      city: 'Douala',
      latitude: randomAround(4.0503, 0.008),
      longitude: randomAround(9.7061, 0.008),
    },
    {
      address: '19 Avenue Makepe',
      neighborhood: 'Makepe',
      city: 'Douala',
      latitude: randomAround(4.0750, 0.008),
      longitude: randomAround(9.7400, 0.008),
    },
  ];

  // Technicians (5 demo technicians) - WITHOUT location fields
  const technicians = await Promise.all([
    prisma.user.upsert({
      where: { email: 'electricien@demo.com' },
      update: {},
      create: {
        email: 'electricien@demo.com',
        passwordHash: await bcrypt.hash('Tech@123', SALT_ROUNDS),
        firstName: 'Paul',
        lastName: 'Mbarga',
        phone: '+237690001001',
        role: UserRole.TECHNICIAN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'plombier@demo.com' },
      update: {},
      create: {
        email: 'plombier@demo.com',
        passwordHash: await bcrypt.hash('Tech@123', SALT_ROUNDS),
        firstName: 'Marie',
        lastName: 'Ngo',
        phone: '+237690001002',
        role: UserRole.TECHNICIAN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'peintre@demo.com' },
      update: {},
      create: {
        email: 'peintre@demo.com',
        passwordHash: await bcrypt.hash('Tech@123', SALT_ROUNDS),
        firstName: 'Samuel',
        lastName: 'Fotso',
        phone: '+237690001003',
        role: UserRole.TECHNICIAN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'menuisier@demo.com' },
      update: {},
      create: {
        email: 'menuisier@demo.com',
        passwordHash: passwordHash,
        firstName: 'Julien',
        lastName: 'Kamga',
        phone: '+237690001004',
        role: UserRole.TECHNICIAN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'climaticien@demo.com' },
      update: {},
      create: {
        email: 'climaticien@demo.com',
        passwordHash: passwordHash,
        firstName: 'Christine',
        lastName: 'Mvondo',
        phone: '+237690001005',
        role: UserRole.TECHNICIAN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    }),
  ]);

  // ===========================================
  // 3. CATEGORIES
  // ===========================================
  console.log('📦 Seeding categories...');

  const categories = [
    { name: 'Plomberie', icon: 'wrench', description: 'Installation et réparation de plomberie' },
    { name: 'Électricité', icon: 'zap', description: 'Travaux électriques et installations' },
    { name: 'Peinture', icon: 'paintbrush', description: 'Peinture intérieure et extérieure' },
    { name: 'Menuiserie', icon: 'hammer', description: 'Travaux de menuiserie et ébénisterie' },
    { name: 'Climatisation', icon: 'wind', description: 'Installation et maintenance de climatisation' },
    { name: 'Informatique', icon: 'monitor', description: 'Dépannage et installation informatique' },
    { name: 'Maçonnerie', icon: 'layers', description: 'Travaux de construction et rénovation' },
    { name: 'Jardinage', icon: 'leaf', description: 'Entretien des espaces verts' },
  ];

  const createdCategories = [];
  for (const category of categories) {
    const cat = await prisma.needCategory.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
    createdCategories.push(cat);
  }

  // ===========================================
  // 4. TECHNICIAN PROFILES
  // ===========================================
  console.log('🔧 Seeding technician profiles...');

  const techProfiles = [
    {
      userId: technicians[0].id,
      profession: 'Électricien',
      specialties: ['Installation électrique', 'Dépannage', 'Tableau électrique', 'Éclairage'],
      studies: 'BTS Électrotechnique',
      certifications: ['Habilitation électrique', 'NF C 15-100'],
      yearsExperience: 8,
      bio: 'Électricien professionnel avec 8 ans d\'expérience. Spécialisé dans les installations résidentielles et commerciales.',
      isVerified: true,
      avgRating: 4.8,
      totalRatings: 45,
      completedJobs: 120,
    },
    {
      userId: technicians[1].id,
      profession: 'Plombier',
      specialties: ['Fuite d\'eau', 'Installation sanitaire', 'Débouchage', 'Chauffage'],
      studies: 'CAP Plomberie',
      certifications: ['PGN (Professionnel Gaz Naturel)', 'PGP (Professionnel Gaz Propane)'],
      yearsExperience: 6,
      bio: 'Plombier qualifié, interventions rapides pour tous vos problèmes de plomberie.',
      isVerified: true,
      avgRating: 4.7,
      totalRatings: 38,
      completedJobs: 95,
    },
    {
      userId: technicians[2].id,
      profession: 'Peintre',
      specialties: ['Peinture intérieure', 'Peinture extérieure', 'Décoration', 'Enduit'],
      studies: 'CAP Peinture',
      certifications: ['Peinture décorative', 'Application d\'enduits'],
      yearsExperience: 5,
      bio: 'Peintre professionnel pour tous vos travaux de peinture et décoration.',
      isVerified: true,
      avgRating: 4.9,
      totalRatings: 52,
      completedJobs: 110,
    },
    {
      userId: technicians[3].id,
      profession: 'Menuisier',
      specialties: ['Menuiserie bois', 'Menuiserie aluminium', 'Pose de portes', 'Agencement'],
      studies: 'CAP Menuiserie',
      certifications: ['Menuiserie sur mesure'],
      yearsExperience: 10,
      bio: 'Menuisier expérimenté, fabrication et pose de menuiseries sur mesure.',
      isVerified: true,
      avgRating: 4.6,
      totalRatings: 31,
      completedJobs: 78,
    },
    {
      userId: technicians[4].id,
      profession: 'Technicien climatisation',
      specialties: ['Installation clim', 'Maintenance clim', 'Dépannage clim', 'Climatisation réversible'],
      studies: 'BTS Génie climatique',
      certifications: ['Manipulation fluides frigorigènes', 'QUALIPAC'],
      yearsExperience: 7,
      bio: 'Technicien spécialisé en climatisation et pompes à chaleur.',
      isVerified: true,
      avgRating: 4.7,
      totalRatings: 29,
      completedJobs: 67,
    },
  ];

  for (let i = 0; i < techProfiles.length; i++) {
    const profile = techProfiles[i];
    await prisma.technicianProfile.upsert({
      where: { userId: profile.userId },
      update: {},
      create: {
        user: { connect: { id: profile.userId } },
        profession: profile.profession,
        specialties: JSON.stringify(profile.specialties),
        studies: profile.studies,
        certifications: JSON.stringify(profile.certifications),
        yearsExperience: profile.yearsExperience,
        bio: profile.bio,
        isVerified: profile.isVerified,
        avgRating: profile.avgRating,
        totalRatings: profile.totalRatings,
        completedJobs: profile.completedJobs,
        neighborhood: technicianLocations[i].neighborhood,
        city: technicianLocations[i].city,
        latitude: technicianLocations[i].latitude,
        longitude: technicianLocations[i].longitude,
        isAvailable: true,
        serviceRadius: 15,
      },
    });
  }

  // ===========================================
  // 5. LICENSES
  // ===========================================
  console.log('📜 Seeding licenses...');

  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);

  for (const technician of technicians) {
    await prisma.license.create({
      data: {
        user: { connect: { id: technician.id } },
        plan: 'STANDARD',
        status: 'ACTIVE',
        startDate: now,
        endDate: futureDate,
      },
    });
  }

  // ===========================================
  // 6. NEEDS (Service Requests)
  // ===========================================
  console.log('📝 Seeding needs (service requests)...');

  // Need 1: Completed electrician mission
  const need1 = await prisma.need.create({
    data: {
      clientId: clients[0].id,
      categoryId: createdCategories.find(c => c.name === 'Électricité')!.id,
      title: 'Installation de prises électriques',
      description: 'Besoin d\'installer 5 prises électriques dans le salon et la chambre',
      urgency: NeedUrgency.NORMAL,
      status: NeedStatus.COMPLETED,
      address: clientLocations[0].address,
      neighborhood: clientLocations[0].neighborhood,
      city: clientLocations[0].city,
      latitude: clientLocations[0].latitude,
      longitude: clientLocations[0].longitude,
      budgetMin: 50000,
      budgetMax: 80000,
      preferredDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      flexibleSchedule: true,
      publishedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600',
        'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=600',
      ]),
    },
  });

  // Need 2: In progress plumbing job
  const need2 = await prisma.need.create({
    data: {
      clientId: clients[1].id,
      categoryId: createdCategories.find(c => c.name === 'Plomberie')!.id,
      title: 'Réparation fuite d\'eau',
      description: 'Fuite au niveau du robinet de la cuisine, urgent',
      urgency: NeedUrgency.URGENT,
      status: NeedStatus.IN_PROGRESS,
      address: clientLocations[1].address,
      neighborhood: clientLocations[1].neighborhood,
      city: clientLocations[1].city,
      latitude: clientLocations[1].latitude,
      longitude: clientLocations[1].longitude,
      budgetMin: 30000,
      budgetMax: 50000,
      preferredDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      flexibleSchedule: false,
      publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=600',
        'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=600',
        'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=600',
      ]),
    },
  });

  // Need 3: Open painting job
  const need3 = await prisma.need.create({
    data: {
      clientId: clients[2].id,
      categoryId: createdCategories.find(c => c.name === 'Peinture')!.id,
      title: 'Peinture chambre',
      description: 'Peinture complète d\'une chambre (12m²), blanc cassé',
      urgency: NeedUrgency.NORMAL,
      status: NeedStatus.OPEN,
      address: clientLocations[2].address,
      neighborhood: clientLocations[2].neighborhood,
      city: clientLocations[2].city,
      latitude: clientLocations[2].latitude,
      longitude: clientLocations[2].longitude,
      budgetMin: 60000,
      budgetMax: 100000,
      preferredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      flexibleSchedule: true,
      publishedAt: new Date(),
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=600',
        'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600',
      ]),
    },
  });

  // Need 4: Completed carpentry job
  const need4 = await prisma.need.create({
    data: {
      clientId: clients[3].id,
      categoryId: createdCategories.find(c => c.name === 'Menuiserie')!.id,
      title: 'Fabrication porte en bois',
      description: 'Besoin d\'une porte en bois massif sur mesure',
      urgency: NeedUrgency.NORMAL,
      status: NeedStatus.COMPLETED,
      address: clientLocations[3].address,
      neighborhood: clientLocations[3].neighborhood,
      city: clientLocations[3].city,
      latitude: clientLocations[3].latitude,
      longitude: clientLocations[3].longitude,
      budgetMin: 150000,
      budgetMax: 200000,
      preferredDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      flexibleSchedule: true,
      publishedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1534237886190-ced735ca4b73?w=600',
      ]),
    },
  });

  // Need 5: Open AC installation
  const need5 = await prisma.need.create({
    data: {
      clientId: clients[4].id,
      categoryId: createdCategories.find(c => c.name === 'Climatisation')!.id,
      title: 'Installation climatiseur',
      description: 'Installation d\'un climatiseur split 12000 BTU dans le salon',
      urgency: NeedUrgency.HIGH,
      status: NeedStatus.OPEN,
      address: clientLocations[4].address,
      neighborhood: clientLocations[4].neighborhood,
      city: clientLocations[4].city,
      latitude: clientLocations[4].latitude,
      longitude: clientLocations[4].longitude,
      budgetMin: 200000,
      budgetMax: 300000,
      preferredDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      flexibleSchedule: false,
      publishedAt: new Date(),
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=600',
        'https://images.unsplash.com/photo-1631545806609-3180c0671163?w=600',
      ]),
    },
  });

  // ===========================================
  // 7. CANDIDATURES
  // ===========================================
  console.log('✋ Seeding candidatures...');

  // Candidatures for Need 1 (completed - electrician)
  await prisma.candidature.create({
    data: {
      needId: need1.id,
      technicianId: technicians[0].id,
      message: 'Je suis électricien qualifié avec 8 ans d\'expérience. Je peux réaliser votre installation dans les règles de l\'art.',
      proposedPrice: 65000,
      proposedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      status: CandidatureStatus.ACCEPTED,
    },
  });

  // Candidatures for Need 2 (in progress - plumber)
  await prisma.candidature.create({
    data: {
      needId: need2.id,
      technicianId: technicians[1].id,
      message: 'Plombier disponible immédiatement pour intervention urgente.',
      proposedPrice: 35000,
      proposedDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      status: CandidatureStatus.ACCEPTED,
    },
  });

  // Candidatures for Need 3 (open - painter - multiple bids)
  await prisma.candidature.createMany({
    data: [
      {
        needId: need3.id,
        technicianId: technicians[2].id,
        message: 'Peintre professionnel, devis détaillé sur demande. Travail soigné garanti.',
        proposedPrice: 75000,
        proposedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: CandidatureStatus.PENDING,
      },
    ],
  });

  // Candidatures for Need 4 (completed - carpentry)
  await prisma.candidature.create({
    data: {
      needId: need4.id,
      technicianId: technicians[3].id,
      message: 'Menuisier expérimenté, fabrication sur mesure en bois massif. Photos de réalisations disponibles.',
      proposedPrice: 180000,
      proposedDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      status: CandidatureStatus.ACCEPTED,
    },
  });

  // Candidatures for Need 5 (open - AC)
  await prisma.candidature.createMany({
    data: [
      {
        needId: need5.id,
        technicianId: technicians[4].id,
        message: 'Technicien certifié en climatisation. Installation professionnelle avec garantie.',
        proposedPrice: 250000,
        proposedDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        status: CandidatureStatus.PENDING,
      },
    ],
  });

  // ===========================================
  // 8. APPOINTMENTS
  // ===========================================
  console.log('📅 Seeding appointments...');

  // Appointment 1: Completed (Need 1 - electrician)
  const apt1 = await prisma.appointment.create({
    data: {
      needId: need1.id,
      clientId: clients[0].id,
      technicianId: technicians[0].id,
      scheduledDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      scheduledTime: '09:00',
      duration: 180,
      address: clientLocations[0].address,
      latitude: clientLocations[0].latitude,
      longitude: clientLocations[0].longitude,
      status: AppointmentStatus.COMPLETED,
      notes: 'Installation de 5 prises électriques',
      technicianStartedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000),
      technicianArrivedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1.5 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
    },
  });

  // Appointment 2: In progress (Need 2 - plumber)
  const apt2 = await prisma.appointment.create({
    data: {
      needId: need2.id,
      clientId: clients[1].id,
      technicianId: technicians[1].id,
      scheduledDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      scheduledTime: '14:00',
      duration: 120,
      address: clientLocations[1].address,
      latitude: clientLocations[1].latitude,
      longitude: clientLocations[1].longitude,
      status: AppointmentStatus.CONFIRMED,
      notes: 'Réparation fuite robinet cuisine - urgent',
    },
  });

  // Appointment 3: Completed (Need 4 - carpentry)
  const apt3 = await prisma.appointment.create({
    data: {
      needId: need4.id,
      clientId: clients[3].id,
      technicianId: technicians[3].id,
      scheduledDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      scheduledTime: '10:00',
      duration: 240,
      address: clientLocations[3].address,
      latitude: clientLocations[3].latitude,
      longitude: clientLocations[3].longitude,
      status: AppointmentStatus.COMPLETED,
      notes: 'Prise de mesures et fabrication porte',
      technicianStartedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000 - 1 * 60 * 60 * 1000),
      technicianArrivedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000 - 0.5 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
    },
  });

  // ===========================================
  // 9. QUOTATIONS
  // ===========================================
  console.log('📋 Seeding quotations...');

  // Quotation 1: Accepted & Signed (Need 1 - electrician)
  const quot1 = await prisma.quotation.create({
    data: {
      needId: need1.id,
      technicianId: technicians[0].id,
      stateOfWork: 'État des lieux: Salon et chambre nécessitent 5 prises électriques. Tableau électrique existant en bon état. Câbles à tirer sous gaine.',
      urgencyLevel: NeedUrgency.NORMAL,
      proposedSolution: 'Installation de 5 prises encastrées avec terre, conformes à la norme NF C 15-100. Fourniture et pose de câbles 2,5mm² sous gaine. Protection par disjoncteur 20A.',
      materials: JSON.stringify([
        { name: 'Prises encastrées avec terre', quantity: 5, unitPrice: 3000 },
        { name: 'Câble 2,5mm² (mètres)', quantity: 25, unitPrice: 500 },
        { name: 'Gaine ICTA', quantity: 20, unitPrice: 300 },
        { name: 'Disjoncteur 20A', quantity: 1, unitPrice: 8000 },
      ]),
      laborCost: 35000,
      materialsCost: 29000,
      totalCost: 64000,
      currency: 'XAF',
      status: QuotationStatus.ACCEPTED,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      clientSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      clientSignedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      respondedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });

  // Quotation 2: Sent (Need 2 - plumber - awaiting signature)
  const signToken = 'abc123-demo-token-plumber';
  const quot2 = await prisma.quotation.create({
    data: {
      needId: need2.id,
      technicianId: technicians[1].id,
      stateOfWork: 'État des lieux: Fuite au niveau du robinet mitigeur de la cuisine. Joint usé. Robinetterie vieillissante.',
      urgencyLevel: NeedUrgency.URGENT,
      proposedSolution: 'Remplacement complet du robinet mitigeur par un modèle moderne avec économie d\'eau. Installation avec joints PTFE.',
      materials: JSON.stringify([
        { name: 'Robinet mitigeur cuisine', quantity: 1, unitPrice: 18000 },
        { name: 'Joints et flexibles', quantity: 1, unitPrice: 5000 },
        { name: 'Téflon PTFE', quantity: 1, unitPrice: 2000 },
      ]),
      laborCost: 15000,
      materialsCost: 25000,
      totalCost: 40000,
      currency: 'XAF',
      status: QuotationStatus.SENT,
      signatureToken: signToken,
      signatureTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    },
  });

  // Quotation 3: Accepted & Signed (Need 4 - carpentry)
  const quot3 = await prisma.quotation.create({
    data: {
      needId: need4.id,
      technicianId: technicians[3].id,
      stateOfWork: 'État des lieux: Prise de mesures effectuée (H: 210cm x L: 90cm). Porte à réaliser en bois massif (sapelli) avec finition vernis.',
      urgencyLevel: NeedUrgency.NORMAL,
      proposedSolution: 'Fabrication sur mesure d\'une porte pleine en bois sapelli. Pose avec paumelles laiton. Finition vernis mat 3 couches.',
      materials: JSON.stringify([
        { name: 'Bois sapelli (m²)', quantity: 2.5, unitPrice: 35000 },
        { name: 'Paumelles laiton', quantity: 3, unitPrice: 8000 },
        { name: 'Serrure encastrée', quantity: 1, unitPrice: 15000 },
        { name: 'Vernis mat (litre)', quantity: 2, unitPrice: 12000 },
      ]),
      laborCost: 80000,
      materialsCost: 135500,
      totalCost: 215500,
      currency: 'XAF',
      status: QuotationStatus.ACCEPTED,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      clientSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      clientSignedAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
      respondedAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
    },
  });

  // ===========================================
  // 10. PAYMENTS
  // ===========================================
  console.log('💳 Seeding payments...');

  // Payment for Need 1 (electrician - completed and paid)
  await prisma.payment.create({
    data: {
      clientId: clients[0].id,
      technicianId: technicians[0].id,
      amount: 64000,
      currency: 'XAF',
      paymentMethod: 'mobile_money',
      transactionId: 'MTN-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      status: PaymentStatus.COMPLETED,
      paidAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      paymentDetails: JSON.stringify({
        provider: 'MTN Mobile Money',
        phone: clients[0].phone,
      }),
    },
  });

  // Payment for Need 4 (carpentry - completed and paid)
  await prisma.payment.create({
    data: {
      clientId: clients[3].id,
      technicianId: technicians[3].id,
      amount: 215500,
      currency: 'XAF',
      paymentMethod: 'mobile_money',
      transactionId: 'OM-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      status: PaymentStatus.COMPLETED,
      paidAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      paymentDetails: JSON.stringify({
        provider: 'Orange Money',
        phone: clients[3].phone,
      }),
    },
  });

  // ===========================================
  // 11. RATINGS
  // ===========================================
  console.log('⭐ Seeding ratings...');

  // Rating for electrician (Need 1)
  await prisma.rating.create({
    data: {
      clientId: clients[0].id,
      technicianId: technicians[0].id,
      score: 5,
      comment: 'Excellent travail, très professionnel et ponctuel. Je recommande vivement !',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
  });

  // Rating for carpentry (Need 4)
  await prisma.rating.create({
    data: {
      clientId: clients[3].id,
      technicianId: technicians[3].id,
      score: 5,
      comment: 'Magnifique porte sur mesure, finition impeccable. Artisan très compétent.',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });

  // ===========================================
  // 12. REALIZATIONS (Portfolio)
  // ===========================================
  console.log('🖼️ Seeding realizations...');

  await prisma.realization.createMany({
    data: [
      {
        technicianId: technicians[0].id,
        title: 'Installation tableau électrique',
        description: 'Remplacement complet d\'un tableau électrique aux normes NF C 15-100',
        category: 'Électricité',
        imageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400',
      },
      {
        technicianId: technicians[1].id,
        title: 'Installation salle de bain complète',
        description: 'Pose lavabo, douche et WC avec évacuations',
        category: 'Plomberie',
        imageUrl: 'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=400',
      },
      {
        technicianId: technicians[2].id,
        title: 'Peinture salon moderne',
        description: 'Peinture salon 2 couleurs avec bandes décoratives',
        category: 'Peinture',
        imageUrl: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400',
      },
      {
        technicianId: technicians[3].id,
        title: 'Porte bois massif sur mesure',
        description: 'Fabrication et pose porte en sapelli vernis',
        category: 'Menuiserie',
        imageUrl: 'https://images.unsplash.com/photo-1534237886190-ced735ca4b73?w=400',
      },
      {
        technicianId: technicians[4].id,
        title: 'Installation climatiseur split',
        description: 'Installation clim réversible 12000 BTU avec cache groupe',
        category: 'Climatisation',
        imageUrl: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400',
      },
    ],
  });

  console.log('✅ Comprehensive seed completed successfully!');
  console.log('\n📊 DEMO DATA SUMMARY:');
  console.log('  - 2 Admin/Manager users');
  console.log('  - 5 Demo clients (with ClientProfiles)');
  console.log('  - 5 Demo technicians (all verified with active licenses)');
  console.log('  - 8 Service categories');
  console.log('  - 5 Needs (2 completed, 1 in progress, 2 open)');
  console.log('  - 6 Candidatures across all needs');
  console.log('  - 3 Appointments (2 completed, 1 confirmed)');
  console.log('  - 3 Quotations (2 accepted & signed, 1 sent awaiting signature)');
  console.log('  - 2 Payments (completed)');
  console.log('  - 2 Ratings (5 stars)');
  console.log('  - 5 Portfolio realizations');
  console.log('\n🔐 TEST ACCOUNTS:');
  console.log('  Admin: admin@allotech.cm / Admin@123');
  console.log('  Manager: manager@allotech.cm / Manager@123');
  console.log('  Client 1: client1@demo.com / password123 (Jean Dupont - has completed mission)');
  console.log('  Client 2: client2@demo.com / password123 (Marie Kouam - has in-progress job)');
  console.log('  Technician 1: electricien@demo.com / Tech@123 (Paul Mbarga - completed mission)');
  console.log('  Technician 2: plombier@demo.com / Tech@123 (Marie Ngo - in-progress job)');
  console.log('\n🔗 DEMO SIGNING LINK:');
  console.log(`  http://localhost:5173/devis/signer/${signToken}`);
  console.log('  (Marie Kouam can sign plumber quotation)');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
