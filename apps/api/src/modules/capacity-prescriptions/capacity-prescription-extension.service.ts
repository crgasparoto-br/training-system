import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  CapacityCatalogCategory,
  CapacityPlanningCyclePayload,
  CapacityPrescriptionParameterSetPayload,
  CapacityTechnicalCatalogItemPayload,
  PhysicalCapacityType,
  ProntuarioGoalCapacityClassificationPayload,
} from '@corrida/types';
import {
  CapacityPlanningValidationError,
  normalizeCapacityPlanningParameters,
} from './capacity-prescription-planning-validation.js';
import { CapacityPrescriptionDomainError } from './capacity-prescription.service.js';

const prisma = new PrismaClient();

const physicalCapacities = new Set<PhysicalCapacityType>([
  'resisted',
  'flexibility',
  'cyclic',
  'balance',
]);

const catalogSeed: CapacityTechnicalCatalogItemPayload[] = [
  { category: 'acronym', code: 'ADP', name: 'Adaptação', metadata: { microcycleLoad: 'adaptation' } },
  { category: 'acronym', code: 'ORD', name: 'Ordinário', metadata: { microcycleLoad: 'ordinary' } },
  { category: 'acronym', code: 'CHO', name: 'Choque', metadata: { microcycleLoad: 'shock' } },
  { category: 'acronym', code: 'REG', name: 'Regenerativo', metadata: { microcycleLoad: 'regenerative' } },
  { category: 'microcycle_load', code: 'ADP', name: 'Carga de adaptação' },
  { category: 'microcycle_load', code: 'ORD', name: 'Carga ordinária' },
  { category: 'microcycle_load', code: 'CHO', name: 'Carga de choque' },
  { category: 'microcycle_load', code: 'REG', name: 'Carga regenerativa' },
  { category: 'environment', code: 'ACADEMIA', name: 'Academia' },
  { category: 'environment', code: 'AR_LIVRE', name: 'Ar livre' },
  { category: 'environment', code: 'PISCINA', name: 'Piscina' },
  { category: 'environment', code: 'ESTEIRA', name: 'Esteira' },
  { category: 'environment', code: 'BICICLETA', name: 'Bicicleta' },
  { category: 'muscle_group', code: 'PEITORAL', name: 'Peitoral' },
  { category: 'muscle_group', code: 'DORSAL', name: 'Dorsal' },
  { category: 'muscle_group', code: 'OMBROS', name: 'Ombros' },
  { category: 'muscle_group', code: 'BRACOS', name: 'Braços' },
  { category: 'muscle_group', code: 'CORE', name: 'Core' },
  { category: 'muscle_group', code: 'QUADRICEPS', name: 'Quadríceps' },
  { category: 'muscle_group', code: 'POSTERIORES', name: 'Posteriores de coxa' },
  { category: 'muscle_group', code: 'GLUTEOS', name: 'Glúteos' },
  { category: 'muscle_group', code: 'PANTURRILHAS', name: 'Panturrilhas' },
  { category: 'method', code: 'CIRCUITO', name: 'Circuito' },
  { category: 'method', code: 'ALTERNADO_SEGMENTO', name: 'Alternado por segmento' },
  { category: 'method', code: 'SUPER_SERIE', name: 'Super série' },
  { category: 'method', code: 'PIRAMIDAL', name: 'Piramidal' },
  { category: 'training_split', code: 'FULL_BODY', name: 'Corpo inteiro' },
  { category: 'training_split', code: 'AB', name: 'Divisão A/B' },
  { category: 'training_split', code: 'ABC', name: 'Divisão A/B/C' },
  { category: 'repetition_zone', code: 'FORCA', name: 'Força', metadata: { range: '1-6' } },
  { category: 'repetition_zone', code: 'HIPERTROFIA', name: 'Hipertrofia', metadata: { range: '6-15' } },
  { category: 'repetition_zone', code: 'RESISTENCIA', name: 'Resistência', metadata: { range: '15+' } },
  { category: 'cyclic_stimulus', code: 'CONTINUO', name: 'Contínuo' },
  { category: 'cyclic_stimulus', code: 'INTERVALADO', name: 'Intervalado' },
  { category: 'cyclic_stimulus', code: 'FARTLEK', name: 'Fartlek' },
  { category: 'cyclic_stimulus', code: 'RECUPERATIVO', name: 'Recuperativo' },
  { category: 'exercise', code: 'AGACHAMENTO', name: 'Agachamento' },
  { category: 'exercise', code: 'SUPINO', name: 'Supino' },
  { category: 'exercise', code: 'REMADA', name: 'Remada' },
  { category: 'exercise', code: 'LEVANTAMENTO_TERRA', name: 'Levantamento terra' },
  { category: 'articulation', code: 'OMBRO', name: 'Ombro' },
  { category: 'articulation', code: 'COTOVELO', name: 'Cotovelo' },
  { category: 'articulation', code: 'PUNHO', name: 'Punho' },
  { category: 'articulation', code: 'COLUNA_CERVICAL', name: 'Coluna cervical' },
  { category: 'articulation', code: 'COLUNA_TORACICA', name: 'Coluna torácica' },
  { category: 'articulation', code: 'COLUNA_LOMBAR', name: 'Coluna lombar' },
  { category: 'articulation', code: 'QUADRIL', name: 'Quadril' },
  { category: 'articulation', code: 'JOELHO', name: 'Joelho' },
  { category: 'articulation', code: 'TORNOZELO', name: 'Tornozelo' },
];

