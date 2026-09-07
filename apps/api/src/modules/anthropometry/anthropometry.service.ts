import { PrismaClient, type AnthropometrySegmentType, type AnthropometrySexApplicability, type Prisma } from '@prisma/client';
import {
  addAnthropometryVariations,
  appendAnthropometryTimelineEvent,
  ensureDraftLifecycle,
  getAssessmentLifecycle,
  insertCorrectionAudit,
  listAssessmentLifecycles,
  listCorrectionAudits,
  listSegmentRequirements,
  markAssessmentCompleted,
  setSegmentRequirement,
} from './anthropometry-lifecycle.js';

const prisma = new PrismaClient();

type SegmentSeed = {
  name: string;
  type: AnthropometrySegmentType;
  order: number;
  technicalDescription?: string;
  tutorialVideoUrl?: string;
  formulaHint?: string;
  importByDefault?: boolean;
  importObservationByDefault?: boolean;
};

type SegmentInput = {
  name: string;
  description?: string | null;
  technicalDescription?: string | null;
  sexApplicability?: AnthropometrySexApplicability;
  type?: AnthropometrySegmentType;
  order?: number;
  active?: boolean;
  importByDefault?: boolean;
  importObservationByDefault?: boolean;
  requiredForCompletion?: boolean;
  femaleImageUrl?: string | null;
  maleImageUrl?: string | null;
  tutorialVideoUrl?: string | null;
  formulaHint?: string | null;
};

type AssessmentValueInput = {
  segmentId: string;
  value?: string | null;
  unit?: string | null;
  observation?: string | null;
};

type ObservationInput = {
  id?: string;
  segmentId?: string | null;
  text: string;
  importable?: boolean;
};

type CorrectionInput = {
  reason: string;
  values?: AssessmentValueInput[];
  notes?: string | null;
  observations?: ObservationInput[];
};

