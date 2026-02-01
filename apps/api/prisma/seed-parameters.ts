import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Training Parameters...');

  // Carga Microciclo
  const cargaMicrociclo = [
    { code: 'ADP', description: 'Adaptação', order: 1 },
    { code: 'ORD', description: 'Ordenado', order: 2 },
    { code: 'CHO', description: 'Choque', order: 3 },
    { code: 'REG', description: 'Regenerativo', order: 4 },
  ];

  for (const param of cargaMicrociclo) {
    await prisma.trainingParameter.upsert({
      where: {
        category_code: {
          category: 'carga_microciclo',
          code: param.code,
        },
      },
      update: {
        description: param.description,
        order: param.order,
      },
      create: {
        category: 'carga_microciclo',
        code: param.code,
        description: param.description,
        order: param.order,
        active: true,
      },
    });
  }
  console.log('✅ Carga Microciclo: 4 parâmetros');

  // Montagem
  const montagem = [
    { code: 'AS', description: 'Alternado por Segmento', order: 1 },
    { code: 'A/AN', description: 'Agonista/Antagonista', order: 2 },
    { code: 'CA', description: 'Circuito Aeróbico', order: 3 },
    { code: 'CGM', description: 'Circuito Grupo Muscular', order: 4 },
    { code: 'MIS', description: 'Misto', order: 5 },
  ];

  for (const param of montagem) {
    await prisma.trainingParameter.upsert({
      where: {
        category_code: {
          category: 'montagem',
          code: param.code,
        },
      },
      update: {
        description: param.description,
        order: param.order,
      },
      create: {
        category: 'montagem',
        code: param.code,
        description: param.description,
        order: param.order,
        active: true,
      },
    });
  }
  console.log('✅ Montagem: 5 parâmetros');

  // Método
  const metodo = [
    { code: 'SER', description: 'Séries', order: 1 },
    { code: 'BS', description: 'Bi-Set', order: 2 },
    { code: 'TS', description: 'Tri-Set', order: 3 },
    { code: 'SS', description: 'Super Set', order: 4 },
    { code: 'CIR', description: 'Circuito', order: 5 },
    { code: 'CS', description: 'Cluster Set', order: 6 },
    { code: 'PC', description: 'Pirâmide Crescente', order: 7 },
    { code: 'PD', description: 'Pirâmide Decrescente', order: 8 },
    { code: 'DS', description: 'Drop Set', order: 9 },
    { code: 'RP', description: 'Rest-Pause', order: 10 },
    { code: 'SN', description: 'Strip Set', order: 11 },
    { code: 'FST-7', description: 'FST-7', order: 12 },
  ];

  for (const param of metodo) {
    await prisma.trainingParameter.upsert({
      where: {
        category_code: {
          category: 'metodo',
          code: param.code,
        },
      },
      update: {
        description: param.description,
        order: param.order,
      },
      create: {
        category: 'metodo',
        code: param.code,
        description: param.description,
        order: param.order,
        active: true,
      },
    });
  }
  console.log('✅ Método: 12 parâmetros');

  // Divisão do Treino
  const divisao = [
    { code: 'FB', description: 'Full Body', order: 1 },
    { code: 'AB', description: 'AB (2 divisões)', order: 2 },
    { code: 'ABC', description: 'ABC (3 divisões)', order: 3 },
    { code: 'ABCD', description: 'ABCD (4 divisões)', order: 4 },
    { code: 'ABCDE', description: 'ABCDE (5 divisões)', order: 5 },
  ];

  for (const param of divisao) {
    await prisma.trainingParameter.upsert({
      where: {
        category_code: {
          category: 'divisao_treino',
          code: param.code,
        },
      },
      update: {
        description: param.description,
        order: param.order,
      },
      create: {
        category: 'divisao_treino',
        code: param.code,
        description: param.description,
        order: param.order,
        active: true,
      },
    });
  }
  console.log('✅ Divisão do Treino: 5 parâmetros');

  console.log('\n🎉 Seed completed successfully!');
  console.log('Total: 26 parâmetros criados');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
