import {
  Prisma,
  PrismaClient,
  type ProntuarioActivityType,
  type ProntuarioItemStatus,
  type ProntuarioMedicationProcedureType,
  type ProntuarioPainCaseStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

export const PARQ_LABELS: Record<string, string> = {
  q1: 'Algum médico já disse que você possui problema no coração e recomendou atividade física apenas sob supervisão?',
  q2: 'Você sente dor no peito causada pela prática de atividade física?',
  q3: 'Você sentiu dor no peito no último mês?',
  q4: 'Você perde o equilíbrio por tontura ou já perdeu a consciência?',
  q5: 'Você tem problema ósseo ou articular que poderia piorar com atividade física?',
  q6: 'Algum médico prescreveu medicamento para pressão arterial ou condição cardíaca?',
  q7: 'Você conhece outro motivo para não realizar atividade física?',
};

type JsonObject = Record<string, unknown>;

const includeRecord = {
  goals: { orderBy: [{ priority: 'asc' as const }, { createdAt: 'asc' as const }] },
  anamnesisFollowUps: { orderBy: { createdAt: 'asc' as const } },
  activityHistory: { orderBy: { createdAt: 'asc' as const } },
  medicationsProcedures: { orderBy: { createdAt: 'asc' as const } },
  painCases: { include: { followUps: { orderBy: { followUpAt: 'desc' as const } } }, orderBy: { createdAt: 'desc' as const } },
  discomfortSnapshots: { include: { entries: true }, orderBy: { snapshotAt: 'desc' as const } },
};

function parseDate(value?: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function positiveItemsFromResponses(responses: JsonObject) {
  return Object.entries(PARQ_LABELS)
    .filter(([key]) => responses[key] === true)
    .map(([key, label]) => ({ key, label }));
}

async function assertAlunoInContract(alunoId: string, contractId: string) {
  const aluno = await prisma.aluno.findFirst({
    where: { id: alunoId, professor: { contractId } },
    select: { id: true, professorId: true },
  });
  if (!aluno) throw new Error('Aluno não encontrado no contrato');
  return aluno;
}

function nextCodeFrom(code?: string | null) {
  const match = code?.match(/PRNT-(\d+)/i);
  const next = match ? Number(match[1]) + 1 : 1;
  return `PRNT-${String(next).padStart(3, '0')}`;
}

export const prontuarioService = {
  async listParqSubmissions(contractId: string, alunoId: string) {
    await assertAlunoInContract(alunoId, contractId);
    return prisma.studentParqSubmission.findMany({
      where: { contractId, alunoId },
      orderBy: { submittedAt: 'desc' },
    });
  },

  async createParqSubmission(contractId: string, alunoId: string, userId: string | undefined, responses: JsonObject, notes?: string | null) {
    await assertAlunoInContract(alunoId, contractId);
    return prisma.studentParqSubmission.create({
      data: {
        contractId,
        alunoId,
        submittedByUserId: userId,
        sourceType: 'student',
        responses: responses as Prisma.InputJsonValue,
        positiveItems: positiveItemsFromResponses(responses) as Prisma.InputJsonValue,
        declarationAccepted: responses.q8 === true,
        notes,
      },
    });
  },

  async overview(contractId: string, alunoId: string) {
    await assertAlunoInContract(alunoId, contractId);
    const [records, latestParqSubmission] = await Promise.all([
      prisma.prontuarioRecord.findMany({
        where: { contractId, alunoId },
        include: includeRecord,
        orderBy: [{ recordDate: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.studentParqSubmission.findFirst({
        where: { contractId, alunoId },
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    return {
      records,
      currentRecord: records[0] ?? null,
      latestParqSubmission,
    };
  },

  async createRecord(contractId: string, alunoId: string, professorId: string | undefined, data: { recordDate?: string; summary?: string | null; notes?: string | null }) {
    await assertAlunoInContract(alunoId, contractId);
    const latest = await prisma.prontuarioRecord.findFirst({
      where: { contractId, alunoId },
      orderBy: [{ createdAt: 'desc' }],
      select: { code: true },
    });

    const record = await prisma.prontuarioRecord.create({
      data: {
        contractId,
        alunoId,
        professorId,
        code: nextCodeFrom(latest?.code),
        recordDate: parseDate(data.recordDate) ?? new Date(),
        summary: data.summary,
        notes: data.notes,
      },
      include: includeRecord,
    });

    return record;
  },

  async updateRecord(contractId: string, recordId: string, data: { recordDate?: string; summary?: string | null; notes?: string | null; status?: 'open' | 'closed' | 'archived' }) {
    const existing = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    return prisma.prontuarioRecord.update({
      where: { id: existing.id },
      data: {
        recordDate: parseDate(data.recordDate),
        summary: data.summary,
        notes: data.notes,
        status: data.status,
        closedAt: data.status === 'closed' ? new Date() : undefined,
      },
      include: includeRecord,
    });
  },

  async saveGoals(contractId: string, recordId: string, goals: Array<{ title: string; description?: string | null; status?: ProntuarioItemStatus; priority?: number; targetDate?: string | null }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      await tx.prontuarioGoal.deleteMany({ where: { recordId: record.id } });
      if (goals.length) {
        await tx.prontuarioGoal.createMany({
          data: goals.filter((item) => item.title.trim()).map((item, index) => ({
            recordId: record.id,
            title: item.title.trim(),
            description: item.description,
            status: item.status ?? 'active',
            priority: item.priority ?? index,
            targetDate: parseDate(item.targetDate),
          })),
        });
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async saveAnamnesisFollowUps(contractId: string, recordId: string, items: Array<{ parqSubmissionId?: string | null; itemKey: string; itemLabel: string; status?: ProntuarioItemStatus; followUpNotes?: string | null; actionPlan?: string | null; closedAt?: string | null }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      await tx.prontuarioAnamnesisFollowUp.deleteMany({ where: { recordId: record.id } });
      if (items.length) {
        await tx.prontuarioAnamnesisFollowUp.createMany({
          data: items.map((item) => ({
            recordId: record.id,
            parqSubmissionId: item.parqSubmissionId || null,
            itemKey: item.itemKey,
            itemLabel: item.itemLabel,
            status: item.status ?? 'active',
            followUpNotes: item.followUpNotes,
            actionPlan: item.actionPlan,
            closedAt: parseDate(item.closedAt),
          })),
        });
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async closeAnamnesisFollowUp(contractId: string, followUpId: string) {
    const followUp = await prisma.prontuarioAnamnesisFollowUp.findFirstOrThrow({
      where: { id: followUpId, record: { contractId } },
      select: { id: true, recordId: true },
    });
    await prisma.prontuarioAnamnesisFollowUp.update({
      where: { id: followUp.id },
      data: { status: 'resolved', closedAt: new Date() },
    });
    return this.getRecord(contractId, followUp.recordId);
  },

  async saveActivityHistory(contractId: string, recordId: string, items: Array<{ activityType?: ProntuarioActivityType; description: string; frequency?: string | null; duration?: string | null; intensity?: string | null; startedAt?: string | null; endedAt?: string | null; notes?: string | null }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      await tx.prontuarioActivityHistory.deleteMany({ where: { recordId: record.id } });
      if (items.length) {
        await tx.prontuarioActivityHistory.createMany({
          data: items.filter((item) => item.description.trim()).map((item) => ({
            recordId: record.id,
            activityType: item.activityType ?? 'other',
            description: item.description.trim(),
            frequency: item.frequency,
            duration: item.duration,
            intensity: item.intensity,
            startedAt: parseDate(item.startedAt),
            endedAt: parseDate(item.endedAt),
            notes: item.notes,
          })),
        });
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async saveMedicationsProcedures(contractId: string, recordId: string, items: Array<{ type: ProntuarioMedicationProcedureType; name: string; dosage?: string | null; frequency?: string | null; startDate?: string | null; endDate?: string | null; notes?: string | null }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      await tx.prontuarioMedicationProcedure.deleteMany({ where: { recordId: record.id } });
      if (items.length) {
        await tx.prontuarioMedicationProcedure.createMany({
          data: items.filter((item) => item.name.trim()).map((item) => ({
            recordId: record.id,
            type: item.type,
            name: item.name.trim(),
            dosage: item.dosage,
            frequency: item.frequency,
            startDate: parseDate(item.startDate),
            endDate: parseDate(item.endDate),
            notes: item.notes,
          })),
        });
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async savePainCases(contractId: string, recordId: string, items: Array<{ title: string; region?: string | null; status?: ProntuarioPainCaseStatus; onsetDate?: string | null; description?: string | null; followUps?: Array<{ followUpAt?: string; intensity?: number | null; notes?: string | null; conduct?: string | null }> }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      await tx.prontuarioPainCase.deleteMany({ where: { recordId: record.id } });
      for (const item of items.filter((entry) => entry.title.trim())) {
        const painCase = await tx.prontuarioPainCase.create({
          data: {
            recordId: record.id,
            title: item.title.trim(),
            region: item.region,
            status: item.status ?? 'active',
            onsetDate: parseDate(item.onsetDate),
            description: item.description,
            closedAt: item.status === 'resolved' ? new Date() : null,
          },
        });
        if (item.followUps?.length) {
          await tx.prontuarioPainFollowUp.createMany({
            data: item.followUps.map((followUp) => ({
              painCaseId: painCase.id,
              followUpAt: parseDate(followUp.followUpAt) ?? new Date(),
              intensity: followUp.intensity,
              notes: followUp.notes,
              conduct: followUp.conduct,
            })),
          });
        }
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async createDiscomfortSnapshot(contractId: string, recordId: string, data: { notes?: string | null; entries: Array<{ regionId: string; regionName: string; discomfortTypes: string[]; intensity: number; notes?: string | null }> }) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    return prisma.prontuarioDiscomfortSnapshot.create({
      data: {
        contractId,
        alunoId: record.alunoId,
        recordId: record.id,
        notes: data.notes,
        entries: {
          create: data.entries.map((entry) => ({
            regionId: entry.regionId,
            regionName: entry.regionName,
            discomfortTypes: entry.discomfortTypes,
            intensity: entry.intensity,
            notes: entry.notes,
          })),
        },
      },
      include: { entries: true },
    });
  },

  async getRecord(contractId: string, recordId: string) {
    return prisma.prontuarioRecord.findFirst({
      where: { id: recordId, contractId },
      include: includeRecord,
    });
  },
};
