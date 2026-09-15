import fs from 'node:fs';
import path from 'node:path';
import {
  MovementType,
  PrismaClient,
  type CountingType,
  type LoadType,
} from '@prisma/client';
import {
  PRODUCT_ASSESSMENT_TYPES,
  PRODUCT_TRAINING_PARAMETERS,
} from '../../common/product-defaults.js';
import { repairPtBrMojibake } from '../../common/pt-br-text.js';

const prisma = new PrismaClient();

type DefaultsDb = Pick<PrismaClient, 'trainingParameter' | 'assessmentType' | 'exerciseLibrary'>;

type ExerciseCatalogRow = Record<string, unknown>;

type ExistingExerciseDefault = {
  name: string;
  videoUrl: string | null;
  loadType: LoadType | null;
  movementType: MovementType | null;
  countingType: CountingType | null;
  category: string | null;
  muscleGroup: string | null;
  notes: string | null;
};

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
  videoUrl: string | undefined;
  loadType: LoadType | undefined;
  movementType: MovementType | undefined;
  countingType: CountingType | undefined;
  category: string;
  muscleGroup: string | undefined;
  notes: string | undefined;
}

const LOAD_TYPES = new Set<string>(['H', 'C', 'E', 'A', 'P', 'O']);
const MOVEMENT_TYPES = new Set<string>(Object.values(MovementType));
const COUNTING_TYPES = new Set<string>(['I', 'T', 'R']);

const normalizeExerciseName = (value: string) =>
  repairPtBrMojibake(value).trim().replace(/\s+/g, ' ');

const normalizeOptionalCatalogText = (value: string | undefined) =>
  value ? repairPtBrMojibake(value).trim() || undefined : undefined;

function normalizeCatalogCode<T extends string>(
  value: string | undefined,
  allowed: ReadonlySet<string>
): T | undefined {
  const normalized = normalizeOptionalCatalogText(value)?.toUpperCase();
  return normalized && allowed.has(normalized) ? (normalized as T) : undefined;
}

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

function mergeMissingExerciseDefaultFields(
  target: NormalizedExerciseDefault,
  source: NormalizedExerciseDefault
) {
  if (!target.videoUrl && source.videoUrl) target.videoUrl = source.videoUrl;
  if (!target.loadType && source.loadType) target.loadType = source.loadType;
  if (!target.movementType && source.movementType) target.movementType = source.movementType;
  if (!target.countingType && source.countingType) target.countingType = source.countingType;
  if (!target.muscleGroup && source.muscleGroup) target.muscleGroup = source.muscleGroup;
  if (!target.notes && source.notes) target.notes = source.notes;
}