export const EXTENDED_CAPACITY_PARAMETER_SETS: CapacityPrescriptionParameterSetPayload[] = [
  ...(['ADP', 'ORD', 'CHO', 'REG'] as const).map((code) => ({
    capacity: 'resisted' as const,
    code,
    name: `Microciclo ${code}`,
    methodologyVersion: 'acesso-microcycle-v1',
    parameters: {
      type: 'resisted' as const,
      resisted: {
        method: code === 'REG' ? 'recuperativo' : 'alternado_por_segmento',
        split: 'full_body',
        sets: code === 'CHO' ? 4 : code === 'REG' ? 2 : 3,
        repetitions: code === 'CHO' ? '6-10' : code === 'REG' ? '12-15' : '8-12',
        repetitionReserve: code === 'CHO' ? '1-2' : '2-3',
        expectedPse: code === 'CHO' ? 8 : code === 'REG' ? 3 : 6,
      },
    },
  })),
  {
    capacity: 'resisted',
    code: 'METHOD_CIRCUIT',
    name: 'Método circuito',
    methodologyVersion: 'acesso-resisted-methods-v1',
    parameters: {
      type: 'resisted',
      resisted: { method: 'circuito', split: 'full_body', sets: 3, repetitions: '10-15', expectedPse: 6 },
    },
  },
  {
    capacity: 'cyclic',
    code: 'CYCLIC_CONTINUOUS',
    name: 'Estímulo contínuo por zonas',
    methodologyVersion: 'acesso-cyclic-stimuli-v1',
    parameters: {
      type: 'cyclic',
      cyclic: {
        category: 'continuo',
        reversibilityPrinciple: 'reavaliar_apos_interrupcao',
        zoneBasis: 'heart_rate_reserve',
        zones: [
          { name: 'Z1', minPercent: 50, maxPercent: 60 },
          { name: 'Z2', minPercent: 60, maxPercent: 70 },
          { name: 'Z3', minPercent: 70, maxPercent: 80 },
          { name: 'Z4', minPercent: 80, maxPercent: 90 },
          { name: 'Z5', minPercent: 90, maxPercent: 100 },
        ],
        expectedPse: 5,
      },
    },
  },
  {
    capacity: 'cyclic',
    code: 'CYCLIC_INTERVAL',
    name: 'Estímulo intervalado',
    methodologyVersion: 'acesso-cyclic-stimuli-v1',
    parameters: {
      type: 'cyclic',
      cyclic: { category: 'intervalado', reversibilityPrinciple: 'reavaliar_apos_interrupcao', zoneBasis: 'lan', expectedPse: 7 },
    },
  },
  {
    capacity: 'flexibility',
    code: 'FLEX_ARTICULAR',
    name: 'Flexibilidade por articulação',
    methodologyVersion: 'acesso-flexibility-v1',
    parameters: { type: 'flexibility', flexibility: { articulations: [], expectedPse: 3 } },
  },
  {
    capacity: 'balance',
    code: 'BALANCE_STABILITY',
    name: 'Equilíbrio e estabilidade',
    methodologyVersion: 'acesso-balance-v1',
    parameters: { type: 'balance', balance: { focus: 'estabilidade_geral', supports: ['bipodal', 'unipodal'], expectedPse: 4 } },
  },
];

