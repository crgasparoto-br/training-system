import { PrismaClient } from '@prisma/client';
import { PRODUCT_TRAINING_PARAMETERS } from '../src/common/product-defaults.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Training Parameters...');

  const contracts = await prisma.companyContract.findMany({
    select: { id: true },
  });

  let created = 0;
  let skipped = 0;

  for (const contract of contracts) {
    const result = await prisma.trainingParameter.createMany({
      data: PRODUCT_TRAINING_PARAMETERS.map((parameter) => ({
        ...parameter,
        contractId: contract.id,
      })),
      skipDuplicates: true,
    });

    created += result.count;
    skipped += PRODUCT_TRAINING_PARAMETERS.length - result.count;
  }

  console.log(`✅ Parâmetros instalados: ${created}`);
  console.log(`⏭️  Parâmetros já existentes: ${skipped}`);
  console.log(`🏢 Contratos processados: ${contracts.length}`);
}

main()
  .catch((error) => {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
