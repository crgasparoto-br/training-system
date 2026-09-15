import fs from 'node:fs';
import path from 'node:path';
import {
  MovementType,
  Prisma,
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

const DEFAULTS_INSTALL_TRANSACTION_TIMEOUT_MS = 15_000;

type DefaultsDb = Pick<PrismaClient, 'trainingParameter' | 'assessmentType' | 'exerciseLibrary'>;
type BulkDefaultsDb = DefaultsDb & Pick<Prisma.TransactionClient, '$executeRaw'>;

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

type ExerciseNameRepair = {
  currentName: string;
  repairedName: string;
};

type ExerciseBackfill = {
  current: ExistingExerciseDefault;
  canonical: NormalizedExerciseDefault;
  data: Partial<Omit<ExistingExerciseDefault, 'name'>>;
};

export type ContractDefaultsInstallStage =
  | 'concurrency-lock'
  | 'training-parameters'
  | 'assessment-types'
  | 'exercises';

export class ContractDefaultsInstallStageError extends Error {
  constructor(
    public readonly stage: ContractDefaultsInstallStage,
    public readonly durationMs: number,
    public readonly cause: unknown
  ) {
    super('Falha ao instalar padrões do sistema');
    this.name = 'ContractDefaultsInstallStageError';
  }
}

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

const supportsBulkSql = (db: DefaultsDb): db is BulkDefaultsDb =>
  typeof (db as Partial<BulkDefaultsDb>).$executeRaw === 'function';

async function runInstallStage<T>(
  stage: ContractDefaultsInstallStage,
  operation: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await operation();
  } catch (error) {
    throw new ContractDefaultsInstallStageError(stage, Date.now() - startedAt, error);
  }
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

function collectExerciseNameRepairs(
  defaults: NormalizedExerciseDefault[],
  existingExercises: ExistingExerciseDefault[]
): ExerciseNameRepair[] {
  const defaultNames = new Set(defaults.map((item) => item.name));
  const existingNames = new Set(existingExercises.map((item) => item.name));
  const repairs: ExerciseNameRepair[] = [];

  for (const item of existingExercises) {
    const repairedName = normalizeExerciseName(item.name);
    if (
      repairedName === item.name ||
      !defaultNames.has(repairedName) ||
      existingNames.has(repairedName)
    ) {
      continue;
    }

    repairs.push({ currentName: item.name, repairedName });
    existingNames.delete(item.name);
    existingNames.add(repairedName);
  }

  return repairs;
}

async function applyExerciseNameRepairs(
  contractId: string,
  repairs: ExerciseNameRepair[],
  existingExercises: ExistingExerciseDefault[],
  db: DefaultsDb
) {
  if (repairs.length === 0) return;

  if (supportsBulkSql(db)) {
    const rows = repairs.map(({ currentName, repairedName }) =>
      Prisma.sql`(${currentName}, ${repairedName})`
    );
    await db.$executeRaw(Prisma.sql`
      UPDATE "ExerciseLibrary" AS exercise
      SET "name" = repair."repairedName"
      FROM (VALUES ${Prisma.join(rows)}) AS repair("currentName", "repairedName")
      WHERE exercise."contractId" = ${contractId}
        AND exercise."name" = repair."currentName"
        AND NOT EXISTS (
          SELECT 1
          FROM "ExerciseLibrary" AS conflict
          WHERE conflict."contractId" = exercise."contractId"
            AND conflict."name" = repair."repairedName"
        )
    `);
  } else {
    for (const repair of repairs) {
      await db.exerciseLibrary.updateMany({
        where: { contractId, name: repair.currentName },
        data: { name: repair.repairedName },
      });
    }
  }

  const repairedNames = new Map(repairs.map((repair) => [repair.currentName, repair.repairedName]));
  for (const item of existingExercises) {
    const repairedName = repairedNames.get(item.name);
    if (repairedName) item.name = repairedName;
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

async function applyExerciseBackfills(
  contractId: string,
  backfills: ExerciseBackfill[],
  db: DefaultsDb
) {
  if (backfills.length === 0) return;

  if (supportsBulkSql(db)) {
    const rows = backfills.map(({ canonical }) =>
      Prisma.sql`(
        ${canonical.name},
        ${canonical.videoUrl ?? null},
        ${canonical.loadType ?? null},
        ${canonical.movementType ?? null},
        ${canonical.countingType ?? null},
        ${canonical.category},
        ${canonical.muscleGroup ?? null},
        ${canonical.notes ?? null}
      )`
    );

    await db.$executeRaw(Prisma.sql`
      UPDATE "ExerciseLibrary" AS exercise
      SET
        "videoUrl" = CASE
          WHEN NULLIF(BTRIM(exercise."videoUrl"), '') IS NULL AND defaults."videoUrl" IS NOT NULL
            THEN defaults."videoUrl"
          ELSE exercise."videoUrl"
        END,
        "loadType" = CASE
          WHEN exercise."loadType" IS NULL AND defaults."loadType" IS NOT NULL
            THEN defaults."loadType"::"LoadType"
          ELSE exercise."loadType"
        END,
        "movementType" = CASE
          WHEN exercise."movementType" IS NULL AND defaults."movementType" IS NOT NULL
            THEN defaults."movementType"::"MovementType"
          ELSE exercise."movementType"
        END,
        "countingType" = CASE
          WHEN exercise."countingType" IS NULL AND defaults."countingType" IS NOT NULL
            THEN defaults."countingType"::"CountingType"
          ELSE exercise."countingType"
        END,
        "category" = CASE
          WHEN NULLIF(BTRIM(exercise."category"), '') IS NULL AND defaults."category" IS NOT NULL
            THEN defaults."category"
          ELSE exercise."category"
        END,
        "muscleGroup" = CASE
          WHEN NULLIF(BTRIM(exercise."muscleGroup"), '') IS NULL AND defaults."muscleGroup" IS NOT NULL
            THEN defaults."muscleGroup"
          ELSE exercise."muscleGroup"
        END,
        "notes" = CASE
          WHEN NULLIF(BTRIM(exercise."notes"), '') IS NULL AND defaults."notes" IS NOT NULL
            THEN defaults."notes"
          ELSE exercise."notes"
        END
      FROM (VALUES ${Prisma.join(rows)}) AS defaults(
        "name",
        "videoUrl",
        "loadType",
        "movementType",
        "countingType",
        "category",
        "muscleGroup",
        "notes"
      )
      WHERE exercise."contractId" = ${contractId}
        AND exercise."name" = defaults."name"
        AND (
          (NULLIF(BTRIM(exercise."videoUrl"), '') IS NULL AND defaults."videoUrl" IS NOT NULL) OR
          (exercise."loadType" IS NULL AND defaults."loadType" IS NOT NULL) OR
          (exercise."movementType" IS NULL AND defaults."movementType" IS NOT NULL) OR
          (exercise."countingType" IS NULL AND defaults."countingType" IS NOT NULL) OR
          (NULLIF(BTRIM(exercise."category"), '') IS NULL AND defaults."category" IS NOT NULL) OR
          (NULLIF(BTRIM(exercise."muscleGroup"), '') IS NULL AND defaults."muscleGroup" IS NOT NULL) OR
          (NULLIF(BTRIM(exercise."notes"), '') IS NULL AND defaults."notes" IS NOT NULL)
        )
    `);

    for (const { current, data } of backfills) Object.assign(current, data);
    return;
  }

  for (const { current, canonical, data } of backfills) {
    await db.exerciseLibrary.updateMany({
      where: { contractId, name: canonical.name },
      data,
    });
    Object.assign(current, data);
  }
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

  const repairs = collectExerciseNameRepairs(defaults, existing);
  await applyExerciseNameRepairs(contractId, repairs, existing, db);

  const existingByName = new Map(existing.map((item) => [item.name, item]));
  const missing: NormalizedExerciseDefault[] = [];
  const backfills: ExerciseBackfill[] = [];

  for (const canonical of defaults) {
    const current = existingByName.get(canonical.name);
    if (!current) {
      missing.push(canonical);
      continue;
    }

    const data = missingExerciseFields(current, canonical);
    if (Object.keys(data).length > 0) {
      backfills.push({ current, canonical, data });
    }
  }

  await applyExerciseBackfills(contractId, backfills, db);

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
  const trainingParameters = await runInstallStage('training-parameters', () =>
    installTrainingParameters(contractId, db)
  );
  const assessmentTypes = await runInstallStage('assessment-types', () =>
    installAssessmentTypes(contractId, db)
  );
  const exercises = await runInstallStage('exercises', () => installExercises(contractId, db));

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

  // Production crossed Prisma's 5s interactive-transaction boundary. The
  // primary correction is the set-based exercise repair above; 15s is only a
  // safety margin around the now-bounded database work, not the fix itself.
  return transactionalDb.$transaction(
    async (tx) => {
      await runInstallStage('concurrency-lock', () =>
        tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${contractId})::bigint)`
      );
      return installContractDefaultsUnlocked(contractId, tx);
    },
    {
      maxWait: 5_000,
      timeout: DEFAULTS_INSTALL_TRANSACTION_TIMEOUT_MS,
    }
  );
}