type JsonObject = Record<string, unknown>;

type CatalogRow = {
  id: string;
  contractId: string;
  category: CapacityCatalogCategory;
  code: string;
  name: string;
  metadata: JsonObject;
  version: number;
  isCurrent: boolean;
  createdByProfessorId: string;
  createdAt: Date;
  updatedAt: Date;
};

type PlanningRow = {
  id: string;
  contractId: string;
  alunoId: string;
  responsibleProfessorId: string;
  parentId: string | null;
  level: 'macro' | 'meso' | 'micro';
  code: string;
  name: string;
  objective: string | null;
  startDate: Date | null;
  endDate: Date | null;
  loadCode: string | null;
  volume: string | null;
  frequency: string | null;
  capacityParameters: JsonObject;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

function notFound(): never {
  throw new CapacityPrescriptionDomainError('NOT_FOUND', 'Recurso não encontrado');
}

function invalid(message: string): never {
  throw new CapacityPrescriptionDomainError('INVALID_INPUT', message);
}

function cleanCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,80}$/.test(code)) invalid('Código técnico inválido');
  return code;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) invalid('Data de planejamento inválida');
  return parsed;
}

function serializeRow<T extends Record<string, any>>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    startDate: row.startDate instanceof Date ? row.startDate.toISOString() : row.startDate,
    endDate: row.endDate instanceof Date ? row.endDate.toISOString() : row.endDate,
  };
}

