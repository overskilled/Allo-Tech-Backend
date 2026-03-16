import { PrismaClient, UserRole, UserStatus, LicenseStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...\n');

  // ===========================================
  // SYSTEM SETTINGS
  // ===========================================
  console.log('📝 Creating system settings...');

  const settings = [
    { key: 'app.name', value: 'AlloTech', type: 'string', category: 'general', isPublic: true },
    { key: 'app.version', value: '1.0.0', type: 'string', category: 'general', isPublic: true },
    { key: 'app.maintenance', value: 'false', type: 'boolean', category: 'general', isPublic: true },
    { key: 'app.maintenanceMessage', value: 'Le système est en maintenance. Veuillez réessayer plus tard.', type: 'string', category: 'general', isPublic: true },

    // License settings
    { key: 'license.trialDays', value: '15', type: 'number', category: 'license', isPublic: false },
    { key: 'license.basicPrice', value: '5000', type: 'number', category: 'license', isPublic: true },
    { key: 'license.standardPrice', value: '10000', type: 'number', category: 'license', isPublic: true },
    { key: 'license.premiumPrice', value: '25000', type: 'number', category: 'license', isPublic: true },

    // Payment settings
    { key: 'payment.currency', value: 'XAF', type: 'string', category: 'payments', isPublic: true },
    { key: 'payment.commissionRate', value: '10', type: 'number', category: 'payments', isPublic: false },
    { key: 'payment.minPayout', value: '5000', type: 'number', category: 'payments', isPublic: true },

    // Feature flags
    { key: 'feature.mobileMoneyEnabled', value: 'true', type: 'boolean', category: 'features', isPublic: true },
    { key: 'feature.paypalEnabled', value: 'true', type: 'boolean', category: 'features', isPublic: true },
    { key: 'feature.realTimeTracking', value: 'true', type: 'boolean', category: 'features', isPublic: true },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
  console.log(`  ✓ Created ${settings.length} system settings`);

  // ===========================================
  // ADMIN USER
  // ===========================================
  console.log('\n👤 Creating admin user...');

  const adminPassword = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@allotech.cm' },
    update: {},
    create: {
      email: 'admin@allotech.cm',
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'AlloTech',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });
  console.log(`  ✓ Admin created: ${admin.email}`);

  // ===========================================
  // AGENT USER
  // ===========================================
  console.log('\n👤 Creating agent user...');

  const agentPassword = await bcrypt.hash('Agent@123', 10);
  const agent = await prisma.user.upsert({
    where: { email: 'agent@allotech.cm' },
    update: {},
    create: {
      email: 'agent@allotech.cm',
      passwordHash: agentPassword,
      firstName: 'Agent',
      lastName: 'AlloTech',
      role: UserRole.AGENT,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });
  console.log(`  ✓ Agent created: ${agent.email}`);

  // ===========================================
  // NEED CATEGORIES
  // ===========================================
  console.log('\n📂 Creating need categories...');

  const categories = [
    {
      name: 'Plomberie',
      description: 'Services de plomberie et sanitaire',
      icon: 'droplets',
      order: 1,
      subCategories: [
        { name: 'Fuite d\'eau', description: 'Réparation de fuites' },
        { name: 'Débouchage', description: 'Débouchage de canalisations' },
        { name: 'Installation sanitaire', description: 'Installation de sanitaires' },
        { name: 'Chauffe-eau', description: 'Installation et réparation de chauffe-eau' },
      ],
    },
    {
      name: 'Électricité',
      description: 'Services électriques',
      icon: 'zap',
      order: 2,
      subCategories: [
        { name: 'Panne électrique', description: 'Dépannage électrique' },
        { name: 'Installation', description: 'Installation électrique' },
        { name: 'Tableau électrique', description: 'Installation et réparation de tableaux' },
        { name: 'Éclairage', description: 'Installation d\'éclairage' },
      ],
    },
    {
      name: 'Peinture',
      description: 'Services de peinture intérieure et extérieure',
      icon: 'paintbrush',
      order: 3,
      subCategories: [
        { name: 'Peinture intérieure', description: 'Peinture des murs intérieurs' },
        { name: 'Peinture extérieure', description: 'Peinture des façades' },
        { name: 'Décoration', description: 'Peinture décorative' },
      ],
    },
    {
      name: 'Menuiserie',
      description: 'Services de menuiserie bois et aluminium',
      icon: 'hammer',
      order: 4,
      subCategories: [
        { name: 'Portes', description: 'Installation et réparation de portes' },
        { name: 'Fenêtres', description: 'Installation et réparation de fenêtres' },
        { name: 'Meubles sur mesure', description: 'Fabrication de meubles' },
        { name: 'Réparation', description: 'Réparation de meubles' },
      ],
    },
    {
      name: 'Climatisation',
      description: 'Installation et entretien de climatisation',
      icon: 'wind',
      order: 5,
      subCategories: [
        { name: 'Installation', description: 'Installation de climatiseurs' },
        { name: 'Entretien', description: 'Entretien et nettoyage' },
        { name: 'Réparation', description: 'Réparation de climatiseurs' },
        { name: 'Recharge gaz', description: 'Recharge de gaz réfrigérant' },
      ],
    },
    {
      name: 'Informatique',
      description: 'Services informatiques et réseaux',
      icon: 'monitor',
      order: 6,
      subCategories: [
        { name: 'Dépannage PC', description: 'Réparation d\'ordinateurs' },
        { name: 'Installation réseau', description: 'Installation de réseaux' },
        { name: 'Récupération données', description: 'Récupération de données' },
        { name: 'Maintenance', description: 'Maintenance informatique' },
      ],
    },
    {
      name: 'Maçonnerie',
      description: 'Travaux de maçonnerie et construction',
      icon: 'building',
      order: 7,
      subCategories: [
        { name: 'Construction', description: 'Construction de murs' },
        { name: 'Rénovation', description: 'Rénovation de bâtiments' },
        { name: 'Carrelage', description: 'Pose de carrelage' },
      ],
    },
    {
      name: 'Jardinage',
      description: 'Services d\'entretien de jardins',
      icon: 'flower',
      order: 8,
      subCategories: [
        { name: 'Entretien jardin', description: 'Entretien régulier' },
        { name: 'Élagage', description: 'Élagage d\'arbres' },
        { name: 'Aménagement', description: 'Aménagement paysager' },
      ],
    },
  ];

  for (const cat of categories) {
    const { subCategories, ...categoryData } = cat;

    const category = await prisma.needCategory.upsert({
      where: { name: cat.name },
      update: { description: cat.description, icon: cat.icon, order: cat.order },
      create: categoryData,
    });

    // Create subcategories
    for (const subCat of subCategories) {
      await prisma.needSubCategory.upsert({
        where: {
          categoryId_name: { categoryId: category.id, name: subCat.name }
        },
        update: { description: subCat.description },
        create: {
          categoryId: category.id,
          name: subCat.name,
          description: subCat.description,
        },
      });
    }
  }
  console.log(`  ✓ Created ${categories.length} categories with subcategories`);

  // ===========================================
  // DEMO CLIENT USER
  // ===========================================
  console.log('\n👤 Creating demo client user...');

  const clientPassword = await bcrypt.hash('Client@123', 10);
  const client = await prisma.user.upsert({
    where: { email: 'client@demo.com' },
    update: {},
    create: {
      email: 'client@demo.com',
      passwordHash: clientPassword,
      firstName: 'Jean',
      lastName: 'Dupont',
      phone: '+237690000001',
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      clientProfile: {
        create: {
          city: 'Douala',
          neighborhood: 'Bonanjo',
          latitude: 4.0511,
          longitude: 9.7679,
        },
      },
    },
  });
  console.log(`  ✓ Demo client created: ${client.email}`);

  // ===========================================
  // DEMO TECHNICIAN USERS
  // ===========================================
  console.log('\n👤 Creating demo technician users...');

  const technicianData = [
    {
      email: 'electricien@demo.com',
      firstName: 'Paul',
      lastName: 'Mbarga',
      phone: '+237690000002',
      profession: 'Électricien',
      specialties: ['Installation', 'Dépannage', 'Tableau électrique'],
      city: 'Douala',
      latitude: 4.0520,
      longitude: 9.7700,
    },
    {
      email: 'plombier@demo.com',
      firstName: 'Marie',
      lastName: 'Ngo',
      phone: '+237690000003',
      profession: 'Plombier',
      specialties: ['Fuite d\'eau', 'Débouchage', 'Installation'],
      city: 'Douala',
      latitude: 4.0480,
      longitude: 9.7650,
    },
    {
      email: 'peintre@demo.com',
      firstName: 'Samuel',
      lastName: 'Fotso',
      phone: '+237690000004',
      profession: 'Peintre',
      specialties: ['Intérieur', 'Extérieur', 'Décoration'],
      city: 'Douala',
      latitude: 4.0550,
      longitude: 9.7720,
    },
  ];

  const techPassword = await bcrypt.hash('Tech@123', 10);

  for (const tech of technicianData) {
    const user = await prisma.user.upsert({
      where: { email: tech.email },
      update: {},
      create: {
        email: tech.email,
        passwordHash: techPassword,
        firstName: tech.firstName,
        lastName: tech.lastName,
        phone: tech.phone,
        role: UserRole.TECHNICIAN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        technicianProfile: {
          create: {
            profession: tech.profession,
            specialties: JSON.stringify(tech.specialties),
            city: tech.city,
            latitude: tech.latitude,
            longitude: tech.longitude,
            isVerified: true,
            verifiedAt: new Date(),
            yearsExperience: Math.floor(Math.random() * 10) + 2,
            avgRating: 4 + Math.random(),
            totalRatings: Math.floor(Math.random() * 100) + 10,
            completedJobs: Math.floor(Math.random() * 200) + 20,
            isAvailable: true,
          },
        },
        license: {
          create: {
            status: LicenseStatus.ACTIVE,
            plan: 'standard',
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        },
      },
    });
    console.log(`  ✓ Technician created: ${user.email}`);
  }

  // ===========================================
  // SUMMARY
  // ===========================================
  console.log('\n' + '='.repeat(50));
  console.log('🎉 Database seeding completed successfully!');
  console.log('='.repeat(50));
  console.log('\n📋 Demo Accounts:');
  console.log('─'.repeat(50));
  console.log('Admin:      admin@allotech.cm / Admin@123');
  console.log('Agent:      agent@allotech.cm / Agent@123');
  console.log('Client:     client@demo.com / Client@123');
  console.log('Technician: electricien@demo.com / Tech@123');
  console.log('Technician: plombier@demo.com / Tech@123');
  console.log('Technician: peintre@demo.com / Tech@123');
  console.log('─'.repeat(50) + '\n');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
