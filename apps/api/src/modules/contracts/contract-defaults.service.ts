import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  PRODUCT_ASSESSMENT_TYPES,
  PRODUCT_TRAINING_PARAMETERS,
} from '../../common/product-defaults.js';

const prisma = new PrismaClient();

type DefaultsDb = Pick<PrismaClient, 'trainingParameter' | 'assessmentType' | 'exerciseLibrary'>;

type ExerciseCatalogRow = Record<string, unknown>;

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
  const candidates = [
    path.resolve(process.cwd(), 'src/scripts/exercises-data.json'),
    path.resolve(process.cwd(), 'dist/scripts/exercises-data.json'),
    path.resolve(process.cwd(), 'apps/api/src/scripts/exercises-data.json'),
    path.resolve(process.cwd(), 'apps/api/dist/scripts/exercises-data.json'),
  ];

  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error('Catálogo padrão de exercícios não encontrado');
  }

  return resolved;
}

function invalidExerciseCatalog(message: string): never {
  throw new Error(`Catálogo padrão de exercícios inválido: ${message}`);
}

function parseExerciseCatalog(raw: string): ExerciseCatalogRow[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalidExerciseCatalog('JSON malformado');
  }

  if (!Array.isArray(parsed)) {
    return invalidExerciseCatalog('a raiz deve ser uma lista de exercícios');
  }

  return parsed.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return invalidExerciseCatalog(`item ${index + 1} deve ser um objeto`);
    }
    return row as ExerciseCatalogRow;
  });
}

function readCatalogString(
  row: ExerciseCatalogRow,
  field: string,
  index: number
): string | undefined {
  const value = row[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    return invalidExerciseCatalog(`item ${index + 1}, campo ${field}, deve ser texto`);
  }
  return value;
}

export function loadProductExerciseDefaults(): NormalizedExerciseDefault[] {
  const rows = parseExerciseCatalog(
    fs.readFileSync(resolveExerciseDefaultsPath(), 'utf-8')
  );
  const seenNames = new Set<string>();

  return rows.map((row, index) => {
    const rawName =
      readCatalogString(row, 'name', index) ?? readCatalogString(row, 'nome', index) ?? '';
    const name = normalizeExerciseName(rawName);
    if (!name) {
      return invalidExerciseCatalog(`item ${index + 1} não possui name/nome válido`);
    }
    if (seenNames.has(name)) {
      return invalidExerciseCatalog(`nome duplicado após normalização: ${name}`);
    }
    seenNames.add(name);

    const muscleGroup =
      (
        readCatalogString(row, 'muscleGroup', index) ??
        readCatalogString(row, 'grupoMuscular', index) ??
        ''
      ).trim() || undefined;
    const notes =
      [
        (
          readCatalogString(row, 'notes', index) ??
          readCatalogString(row, 'descricao', index) ??
          ''
        ).trim() || null,
        readCatalogString(row, 'equipamento', index)?.trim()
          ? `Equipamento: ${readCatalogString(row, 'equipamento', index)?.trim()}`
          : null,
        readCatalogString(row, 'nivel', index)?.trim()
          ? `Nível: ${readCatalogString(row, 'nivel', index)?.trim()}`
          : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join('\n') || undefined;

    return {
      name,
      category: determineExerciseCategory(name),
      muscleGroup,
      notes,
    };
  });
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

async function installContractDefaultsUnlocked(
  contractId: string,
  db: DefaultsDb
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

export async function installContractDefaults(
  contractId: string,
  db: DefaultsDb | PrismaClient = prisma
): Promise<ContractDefaultsInstallResult> {
  const transactionalDb = db as PrismaClient;

  if (typeof transactionalDb.$transaction !== 'function') {
    return installContractDefaultsUnlocked(contractId, db as DefaultsDb);
  }

  return transactionalDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${contractId})::bigint)`;
    return installContractDefaultsUnlocked(contractId, tx);
  });
}
