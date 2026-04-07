import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Map misspelled/variant professions to their correct canonical form
const corrections: Record<string, string> = {
  'mâcon': 'Maçon',
  'masson': 'Maçon',
  'maçonnerie': 'Maçon',
  'cauffreur et maçon': 'Maçon',
  'maçonnerie, et feraille': 'Maçon',
  'fleuriste , maçon': 'Maçon',
  'généraliste maçon': 'Maçon',
  'technicien maçon': 'Maçon',
  'maçon et autres': 'Maçon',
  'mâcon et carreleur': 'Maçon et Carreleur',
  'coffreur, mâcon': 'Coffreur et Maçon',
  'maçon et électricien': 'Maçon et Électricien',
  'carrefour, mâcon': 'Maçon',
  "l'électricien": 'Électricien',
  "l'électricien réseau eno": 'Électricien',
  'électricité': 'Électricien',
  'électricité en bâtiment': 'Électricien bâtiment',
  'lecto technique': 'Électrotechnicien',
  'sécurité électrique et réseaux': 'Électricien',
  'soudure': 'Soudeur',
  'soudure metalique': 'Soudeur',
  'peinture': 'Peintre',
  'peintre et enduit, crepissage': 'Peintre',
  'plomberie': 'Plombier',
  'foie et climatisation': 'Froid et climatisation',
  'menuiserie': 'Menuisier',
  'menuiserie moderne': 'Menuisier',
  'menuiserie aluminium': 'Menuisier Aluminium',
  'menuiserie métallique': 'Menuisier métallique',
  'menuiserie métallique (soudure)': 'Menuisier métallique',
  'menuisier metalique (soudure)': 'Menuisier métallique',
  'menuisier allu': 'Menuisier Aluminium',
  'menuisier alu ,': 'Menuisier Aluminium',
  'menuisier revêtement': 'Menuisier',
  'menuiserie moderne et tapisserie': 'Menuisier',
  'furniture': 'Menuisier',
  'vitrerie': 'Vitrier',
  'vitrerie aluminium': 'Vitrier Aluminium',
  'vitrine': 'Vitrier',
  'tollerie': 'Tôlier',
  'toleur': 'Tôlier',
  'tôlerie': 'Tôlier',
  'chaudronnerie': 'Chaudronnier',
  'chaudronnier soudé': 'Chaudronnier',
  'chaudronnier et construction métallique': 'Chaudronnier',
  'chaluniste': 'Chaudronnier',
  'btp': 'BTP',
  'mécanicien auto': 'Mécanicien auto',
  'mécanicien automobile': 'Mécanicien auto',
  'mécanicien auto piod lourd': 'Mécanicien poids lourd',
  'maintenancier automobile': 'Mécanicien auto',
  'réparateur de voiture': 'Mécanicien auto',
  'mécanique auto espèce': 'Mécanicien auto',
  'mécanique btp': 'Mécanicien BTP',
  'génie civil': 'Ingénieur civil',
  'technicien en génie civil': 'Ingénieur civil',
  'ingénieur en génie civil': 'Ingénieur civil',
  'ingénieur en bâtiment': 'Ingénieur civil',
  'ferrailleur en bâtiment et génie civil': 'Ferrailleur',
  'génie civil et autres activités métalliques': 'Ingénieur civil',
  'carreleur, plombier': 'Carreleur et Plombier',
  'plombier et carreleur': 'Plombier et Carreleur',
  'plombier en bâtiment': 'Plombier',
  'peintre et carreleur': 'Peintre et Carreleur',
  'peintre bâtiment': 'Peintre',
  'foreurs': 'Foreur',
  'stagiaire en rh': 'Stagiaire RH',
  'ouvrier et manoeuvre': 'Manoeuvre',
  'maintenancier à mac book': 'Maintenance informatique',
  'maintenance informatique et dépannage': 'Maintenance informatique',
  'réparation et vente d\'ordinateur': 'Maintenance informatique',
  'support informatique': 'Maintenance informatique',
  'vernissage ( finition  des meubles )': 'Vernisseur',
  'etanchéïté': 'Étanchéiste',
  'rebonineur et entretien des machines': 'Rebobineur',
  'technicien dans les vidéos surveillance': 'Vidéosurveillance',
  'électricien et vidéo surveillance': 'Électricien',
  'électricien et opérateur réseau': 'Électricien',
  'électricien ( énergie renouvelable)': 'Électricien',
  'électricien, plombier et soudeur': 'Électricien',
  'infographe et serigraphe': 'Infographe',
  'jardinier, paysagiste': 'Jardinier',
  'technicien en bâtiment': 'Technicien bâtiment',
  'réparation des groupes électrogène': 'Électromécanicien',
  'mécanicien d\'appareil du génie civil': 'Mécanicien',
  'tout terrain': 'Manoeuvre',
  'accusantium quis in': 'Autre',
  'aut id eum aut dolor': 'Autre',
};

async function main() {
  let totalFixed = 0;

  // 1. First trim ALL trailing/leading spaces
  const all = await prisma.technicianOnboarding.findMany({
    select: { id: true, profession: true },
  });

  for (const record of all) {
    const trimmed = record.profession.trim();
    if (trimmed !== record.profession) {
      await prisma.technicianOnboarding.update({
        where: { id: record.id },
        data: { profession: trimmed },
      });
      totalFixed++;
    }
  }
  console.log(`Trimmed spaces: ${totalFixed} records`);

  // 2. Apply corrections
  let corrected = 0;
  for (const [wrong, right] of Object.entries(corrections)) {
    const result = await prisma.technicianOnboarding.updateMany({
      where: {
        profession: {
          equals: wrong,
          mode: 'insensitive',
        },
      },
      data: { profession: right },
    });
    if (result.count > 0) {
      console.log(`  "${wrong}" → "${right}": ${result.count} records`);
      corrected += result.count;
    }
  }
  console.log(`\nCorrected misspellings: ${corrected} records`);
  console.log(`Total fixed: ${totalFixed + corrected} records`);

  // 3. Show final state
  const final = await prisma.technicianOnboarding.groupBy({
    by: ['profession'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });
  console.log('\n=== Final professions ===');
  for (const p of final) {
    console.log(`  ${p.profession.padEnd(30)} ${p._count.id}`);
  }
}

main().finally(() => prisma.$disconnect());