export function createCapacityPrescriptionExtensionService(client: PrismaClient = prisma) {
  async function assertProfessor(contractId: string, professorId: string) {
    const professor = await client.professor.findFirst({ where: { id: professorId, contractId }, select: { id: true } });
    if (!professor) notFound();
  }

  async function assertAluno(contractId: string, alunoId: string) {
    const aluno = await client.aluno.findFirst({ where: { id: alunoId, contractId }, select: { id: true } });
    if (!aluno) notFound();
  }

  async function listCatalog(contractId: string, category?: CapacityCatalogCategory, includeHistory = false) {
    const categoryFilter = category ? Prisma.sql`AND "category" = ${category}` : Prisma.sql``;
    const currentFilter = includeHistory ? Prisma.sql`` : Prisma.sql`AND "isCurrent" = true`;
    const rows = await client.$queryRaw<CatalogRow[]>(Prisma.sql`
      SELECT * FROM "CapacityTechnicalCatalogItem"
      WHERE "contractId" = ${contractId}
      ${categoryFilter}
      ${currentFilter}
      ORDER BY "category" ASC, "code" ASC, "version" DESC
    `);
    return rows.map(serializeRow);
  }

  async function saveCatalogItem(
    context: { contractId: string; actorProfessorId: string },
    payload: CapacityTechnicalCatalogItemPayload
  ) {
    await assertProfessor(context.contractId, context.actorProfessorId);
    const code = cleanCode(payload.code);
    const name = payload.name.trim();
    if (!name) invalid('Nome do item técnico é obrigatório');
    const now = new Date();
    const id = randomUUID();

    return client.$transaction(async (tx) => {
      const current = await tx.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`
        SELECT "id", "version" FROM "CapacityTechnicalCatalogItem"
        WHERE "contractId" = ${context.contractId}
          AND "category" = ${payload.category}
          AND "code" = ${code}
          AND "isCurrent" = true
        LIMIT 1
      `);
      if (current[0]) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "CapacityTechnicalCatalogItem" SET "isCurrent" = false, "updatedAt" = ${now}
          WHERE "id" = ${current[0].id}
        `);
      }
      const version = (current[0]?.version ?? 0) + 1;
      const metadata = (payload.metadata ?? {}) as Prisma.InputJsonObject;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "CapacityTechnicalCatalogItem" (
          "id", "contractId", "category", "code", "name", "metadata", "version",
          "isCurrent", "createdByProfessorId", "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${context.contractId}, ${payload.category}, ${code}, ${name},
          ${metadata}, ${version}, true, ${context.actorProfessorId}, ${now}, ${now}
        )
      `);
      const rows = await tx.$queryRaw<CatalogRow[]>(Prisma.sql`
        SELECT * FROM "CapacityTechnicalCatalogItem" WHERE "id" = ${id}
      `);
      return serializeRow(rows[0]);
    });
  }

  async function seedCatalog(contractId: string, actorProfessorId: string) {
    await assertProfessor(contractId, actorProfessorId);
    let created = 0;
    let skipped = 0;
    for (const item of catalogSeed) {
      const existing = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "CapacityTechnicalCatalogItem"
        WHERE "contractId" = ${contractId}
          AND "category" = ${item.category}
          AND "code" = ${item.code}
          AND "isCurrent" = true
        LIMIT 1
      `);
      if (existing[0]) {
        skipped += 1;
      } else {
        await saveCatalogItem({ contractId, actorProfessorId }, item);
        created += 1;
      }
    }
    return { created, skipped };
  }

  async function listPlanning(contractId: string, alunoId: string) {
    await assertAluno(contractId, alunoId);
    const rows = await client.$queryRaw<PlanningRow[]>(Prisma.sql`
      SELECT * FROM "CapacityPlanningCycle"
      WHERE "contractId" = ${contractId} AND "alunoId" = ${alunoId}
      ORDER BY "startDate" ASC NULLS LAST, "level" ASC, "version" DESC
    `);
    return rows.map(serializeRow);
  }

  async function savePlanningCycle(
    context: { contractId: string; alunoId: string; actorProfessorId: string },
    payload: CapacityPlanningCyclePayload
  ) {
    await Promise.all([
      assertAluno(context.contractId, context.alunoId),
      assertProfessor(context.contractId, context.actorProfessorId),
    ]);
    if (!payload.name.trim()) invalid('Nome do ciclo é obrigatório');
    const code = cleanCode(payload.code);
    const now = new Date();
    const startDate = parseDate(payload.startDate);
    const endDate = parseDate(payload.endDate);
    if (startDate && endDate && startDate > endDate) invalid('Data inicial não pode superar a data final');

    let normalizedCapacityParameters;
    try {
      normalizedCapacityParameters = normalizeCapacityPlanningParameters(payload.capacityParameters);
    } catch (error) {
      if (error instanceof CapacityPlanningValidationError) invalid(error.message);
      throw error;
    }

    const loadCode = payload.loadCode?.trim().toUpperCase() || null;
    if (loadCode && payload.level !== 'micro') {
      invalid('Código de carga só pode ser informado para microciclo');
    }
    if (loadCode) {
      const currentLoad = await client.capacityTechnicalCatalogItem.findFirst({
        where: {
          contractId: context.contractId,
          category: 'microcycle_load',
          code: loadCode,
          isCurrent: true,
        },
        select: { id: true },
      });
      if (!currentLoad) invalid('Código de carga do microciclo inválido ou inativo');
    }

    if (payload.parentId) {
      const parent = await client.$queryRaw<Array<{ id: string; level: string }>>(Prisma.sql`
        SELECT "id", "level" FROM "CapacityPlanningCycle"
        WHERE "id" = ${payload.parentId}
          AND "contractId" = ${context.contractId}
          AND "alunoId" = ${context.alunoId}
        LIMIT 1
      `);
      if (!parent[0]) notFound();
      if (payload.level === 'macro' || (payload.level === 'meso' && parent[0].level !== 'macro') || (payload.level === 'micro' && parent[0].level !== 'meso')) {
        invalid('Hierarquia macro/meso/micro inválida');
      }
    } else if (payload.level !== 'macro') {
      invalid('Mesociclo e microciclo exigem ciclo pai');
    }

    const current = await client.$queryRaw<Array<{ version: number }>>(Prisma.sql`
      SELECT "version" FROM "CapacityPlanningCycle"
      WHERE "contractId" = ${context.contractId}
        AND "alunoId" = ${context.alunoId}
        AND "level" = ${payload.level}
        AND "code" = ${code}
      ORDER BY "version" DESC LIMIT 1
    `);
    const version = (current[0]?.version ?? 0) + 1;
    const id = randomUUID();
    const capacityParameters = normalizedCapacityParameters as unknown as Prisma.InputJsonObject;
    await client.$executeRaw(Prisma.sql`
      INSERT INTO "CapacityPlanningCycle" (
        "id", "contractId", "alunoId", "responsibleProfessorId", "parentId", "level",
        "code", "name", "objective", "startDate", "endDate", "loadCode", "volume",
        "frequency", "capacityParameters", "status", "version", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${context.contractId}, ${context.alunoId}, ${context.actorProfessorId},
        ${payload.parentId ?? null}, ${payload.level}, ${code}, ${payload.name.trim()},
        ${payload.objective?.trim() || null}, ${startDate}, ${endDate}, ${loadCode},
        ${payload.volume?.trim() || null}, ${payload.frequency?.trim() || null}, ${capacityParameters},
        ${payload.status ?? 'planned'}, ${version}, ${now}, ${now}
      )
    `);
    const rows = await client.$queryRaw<PlanningRow[]>(Prisma.sql`
      SELECT * FROM "CapacityPlanningCycle" WHERE "id" = ${id}
    `);
    return serializeRow(rows[0]);
  }

  async function listGoalClassifications(contractId: string, alunoId: string) {
    await assertAluno(contractId, alunoId);
    const rows = await client.$queryRaw<Array<Record<string, any>>>(Prisma.sql`
      SELECT * FROM "ProntuarioGoalCapacityClassification"
      WHERE "contractId" = ${contractId} AND "alunoId" = ${alunoId}
      ORDER BY "updatedAt" DESC
    `);
    return rows.map(serializeRow);
  }

  async function saveGoalClassification(
    context: { contractId: string; alunoId: string; actorProfessorId: string; goalId: string },
    payload: ProntuarioGoalCapacityClassificationPayload
  ) {
    await Promise.all([
      assertAluno(context.contractId, context.alunoId),
      assertProfessor(context.contractId, context.actorProfessorId),
    ]);
    const goal = await client.prontuarioGoal.findFirst({
      where: { id: context.goalId, record: { contractId: context.contractId, alunoId: context.alunoId } },
      select: { id: true },
    });
    if (!goal) notFound();
    const capacities = Array.from(new Set(payload.capacities));
    if (capacities.some((capacity) => !physicalCapacities.has(capacity))) invalid('Capacidade física inválida');
    const now = new Date();
    await client.$executeRaw(Prisma.sql`
      INSERT INTO "ProntuarioGoalCapacityClassification" (
        "goalId", "contractId", "alunoId", "capacities", "relatesToAssessment",
        "relatesToActionPlan", "updatedByProfessorId", "updatedAt"
      ) VALUES (
        ${context.goalId}, ${context.contractId}, ${context.alunoId}, ${capacities},
        ${payload.relatesToAssessment}, ${payload.relatesToActionPlan},
        ${context.actorProfessorId}, ${now}
      )
      ON CONFLICT ("goalId") DO UPDATE SET
        "capacities" = EXCLUDED."capacities",
        "relatesToAssessment" = EXCLUDED."relatesToAssessment",
        "relatesToActionPlan" = EXCLUDED."relatesToActionPlan",
        "updatedByProfessorId" = EXCLUDED."updatedByProfessorId",
        "updatedAt" = EXCLUDED."updatedAt"
    `);
    const rows = await client.$queryRaw<Array<Record<string, any>>>(Prisma.sql`
      SELECT * FROM "ProntuarioGoalCapacityClassification" WHERE "goalId" = ${context.goalId}
    `);
    return serializeRow(rows[0]);
  }

  return {
    listCatalog,
    saveCatalogItem,
    seedCatalog,
    listPlanning,
    savePlanningCycle,
    listGoalClassifications,
    saveGoalClassification,
  };
}

export const capacityPrescriptionExtensionService = createCapacityPrescriptionExtensionService();