export function loadProductExerciseDefaults(): NormalizedExerciseDefault[] {
  const rows = parseExerciseCatalog(
    fs.readFileSync(resolveExerciseDefaultsPath(), 'utf-8')
  );
  const defaultsByName = new Map<string, NormalizedExerciseDefault>();

  for (const [index, row] of rows.entries()) {
    const rawName =
      readCatalogString(row, 'name', index) ?? readCatalogString(row, 'nome', index) ?? '';
    const name = normalizeExerciseName(rawName);
    if (!name) {
      return invalidExerciseCatalog(`item ${index + 1} não possui name/nome válido`);
    }

    const muscleGroup = normalizeOptionalCatalogText(
      readCatalogString(row, 'muscleGroup', index) ??
        readCatalogString(row, 'grupoMuscular', index)
    );
    const notes =
      [
        normalizeOptionalCatalogText(
          readCatalogString(row, 'notes', index) ??
            readCatalogString(row, 'descricao', index)
        ) ?? null,
        normalizeOptionalCatalogText(readCatalogString(row, 'equipamento', index))
          ? `Equipamento: ${normalizeOptionalCatalogText(readCatalogString(row, 'equipamento', index))}`
          : null,
        normalizeOptionalCatalogText(readCatalogString(row, 'nivel', index))
          ? `Nível: ${normalizeOptionalCatalogText(readCatalogString(row, 'nivel', index))}`
          : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join('\n') || undefined;

    const candidate: NormalizedExerciseDefault = {
      name,
      videoUrl: normalizeOptionalCatalogText(readCatalogString(row, 'videoUrl', index)),
      loadType: normalizeCatalogCode<LoadType>(
        readCatalogString(row, 'loadType', index),
        LOAD_TYPES
      ),
      movementType: normalizeCatalogCode<MovementType>(
        readCatalogString(row, 'movementType', index),
        MOVEMENT_TYPES
      ),
      countingType: normalizeCatalogCode<CountingType>(
        readCatalogString(row, 'countingType', index),
        COUNTING_TYPES
      ),
      category: determineExerciseCategory(name),
      muscleGroup,
      notes,
    };

    const existing = defaultsByName.get(name);
    if (existing) {
      mergeMissingExerciseDefaultFields(existing, candidate);
    } else {
      defaultsByName.set(name, candidate);
    }
  }

  return [...defaultsByName.values()];
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

async function repairExistingExerciseNames(
  contractId: string,
  defaults: NormalizedExerciseDefault[],
  existingExercises: ExistingExerciseDefault[],
  db: DefaultsDb
) {
  const defaultNames = new Set(defaults.map((item) => item.name));
  const existingNames = new Set(existingExercises.map((item) => item.name));

  for (const item of existingExercises) {
    const repairedName = normalizeExerciseName(item.name);
    if (
      repairedName === item.name ||
      !defaultNames.has(repairedName) ||
      existingNames.has(repairedName)
    ) {
      continue;
    }

    const updated = await db.exerciseLibrary.updateMany({
      where: { contractId, name: item.name },
      data: { name: repairedName },
    });

    if (updated.count > 0) {
      existingNames.delete(item.name);
      existingNames.add(repairedName);
      item.name = repairedName;
    }
  }
}

function missingExerciseFields(
  existing: ExistingExerciseDefault,
  canonical: NormalizedExerciseDefault
) {
  const data: Partial<Omit<ExistingExerciseDefault, 'name'>> = {};

  if (!existing.videoUrl?.trim() && canonical.videoUrl) data.videoUrl = canonical.videoUrl;
  if (!existing.loadType && canonical.loadType) data.loadType = canonical.loadType;
  if (!existing.movementType && canonical.movementType) data.movementType = canonical.movementType;
  if (!existing.countingType && canonical.countingType) data.countingType = canonical.countingType;
  if (!existing.category?.trim() && canonical.category) data.category = canonical.category;
  if (!existing.muscleGroup?.trim() && canonical.muscleGroup) {
    data.muscleGroup = canonical.muscleGroup;
  }
  if (!existing.notes?.trim() && canonical.notes) data.notes = canonical.notes;

  return data;
}

async function installExercises(contractId: string, db: DefaultsDb) {
  const defaults = loadProductExerciseDefaults();
  const existing = (await db.exerciseLibrary.findMany({
    where: { contractId },
    select: {
      name: true,
      videoUrl: true,
      loadType: true,
      movementType: true,
      countingType: true,
      category: true,
      muscleGroup: true,
      notes: true,
    },
  })) as ExistingExerciseDefault[];

  await repairExistingExerciseNames(contractId, defaults, existing, db);
  const existingByName = new Map(existing.map((item) => [item.name, item]));
  const missing: NormalizedExerciseDefault[] = [];

  for (const canonical of defaults) {
    const current = existingByName.get(canonical.name);
    if (!current) {
      missing.push(canonical);
      continue;
    }

    const data = missingExerciseFields(current, canonical);
    if (Object.keys(data).length > 0) {
      await db.exerciseLibrary.updateMany({
        where: { contractId, name: canonical.name },
        data,
      });
      Object.assign(current, data);
    }
  }

  const created = missing.length
    ? await db.exerciseLibrary.createMany({
        data: missing.map((item) => ({
          contractId,
          name: item.name,
          videoUrl: item.videoUrl,
          loadType: item.loadType,
          movementType: item.movementType,
          countingType: item.countingType,
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
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${contractId})::bigint)`;
    return installContractDefaultsUnlocked(contractId, tx);
  });
}