type ActorContext = {
  userId: string;
  professorId?: string | null;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

export type AnthropometryDomainErrorCode =
  | 'ASSESSMENT_COMPLETED'
  | 'ASSESSMENT_NOT_COMPLETED'
  | 'COMPLETION_CONFIGURATION_MISSING'
  | 'REQUIRED_MEASURES_MISSING'
  | 'CONCURRENT_COMPLETION'
  | 'INVALID_SEGMENT'
  | 'CORRECTION_REASON_REQUIRED'
  | 'CORRECTION_WITHOUT_CHANGES';

export class AnthropometryDomainError extends Error {
  constructor(
    public readonly code: AnthropometryDomainErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AnthropometryDomainError';
  }
}

const defaultSegments: SegmentSeed[] = [
  {
    name: 'Olecrano-Acrômio Clavicular',
    type: 'principal',
    order: 10,
    technicalDescription: 'Distância entre o olécrano e a articulação acrômio clavicular.',
    tutorialVideoUrl: 'https://youtube.com/shorts/hQr0hDT3-jM?feature=share',
    formulaHint: 'Referência configurável Antr1.',
  },
  {
    name: 'Ligamento inguinal-borda superior da patela',
    type: 'principal',
    order: 20,
    technicalDescription: 'Distância entre o ligamento inguinal e a borda superior da patela.',
    tutorialVideoUrl: 'https://youtube.com/shorts/yINLphA-FnY',
    formulaHint: 'Referência configurável Antr2.',
  },
  {
    name: 'Escapular',
    type: 'principal',
    order: 30,
    technicalDescription: 'Maior circunferência envolvendo deltoide, em posição neutra.',
    tutorialVideoUrl: 'https://youtube.com/shorts/KjTQWVYxnc4',
  },
  {
    name: 'Torácica Inspirada',
    type: 'principal',
    order: 40,
    technicalDescription: 'Em inspiração máxima. No masculino: linha do mamilo. No feminino: cicatriz axilar.',
    tutorialVideoUrl: 'https://youtube.com/shorts/-K6J5Xmkaiw',
  },
  {
    name: 'Torácica Expirada',
    type: 'principal',
    order: 50,
    technicalDescription: 'Após expiração total. No masculino: linha do mamilo. No feminino: cicatriz axilar.',
    tutorialVideoUrl: 'https://youtube.com/shorts/47v1UFsVuwU',
  },
  {
    name: 'Braço Direito Relaxado',
    type: 'principal',
    order: 60,
    technicalDescription: 'Registrar a maior circunferência do braço relaxado.',
    tutorialVideoUrl: 'https://youtube.com/shorts/SzQGbYR-t-0',
  },
  {
    name: 'Braço Direito Contraído',
    type: 'principal',
    order: 70,
    technicalDescription: 'Registrar a maior circunferência do braço em contração isométrica máxima.',
    tutorialVideoUrl: 'https://youtube.com/shorts/GCAHcLEn4r4',
  },
  {
    name: 'Braço Esquerdo Relaxado',
    type: 'principal',
    order: 80,
    technicalDescription: 'Registrar a maior circunferência do braço relaxado.',
    tutorialVideoUrl: 'https://youtube.com/shorts/SzQGbYR-t-0',
  },
  {
    name: 'Braço Esquerdo Contraído',
    type: 'principal',
    order: 90,
    technicalDescription: 'Registrar a maior circunferência do braço em contração isométrica máxima.',
    tutorialVideoUrl: 'https://youtube.com/shorts/GCAHcLEn4r4',
  },
  {
    name: 'Abdominal',
    type: 'principal',
    order: 100,
    technicalDescription: 'Nível da cicatriz umbilical. Caso a pele esteja caída, usar a região aproximada da cicatriz.',
    tutorialVideoUrl: 'https://youtube.com/shorts/GNTVWiaohNk',
  },
  {
    name: 'Quadril',
    type: 'principal',
    order: 110,
    technicalDescription: 'Maior circunferência do glúteo.',
    tutorialVideoUrl: 'https://youtube.com/shorts/VC6bA3T6uAc',
  },
  {
    name: 'Coxa Direita',
    type: 'principal',
    order: 120,
    technicalDescription: 'Linha horizontal a metade da distância entre ligamento inguinal e borda superior da patela.',
    tutorialVideoUrl: 'https://youtube.com/shorts/2fBpsn0Mrxc',
    formulaHint: 'Pode usar metade de Antr2, conforme configuração do segmento.',
  },
  {
    name: 'Perna Direita',
    type: 'principal',
    order: 130,
    technicalDescription: 'Maior circunferência da panturrilha.',
    tutorialVideoUrl: 'https://youtube.com/shorts/uO3aIhS9sJo',
  },
  {
    name: 'Coxa Esquerda',
    type: 'principal',
    order: 140,
    technicalDescription: 'Linha horizontal a metade da distância entre ligamento inguinal e borda superior da patela.',
    tutorialVideoUrl: 'https://youtube.com/shorts/2fBpsn0Mrxc',
    formulaHint: 'Pode usar metade de Antr2, conforme configuração do segmento.',
  },
  {
    name: 'Perna Esquerda',
    type: 'principal',
    order: 150,
    technicalDescription: 'Maior circunferência da panturrilha.',
    tutorialVideoUrl: 'https://youtube.com/shorts/uO3aIhS9sJo',
  },
  { name: 'Pescoço', type: 'opcional', order: 210, technicalDescription: 'Imediatamente abaixo da proeminência laríngea.', tutorialVideoUrl: 'https://youtube.com/shorts/gL6DAAPmmBI', importByDefault: false },
  { name: 'Busto', type: 'opcional', order: 220, technicalDescription: 'Circunferência de maior projeção anterior da região torácica.', tutorialVideoUrl: 'https://youtube.com/shorts/mQWFLtR-46w', importByDefault: false },
  { name: 'Cintura', type: 'opcional', order: 230, technicalDescription: 'Imediatamente abaixo da última costela, observada pela linha axilar.', tutorialVideoUrl: 'https://youtube.com/shorts/hB-JPtlwdkU', importByDefault: false },
  { name: 'Antebraço Direito', type: 'opcional', order: 240, technicalDescription: 'Maior circunferência do antebraço.', tutorialVideoUrl: 'https://youtube.com/shorts/VMbxWWPY0d0', importByDefault: false },
  { name: 'Antebraço Esquerdo', type: 'opcional', order: 250, technicalDescription: 'Maior circunferência do antebraço.', tutorialVideoUrl: 'https://youtube.com/shorts/VMbxWWPY0d0', importByDefault: false },
  { name: 'Crista Ilíaca', type: 'opcional', order: 260, technicalDescription: 'Imediatamente acima da borda superior da crista ilíaca.', tutorialVideoUrl: 'https://youtube.com/shorts/7S-MFLxdLq4', importByDefault: false },
  { name: 'Coxa Alta Direita', type: 'opcional', order: 270, technicalDescription: 'Imediatamente abaixo do glúteo.', tutorialVideoUrl: 'https://youtube.com/shorts/oqYNuFG2lj0', importByDefault: false },
  { name: 'Coxa Alta Esquerda', type: 'opcional', order: 280, technicalDescription: 'Imediatamente abaixo do glúteo.', tutorialVideoUrl: 'https://youtube.com/shorts/oqYNuFG2lj0', importByDefault: false },
  { name: 'Coxa Baixa Direita', type: 'opcional', order: 290, technicalDescription: 'Imediatamente acima da borda superior da patela.', tutorialVideoUrl: 'https://youtube.com/shorts/XKD-GSrrg4M?feature=share', importByDefault: false },
  { name: 'Coxa Baixa Esquerda', type: 'opcional', order: 300, technicalDescription: 'Imediatamente acima da borda superior da patela.', tutorialVideoUrl: 'https://youtube.com/shorts/XKD-GSrrg4M?feature=share', importByDefault: false },
];

const includeAssessment = {
  professor: { include: { user: { include: { profile: true } } } },
  values: { include: { segment: true }, orderBy: { segment: { order: 'asc' as const } } },
  observations: { include: { segment: true }, orderBy: { createdAt: 'asc' as const } },
};

function nextCodeFrom(code?: string | null) {
  const match = code?.match(/ANTR-(\d+)/i);
  const next = match ? Number(match[1]) + 1 : 1;
  return `ANTR-${String(next).padStart(3, '0')}`;
}

async function assertAlunoInContract(alunoId: string, contractId: string) {
  const aluno = await prisma.aluno.findFirst({
    where: { id: alunoId, contractId },
    include: { user: { include: { profile: true } }, professor: true },
  });
  if (!aluno) throw new Error('Aluno não encontrado no contrato');
  if (!aluno.user) throw new Error('Aluno ainda não possui conta vinculada (registro incompleto)');
  return aluno as typeof aluno & { user: NonNullable<typeof aluno.user> };
}

async function assertDraft(contractId: string, assessmentId: string, client: DbClient = prisma) {
  const lifecycle = await getAssessmentLifecycle(assessmentId, contractId, client);
  if (lifecycle?.status === 'COMPLETED') {
    throw new AnthropometryDomainError(
      'ASSESSMENT_COMPLETED',
      'A avaliação concluída é imutável. Use o fluxo de correção auditada.'
    );
  }
  if (!lifecycle) {
    throw new Error('Estado da avaliação antropométrica não encontrado');
  }
  return lifecycle;
}

async function assertSegmentsInContract(contractId: string, segmentIds: string[], client: DbClient = prisma) {
  const uniqueIds = [...new Set(segmentIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  const segments = await client.anthropometrySegment.findMany({
    where: { contractId, id: { in: uniqueIds } },
    select: { id: true },
  });
  if (segments.length !== uniqueIds.length) {
    throw new AnthropometryDomainError('INVALID_SEGMENT', 'Segmento antropométrico inválido para este contrato.');
  }
}

async function decorateSegments<T extends { id: string }>(contractId: string, segments: T[]) {
  const requirements = await listSegmentRequirements(contractId);
  const bySegment = new Map(requirements.map((item) => [item.segmentId, item]));
  return segments.map((segment) => {
    const requirement = bySegment.get(segment.id);
    return {
      ...segment,
      requiredForCompletion: requirement?.isRequired ?? false,
      requirementVersion: requirement?.version ?? 0,
      requirementConfiguredAt: requirement?.configuredAt ?? null,
    };
  });
}

async function decorateAssessments<T extends { id: string }>(contractId: string, assessments: T[]) {
  if (!assessments.length) return [];
  const ids = assessments.map((item) => item.id);
  const [lifecycles, corrections] = await Promise.all([
    listAssessmentLifecycles(contractId, ids),
    listCorrectionAudits(contractId, ids),
  ]);
  const lifecycleById = new Map(lifecycles.map((item) => [item.assessmentId, item]));
  const correctionsById = new Map<string, typeof corrections>();
  corrections.forEach((correction) => {
    const current = correctionsById.get(correction.assessmentId) ?? [];
    current.push(correction);
    correctionsById.set(correction.assessmentId, current);
  });
  return assessments.map((assessment) => {
    const lifecycle = lifecycleById.get(assessment.id);
    return {
      ...assessment,
      status: lifecycle?.status ?? 'DRAFT',
      completedAt: lifecycle?.completedAt ?? null,
      completedByUserId: lifecycle?.completedByUserId ?? null,
      completionRequirementsSnapshot: lifecycle?.requirementsSnapshot ?? null,
      corrections: correctionsById.get(assessment.id) ?? [],
    };
  });
}

function snapshotAssessment(assessment: {
  notes?: string | null;
  values: Array<{ segmentId: string; value?: string | null; unit?: string | null; observation?: string | null }>;
  observations: Array<{ segmentId?: string | null; text: string; importable: boolean }>;
}) {
  return {
    notes: assessment.notes ?? null,
    values: assessment.values.map((item) => ({
      segmentId: item.segmentId,
      value: item.value ?? null,
      unit: item.unit ?? 'cm',
      observation: item.observation ?? null,
    })),
    observations: assessment.observations.map((item) => ({
      segmentId: item.segmentId ?? null,
      text: item.text,
      importable: item.importable,
    })),
  };
}

export const anthropometryService = {
  async ensureDefaultSegments(contractId: string) {
    await prisma.anthropometrySegment.createMany({
      skipDuplicates: true,
      data: defaultSegments.map((segment) => ({
        contractId,
        name: segment.name,
        type: segment.type,
        order: segment.order,
        technicalDescription: segment.technicalDescription,
        tutorialVideoUrl: segment.tutorialVideoUrl,
        formulaHint: segment.formulaHint,
        importByDefault: segment.importByDefault ?? true,
        importObservationByDefault: segment.importObservationByDefault ?? false,
      })),
    });
  },

  async listSegments(contractId: string) {
    await this.ensureDefaultSegments(contractId);
    const segments = await prisma.anthropometrySegment.findMany({
      where: { contractId },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    return decorateSegments(contractId, segments);
  },

  async listActiveSegments(contractId: string, sex?: 'male' | 'female' | 'other') {
    await this.ensureDefaultSegments(contractId);
    const sexApplicability =
      sex === 'male' ? ['masculino', 'ambos'] : sex === 'female' ? ['feminino', 'ambos'] : ['ambos', 'masculino', 'feminino'];
    const segments = await prisma.anthropometrySegment.findMany({
      where: {
        contractId,
        active: true,
        sexApplicability: { in: sexApplicability as AnthropometrySexApplicability[] },
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    return decorateSegments(contractId, segments);
  },

  async createSegment(contractId: string, data: SegmentInput) {
    const { requiredForCompletion, ...segmentData } = data;
    const segment = await prisma.$transaction(async (tx) => {
      const created = await tx.anthropometrySegment.create({
        data: {
          contractId,
          name: segmentData.name,
          description: segmentData.description,
          technicalDescription: segmentData.technicalDescription,
          sexApplicability: segmentData.sexApplicability ?? 'ambos',
          type: segmentData.type ?? 'personalizado',
          order: segmentData.order ?? 999,
          active: segmentData.active ?? true,
          importByDefault: segmentData.importByDefault ?? true,
          importObservationByDefault: segmentData.importObservationByDefault ?? false,
          femaleImageUrl: segmentData.femaleImageUrl,
          maleImageUrl: segmentData.maleImageUrl,
          tutorialVideoUrl: segmentData.tutorialVideoUrl,
          formulaHint: segmentData.formulaHint,
        },
      });
      if (requiredForCompletion !== undefined) {
        await setSegmentRequirement(contractId, created.id, requiredForCompletion, tx);
      }
      return created;
    });
    return (await decorateSegments(contractId, [segment]))[0];
  },

  async updateSegment(contractId: string, id: string, data: Partial<SegmentInput>) {
    const { requiredForCompletion, ...segmentData } = data;
    const segment = await prisma.$transaction(async (tx) => {
      await tx.anthropometrySegment.findFirstOrThrow({ where: { id, contractId } });
      const updated = await tx.anthropometrySegment.update({ where: { id }, data: segmentData });
      if (requiredForCompletion !== undefined) {
        await setSegmentRequirement(contractId, id, requiredForCompletion, tx);
      }
      return updated;
    });
    return (await decorateSegments(contractId, [segment]))[0];
  },

  async reorderSegments(contractId: string, segmentIds: string[]) {
    await assertSegmentsInContract(contractId, segmentIds);
    await prisma.$transaction(
      segmentIds.map((id, index) => prisma.anthropometrySegment.update({ where: { id }, data: { order: (index + 1) * 10 } }))
    );
    return this.listSegments(contractId);
  },

  async listAssessments(contractId: string, alunoId: string) {
    await assertAlunoInContract(alunoId, contractId);
    const assessments = await prisma.anthropometryAssessment.findMany({
      where: { contractId, alunoId },
      include: includeAssessment,
      orderBy: [{ assessmentDate: 'desc' }, { createdAt: 'desc' }],
    });
    const decorated = await decorateAssessments(contractId, assessments);
    return addAnthropometryVariations(decorated);
  },

  async getAssessment(contractId: string, id: string) {
    const assessment = await prisma.anthropometryAssessment.findFirst({
      where: { id, contractId },
      include: includeAssessment,
    });
    if (!assessment) return null;
    return (await decorateAssessments(contractId, [assessment]))[0];
  },

  async getLastAssessment(contractId: string, alunoId: string) {
    await assertAlunoInContract(alunoId, contractId);
    const assessment = await prisma.anthropometryAssessment.findFirst({
      where: { contractId, alunoId },
      include: includeAssessment,
      orderBy: [{ assessmentDate: 'desc' }, { createdAt: 'desc' }],
    });
    if (!assessment) return null;
    return (await decorateAssessments(contractId, [assessment]))[0];
  },

  async createAssessment(contractId: string, alunoId: string, professorId: string, data: { assessmentDate?: Date; professorId?: string | null; notes?: string | null; copyPrevious?: boolean }) {
    const aluno = await assertAlunoInContract(alunoId, contractId);
    await this.ensureDefaultSegments(contractId);
    const lastAssessment = await this.getLastAssessment(contractId, alunoId);
    if (lastAssessment?.status === 'DRAFT') return lastAssessment;

    const activeSegments = await this.listActiveSegments(contractId, aluno.user.profile?.gender ?? undefined);
    const code = nextCodeFrom(lastAssessment?.code);
    const sourceValues = new Map(lastAssessment?.values.map((item) => [item.segmentId, item]) ?? []);
    const requestedProfessorId = data.professorId || professorId || aluno.professorId || undefined;
    const targetProfessor = await prisma.professor.findFirst({
      where: { id: requestedProfessorId, contractId },
      select: { id: true },
    });
    const targetProfessorId = targetProfessor?.id ?? professorId ?? aluno.professorId;

    const created = await prisma.$transaction(async (tx) => {
      const assessment = await tx.anthropometryAssessment.create({
        data: {
          contractId,
          alunoId,
          professorId: targetProfessorId,
          code,
          assessmentDate: data.assessmentDate ?? new Date(),
          notes: data.copyPrevious && lastAssessment?.notes ? lastAssessment.notes : data.notes,
        },
      });

      await ensureDraftLifecycle(assessment.id, contractId, alunoId, tx);

      const valuesToCreate = activeSegments.map((segment) => {
        const source = sourceValues.get(segment.id);
        return {
          assessmentId: assessment.id,
          segmentId: segment.id,
          value: data.copyPrevious && segment.importByDefault ? source?.value ?? null : null,
          unit: source?.unit ?? 'cm',
          observation: data.copyPrevious && segment.importObservationByDefault ? source?.observation ?? null : null,
        };
      });
      if (valuesToCreate.length) {
        await tx.anthropometryAssessmentValue.createMany({ data: valuesToCreate, skipDuplicates: true });
      }

      const observationsToCreate =
        data.copyPrevious && lastAssessment
          ? lastAssessment.observations
              .filter((item) => item.importable || item.segment?.importObservationByDefault)
              .map((item) => ({ assessmentId: assessment.id, segmentId: item.segmentId, text: item.text, importable: item.importable }))
          : [];
      if (observationsToCreate.length) await tx.anthropometryObservation.createMany({ data: observationsToCreate });

      return tx.anthropometryAssessment.findUniqueOrThrow({ where: { id: assessment.id }, include: includeAssessment });
    });
    return (await decorateAssessments(contractId, [created]))[0];
  },

  async updateAssessment(contractId: string, id: string, data: { assessmentDate?: Date; professorId?: string | null; notes?: string | null }) {
    await assertDraft(contractId, id);
    const existing = await prisma.anthropometryAssessment.findFirstOrThrow({ where: { id, contractId } });
    if (data.professorId) {
      const professor = await prisma.professor.findFirst({ where: { id: data.professorId, contractId }, select: { id: true } });
      if (!professor) throw new Error('Professor não encontrado no contrato');
    }
    const assessment = await prisma.anthropometryAssessment.update({ where: { id: existing.id }, data, include: includeAssessment });
    return (await decorateAssessments(contractId, [assessment]))[0];
  },

  async saveValues(contractId: string, assessmentId: string, values: AssessmentValueInput[]) {
    await assertDraft(contractId, assessmentId);
    await assertSegmentsInContract(contractId, values.map((item) => item.segmentId));
    const assessment = await prisma.anthropometryAssessment.findFirstOrThrow({ where: { id: assessmentId, contractId } });
    await prisma.$transaction(
      values.map((item) => prisma.anthropometryAssessmentValue.upsert({
        where: { assessmentId_segmentId: { assessmentId: assessment.id, segmentId: item.segmentId } },
        create: { assessmentId: assessment.id, segmentId: item.segmentId, value: item.value, unit: item.unit || 'cm', observation: item.observation },
        update: { value: item.value, unit: item.unit || 'cm', observation: item.observation },
      }))
    );
    return this.getAssessment(contractId, assessment.id);
  },

  async saveObservations(contractId: string, assessmentId: string, observations: ObservationInput[]) {
    await assertDraft(contractId, assessmentId);
    await assertSegmentsInContract(contractId, observations.flatMap((item) => item.segmentId ? [item.segmentId] : []));
    const assessment = await prisma.anthropometryAssessment.findFirstOrThrow({ where: { id: assessmentId, contractId } });
    await prisma.$transaction(async (tx) => {
      await tx.anthropometryObservation.deleteMany({ where: { assessmentId: assessment.id } });
      const data = observations
        .filter((item) => item.text.trim())
        .map((item) => ({ assessmentId: assessment.id, segmentId: item.segmentId || null, text: item.text.trim(), importable: item.importable ?? false }));
      if (data.length) await tx.anthropometryObservation.createMany({ data });
    });
    return this.getAssessment(contractId, assessment.id);
  },

  async completeAssessment(contractId: string, assessmentId: string, actor: ActorContext) {
    const completed = await prisma.$transaction(async (tx) => {
      const assessment = await tx.anthropometryAssessment.findFirst({
        where: { id: assessmentId, contractId },
        include: includeAssessment,
      });
      if (!assessment) throw new Error('Avaliação antropométrica não encontrada');
      await assertDraft(contractId, assessment.id, tx);

      const requirements = (await listSegmentRequirements(contractId, tx)).filter((item) => item.isRequired);
      if (!requirements.length) {
        throw new AnthropometryDomainError(
          'COMPLETION_CONFIGURATION_MISSING',
          'Defina explicitamente ao menos uma medida obrigatória antes de concluir avaliações.'
        );
      }

      const segments = await tx.anthropometrySegment.findMany({
        where: { contractId, id: { in: requirements.map((item) => item.segmentId) } },
        select: { id: true, name: true, active: true },
      });
      const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
      const valuesBySegment = new Map(assessment.values.map((value) => [value.segmentId, value]));
      const missing = requirements
        .filter((requirement) => {
          const segment = segmentById.get(requirement.segmentId);
          const value = valuesBySegment.get(requirement.segmentId)?.value;
          return !segment?.active || !value?.trim();
        })
        .map((requirement) => ({ segmentId: requirement.segmentId, name: segmentById.get(requirement.segmentId)?.name ?? requirement.segmentId }));
      if (missing.length) {
        throw new AnthropometryDomainError(
          'REQUIRED_MEASURES_MISSING',
          'Preencha todas as medidas configuradas como obrigatórias antes de concluir.',
          { missing }
        );
      }

      const snapshot = {
        legacy: false,
        configurationDefined: true,
        capturedAt: new Date().toISOString(),
        requiredSegments: requirements.map((requirement) => ({
          segmentId: requirement.segmentId,
          name: segmentById.get(requirement.segmentId)?.name ?? requirement.segmentId,
          requirementVersion: requirement.version,
        })),
      } satisfies Prisma.InputJsonValue;

      const changed = await markAssessmentCompleted(assessment.id, contractId, actor.userId, snapshot, tx);
      if (!changed) {
        throw new AnthropometryDomainError('CONCURRENT_COMPLETION', 'A avaliação já foi concluída em outra operação.');
      }
      await appendAnthropometryTimelineEvent({
        alunoId: assessment.alunoId,
        contractId,
        actorUserId: actor.userId,
        actorProfessorId: actor.professorId,
        eventKey: `anthropometry:${assessment.id}:completed`,
        action: 'completed',
        assessmentId: assessment.id,
        assessmentCode: assessment.code,
      }, tx);
      return assessment.id;
    });
    return this.getAssessment(contractId, completed);
  },

  async correctAssessment(contractId: string, assessmentId: string, actor: ActorContext, data: CorrectionInput) {
    const reason = data.reason.trim();
    if (!reason) throw new AnthropometryDomainError('CORRECTION_REASON_REQUIRED', 'Informe o motivo da correção.');

    const corrected = await prisma.$transaction(async (tx) => {
      const assessment = await tx.anthropometryAssessment.findFirst({
        where: { id: assessmentId, contractId },
        include: includeAssessment,
      });
      if (!assessment) throw new Error('Avaliação antropométrica não encontrada');
      const lifecycle = await getAssessmentLifecycle(assessment.id, contractId, tx);
      if (lifecycle?.status !== 'COMPLETED') {
        throw new AnthropometryDomainError('ASSESSMENT_NOT_COMPLETED', 'Somente avaliações concluídas usam o fluxo de correção auditada.');
      }

      if (data.values) await assertSegmentsInContract(contractId, data.values.map((item) => item.segmentId), tx);
      if (data.observations) {
        await assertSegmentsInContract(contractId, data.observations.flatMap((item) => item.segmentId ? [item.segmentId] : []), tx);
      }
      const beforeSnapshot = snapshotAssessment(assessment);

      if (data.values) {
        for (const item of data.values) {
          await tx.anthropometryAssessmentValue.upsert({
            where: { assessmentId_segmentId: { assessmentId: assessment.id, segmentId: item.segmentId } },
            create: { assessmentId: assessment.id, segmentId: item.segmentId, value: item.value, unit: item.unit || 'cm', observation: item.observation },
            update: { value: item.value, unit: item.unit || 'cm', observation: item.observation },
          });
        }
      }
      if (data.notes !== undefined) {
        await tx.anthropometryAssessment.update({ where: { id: assessment.id }, data: { notes: data.notes } });
      }
      if (data.observations) {
        await tx.anthropometryObservation.deleteMany({ where: { assessmentId: assessment.id } });
        const observations = data.observations
          .filter((item) => item.text.trim())
          .map((item) => ({ assessmentId: assessment.id, segmentId: item.segmentId || null, text: item.text.trim(), importable: item.importable ?? false }));
        if (observations.length) await tx.anthropometryObservation.createMany({ data: observations });
      }

      const after = await tx.anthropometryAssessment.findUniqueOrThrow({ where: { id: assessment.id }, include: includeAssessment });
      const afterSnapshot = snapshotAssessment(after);
      if (JSON.stringify(beforeSnapshot) === JSON.stringify(afterSnapshot)) {
        throw new AnthropometryDomainError('CORRECTION_WITHOUT_CHANGES', 'A correção não alterou nenhum dado da avaliação.');
      }

      const correction = await insertCorrectionAudit({
        assessmentId: assessment.id,
        contractId,
        alunoId: assessment.alunoId,
        actorUserId: actor.userId,
        actorProfessorId: actor.professorId || null,
        reason,
        beforeSnapshot,
        afterSnapshot,
      }, tx);
      await appendAnthropometryTimelineEvent({
        alunoId: assessment.alunoId,
        contractId,
        actorUserId: actor.userId,
        actorProfessorId: actor.professorId,
        eventKey: `anthropometry:${assessment.id}:correction:${correction.id}`,
        action: 'corrected',
        assessmentId: assessment.id,
        assessmentCode: assessment.code,
        correctionId: correction.id,
      }, tx);
      return assessment.id;
    });
    return this.getAssessment(contractId, corrected);
  },

  async compare(contractId: string, alunoId: string, assessmentIds?: string[]) {
    await assertAlunoInContract(alunoId, contractId);
    const assessments = assessmentIds?.length
      ? await prisma.anthropometryAssessment.findMany({
          where: { contractId, alunoId, id: { in: assessmentIds } },
          include: includeAssessment,
          orderBy: [{ assessmentDate: 'asc' }, { createdAt: 'asc' }],
        })
      : await prisma.anthropometryAssessment.findMany({
          where: { contractId, alunoId },
          include: includeAssessment,
          orderBy: [{ assessmentDate: 'asc' }, { createdAt: 'asc' }],
        });
    const decorated = await decorateAssessments(contractId, assessments);
    return addAnthropometryVariations(decorated);
  },
};
