import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import {
  PRODUCT_ASSESSMENT_TYPES,
  PRODUCT_TRAINING_PARAMETERS,
} from '../../common/product-defaults.js';

const prisma = new PrismaClient();

type DefaultsDb = Pick<PrismaClient, 'trainingParameter' | 'assessmentType' | 'exerciseLibrary'>;

export interface DefaultCategoryInstallResult {
  installed: number;
  skipped: number;
  total: number;
}

export interface ContractDefaultsInstallResult {
  trainingParameters: DefaultCategoryInstallResult;
  assessmentTypes: DefaultCategoryInstallResult;
  exercises: DefaultCategoryInstallResult;
}

interface ExerciseDefaultRow {
  nome?: string;
  name?: string;
  grupoMuscular?: string;
  muscleGroup?: string;
  equipamento?: string;
  nivel?: string;
  descricao?: string;
  notes?: string;
}

interface NormalizedExerciseDefault {
  name: string;
  category: string;
  muscleGroup: string | undefined;
  notes: string | undefined;
}

const normalizeExerciseName = (value: string) => value.trim().replace(/\s+/g, ' ');

function determineExerciseCategory(name: string) {
  const normalized = name.toLowerCase();

  if (normalized.includes('mobilidade') || normalized.includes('alongamento')) {
    return 'MOBILIDADE';
  }

  if (
    normalized.includes('corrida') ||
    normalized.includes('caminhada') ||
    normalized.includes('bike') ||
    normalized.includes('bicicleta') ||
    normalized.includes('esteira')
  ) {
    return 'CICLICO';
  }

  return 'RESISTIDO';
}

function resolveExerciseDefaultsPath() {
  const moduleRelativePath = fileURLToPath(
    new URL('../../scripts/exercises-data.json', import.meta.url)
  );
  const candidates = [
    moduleRelativePath,
    path.resolve(process.cwd(), 'src/scripts/exercises-data.json'),
    path.resolve(process.cwd(), 'apps/api/src/scripts/exercises-data.json'),
  ];

  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error('Catálogo padrão de exercícios não encontrado');
  }

  return resolved;
}

export function loadProductExerciseDefaults(): NormalizedExerciseDefault[] {
  const rows = JSON.parse(
    fs.readFileSync(resolveExerciseDefaultsPath(), 'utf-8')
  ) as ExerciseDefaultRow[];

  return rows
    .map((row) => {
      const name = normalizeExerciseName(row.name || row.nome || '');
      if (!name) return null;

      const muscleGroup = (row.muscleGroup || row.grupoMuscular || '').trim() || undefined;
      const notes = [
        (row.notes || row.descricao || '').trim() || null,
        row.equipamento?.trim() ? `Equipamento: ${row.equipamento.trim()}` : null,
        row.nivel?.trim() ? `Nível: ${row.nivel.trim()}` : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join('\n') || undefined;

      return {
        name,
        category: determineExerciseCategory(name),
        muscleGroup,
        notes,
      };
    })
    .filter((item): item is NormalizedExerciseDefault => item !== null);
}

async function installTrainingParameters(contractId: string, db: DefaultsDb) {
  const existing = await db.trainingParameter.findMany({
    where: { contractId },
    select: { category: true, code: true },
  });
  const existingKeys = new Set(existing.map((item) => `${item.category}\u0000${item.code}`));
  const missing = PRODUCT_TRAINING_PARAMETERS.filter(
    (item) => !existingKeys.has(`${item.category}\u0000${item.code}`)
  );

  const created = missing.length
    ? await db.trainingParameter.createMany({
        data: missing.map((item) => ({ ...item, contractId })),
        skipDuplicates: true,
      })
    : { count: 0 };

  return {
    installed: created.count,
    skipped: PRODUCT_TRAINING_PARAMETERS.length - created.count,
    total: PRODUCT_TRAINING_PARAMETERS.length,
  };
}

async function installAssessmentTypes(contractId: string, db: DefaultsDb) {
  const existing = await db.assessmentType.findMany({
    where: { contractId },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((item) => item.code));
  const missing = PRODUCT_ASSESSMENT_TYPES.filter((item) => !existingCodes.has(item.code));

  const created = missing.length
    ? await db.assessmentType.createMany({
        data: missing.map((item) => ({
          contractId,
          name: item.name,
          code: item.code,
          scheduleType: item.scheduleType,
          intervalMonths: item.intervalMonths,
          isActive: item.isActive,
        })),
        skipDuplicates: true,
      })
    : { count: 0 };

  return {
    installed: created.count,
    skipped: PRODUCT_ASSESSMENT_TYPES.length - created.count,
    total: PRODUCT_ASSESSMENT_TYPES.length,
  };
}

async function installExercises(contractId: string, db: DefaultsDb) {
  const defaults = loadProductExerciseDefaults();
  const existing = await db.exerciseLibrary.findMany({
    where: { contractId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((item) => item.name));
  const missing = defaults.filter((item) => !existingNames.has(item.name));

  const created = missing.length
    ? await db.exerciseLibrary.createMany({
        data: missing.map((item) => ({
          contractId,
          name: item.name,
          category: item.category,
          muscleGroup: item.muscleGroup,
          notes: item.notes,
        })),
      })
    : { count: 0 };

  return {
    installed: created.count,
    skipped: defaults.length - created.count,
    total: defaults.length,
  };
}

export async function installContractDefaults(
  contractId: string,
  db: DefaultsDb = prisma
): Promise<ContractDefaultsInstallResult> {
  const [trainingParameters, assessmentTypes, exercises] = await Promise.all([
    installTrainingParameters(contractId, db),
    installAssessmentTypes(contractId, db),
    installExercises(contractId, db),
  ]);

  return {
    trainingParameters,
    assessmentTypes,
    exercises,
  };
}
