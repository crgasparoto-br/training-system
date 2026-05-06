import { PrismaClient, LoadType, MovementType, CountingType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * Conjunções e preposições que devem ficar em minúsculas
 */
const LOWERCASE_WORDS = new Set([
  'a', 'à', 'ao', 'aos', 'as',
  'com', 'contra',
  'da', 'das', 'de', 'do', 'dos',
  'e', 'em',
  'na', 'nas', 'no', 'nos',
  'o', 'os',
  'para', 'pelo', 'pela', 'pelos', 'pelas', 'por',
  'sem', 'sob', 'sobre',
  'um', 'uma', 'uns', 'umas',
]);

/**
 * Normaliza o nome do exercício:
 * - Remove espaços extras
 * - Primeira letra de cada palavra em maiúscula
 * - Conjunções em minúscula
 * - Mantém acentuação correta
 */
function normalizeName(name: string): string {
  if (!name) return '';

  // Remove espaços extras
  const cleaned = name.trim().replace(/\s+/g, ' ');

  // Divide em palavras
  const words = cleaned.split(' ');

  // Processa cada palavra
  const normalized = words.map((word, index) => {
    const lowerWord = word.toLowerCase();

    // Primeira palavra sempre maiúscula
    if (index === 0) {
      return capitalizeFirst(word);
    }

    // Conjunções e preposições em minúscula
    if (LOWERCASE_WORDS.has(lowerWord)) {
      return lowerWord;
    }

    // Outras palavras com primeira letra maiúscula
    return capitalizeFirst(word);
  });

  return normalized.join(' ');
}

/**
 * Capitaliza a primeira letra mantendo o resto como está
 */
function capitalizeFirst(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Valida e normaliza tipo de carga
 */
function normalizeLoadType(value?: string): LoadType | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (['H', 'C', 'E', 'A', 'P', 'O'].includes(upper)) {
    return upper as LoadType;
  }
  return undefined;
}

/**
 * Valida e normaliza tipo de movimento
 */
function normalizeMovementType(value?: string): MovementType | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (['U', 'I', 'O'].includes(upper)) {
    return upper as MovementType;
  }
  return undefined;
}

/**
 * Valida e normaliza tipo de contagem
 */
function normalizeCountingType(value?: string): CountingType | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (['I', 'T', 'R'].includes(upper)) {
    return upper as CountingType;
  }
  return undefined;
}

/**
 * Determina categoria baseada no nome do exercício
 */
function determineCategory(name: string): string {
  const lower = name.toLowerCase();
  
  if (lower.includes('mobilidade') || lower.includes('alongamento')) {
    return 'MOBILIDADE';
  }
  
  if (
    lower.includes('corrida') ||
    lower.includes('caminhada') ||
    lower.includes('bike') ||
    lower.includes('bicicleta') ||
    lower.includes('esteira')
  ) {
    return 'CICLICO';
  }
  
  return 'RESISTIDO';
}

/**
 * Interface dos dados da planilha
 */
interface ExerciseRow {
  name: string;
  videoUrl?: string;
  loadType?: string;
  movementType?: string;
  countingType?: string;
  muscleGroup?: string;
  notes?: string;
}

/**
 * Importa exercícios de um arquivo JSON
 */
async function importExercises(filePath: string) {
  console.log('🚀 Iniciando importação de exercícios...\n');

  const contractId =
    process.env.CONTRACT_ID ||
    (await prisma.companyContract.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }))?.id;

  if (!contractId) {
    console.error('❌ Nenhum contrato encontrado. Defina CONTRACT_ID.');
    process.exit(1);
  }

  // Ler arquivo JSON
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const rows: ExerciseRow[] = JSON.parse(fileContent);

  console.log(`📄 Arquivo lido: ${rows.length} exercícios encontrados\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      // Normalizar nome
      const normalizedName = normalizeName(row.name);

      if (!normalizedName) {
        console.log(`⚠️  Pulando linha sem nome`);
        skipped++;
        continue;
      }

      // Verificar se já existe
      const existing = await prisma.exerciseLibrary.findFirst({
        where: { name: normalizedName, contractId },
      });

      if (existing) {
        console.log(`⏭️  Pulando "${normalizedName}" (já existe)`);
        skipped++;
        continue;
      }

      // Preparar dados
      const data = {
        contractId,
        name: normalizedName,
        videoUrl: row.videoUrl?.trim() || undefined,
        loadType: normalizeLoadType(row.loadType),
        movementType: normalizeMovementType(row.movementType),
        countingType: normalizeCountingType(row.countingType),
        category: determineCategory(normalizedName),
        muscleGroup: row.muscleGroup?.trim() || undefined,
        notes: row.notes?.trim() || undefined,
      };

      // Criar exercício
      await prisma.exerciseLibrary.create({ data });

      console.log(`✅ Importado: "${normalizedName}"`);
      imported++;
    } catch (error) {
      console.error(`❌ Erro ao importar "${row.name}":`, error);
      errors++;
    }
  }

  console.log('\n📊 Resumo da Importação:');
  console.log(`   ✅ Importados: ${imported}`);
  console.log(`   ⏭️  Pulados: ${skipped}`);
  console.log(`   ❌ Erros: ${errors}`);
  console.log(`   📄 Total: ${rows.length}\n`);
}

/**
 * Exemplo de uso
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('❌ Uso: npm run import-exercises <caminho-do-arquivo.json>\n');
    console.log('Exemplo de formato JSON:');
    console.log(JSON.stringify([
      {
        name: 'agachamento livre',
        videoUrl: 'https://youtube.com/watch?v=...',
        loadType: 'C',
        movementType: 'O',
        countingType: 'R',
        notes: 'Exercício básico de quadríceps',
      },
    ], null, 2));
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }

  try {
    await importExercises(filePath);
    console.log('✅ Importação concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro na importação:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar
main();

