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
type ParqResponses = {
  q1: boolean;
  q2: boolean;
  q3: boolean;
  q4: boolean;
  q5: boolean;
  q6: boolean;
  q7: boolean;
  q8: boolean;
};

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

function normalizeParqResponses(responses: JsonObject): ParqResponses {
  return {
    q1: responses.q1 === true,
    q2: responses.q2 === true,
    q3: responses.q3 === true,
    q4: responses.q4 === true,
    q5: responses.q5 === true,
    q6: responses.q6 === true,
    q7: responses.q7 === true,
    q8: responses.q8 === true,
  };
}

function toNullableString(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
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
    const normalizedResponses = normalizeParqResponses(responses);
    return prisma.studentParqSubmission.create({
      data: {
        contractId,
        alunoId,
        submittedByUserId: userId,
        sourceType: 'student',
        responses: normalizedResponses as Prisma.InputJsonValue,
        positiveItems: positiveItemsFromResponses(normalizedResponses) as Prisma.InputJsonValue,
        declarationAccepted: normalizedResponses.q8,
        notes: toNullableString(notes),
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

  async saveGoals(contractId: string, recordId: string, goals: Array<{ id?: string; title: string; description?: string | null; status?: ProntuarioItemStatus; priority?: number; targetDate?: string | null }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.prontuarioGoal.findMany({ where: { recordId: record.id }, select: { id: true } });
      const existingIds = new Set(existing.map((item) => item.id));
      const touchedIds: string[] = [];

      for (const [index, item] of goals.entries()) {
        const title = item.title?.trim();
        if (!title) continue;

        const payload = {
          title,
          description: toNullableString(item.description),
          status: item.status ?? 'active',
          priority: item.priority ?? index,
          targetDate: parseDate(item.targetDate) ?? null,
        };

        if (item.id && existingIds.has(item.id)) {
          await tx.prontuarioGoal.update({ where: { id: item.id }, data: payload });
          touchedIds.push(item.id);
          continue;
        }

        const created = await tx.prontuarioGoal.create({
          data: {
            recordId: record.id,
            ...payload,
          },
          select: { id: true },
        });
        touchedIds.push(created.id);
      }

      await tx.prontuarioGoal.updateMany({
        where: {
          recordId: record.id,
          status: { not: 'archived' },
          ...(touchedIds.length ? { id: { notIn: touchedIds } } : {}),
        },
        data: { status: 'archived' },
      });
    });
    return this.getRecord(contractId, record.id);
  },

  async saveAnamnesisFollowUps(contractId: string, recordId: string, items: Array<{ id?: string; parqSubmissionId?: string | null; itemKey: string; itemLabel: string; status?: ProntuarioItemStatus; followUpNotes?: string | null; actionPlan?: string | null; closedAt?: string | null }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.prontuarioAnamnesisFollowUp.findMany({ where: { recordId: record.id }, select: { id: true } });
      const existingIds = new Set(existing.map((item) => item.id));
      const touchedIds: string[] = [];

      for (const item of items) {
        const itemKey = item.itemKey?.trim();
        const itemLabel = item.itemLabel?.trim();
        if (!itemKey || !itemLabel) continue;

        const payload = {
          parqSubmissionId: item.parqSubmissionId || null,
          itemKey,
          itemLabel,
          status: item.status ?? 'active',
          followUpNotes: toNullableString(item.followUpNotes),
          actionPlan: toNullableString(item.actionPlan),
          closedAt: parseDate(item.closedAt) ?? null,
        };

        if (item.id && existingIds.has(item.id)) {
          await tx.prontuarioAnamnesisFollowUp.update({ where: { id: item.id }, data: payload });
          touchedIds.push(item.id);
          continue;
        }

        const created = await tx.prontuarioAnamnesisFollowUp.create({
          data: {
            recordId: record.id,
            ...payload,
          },
          select: { id: true },
        });
        touchedIds.push(created.id);
      }

      await tx.prontuarioAnamnesisFollowUp.updateMany({
        where: {
          recordId: record.id,
          status: { not: 'archived' },
          ...(touchedIds.length ? { id: { notIn: touchedIds } } : {}),
        },
        data: { status: 'archived' },
      });
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

  async saveActivityHistory(contractId: string, recordId: string, items: Array<{ id?: string; activityType?: ProntuarioActivityType; description: string; frequency?: string | null; duration?: string | null; intensity?: string | null; startedAt?: string | null; endedAt?: string | null; notes?: string | null }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.prontuarioActivityHistory.findMany({ where: { recordId: record.id }, select: { id: true } });
      const existingIds = new Set(existing.map((item) => item.id));

      for (const item of items) {
        const description = item.description?.trim();
        if (!description) continue;

        const payload = {
          activityType: item.activityType ?? 'other',
          description,
          frequency: toNullableString(item.frequency),
          duration: toNullableString(item.duration),
          intensity: toNullableString(item.intensity),
          startedAt: parseDate(item.startedAt) ?? null,
          endedAt: parseDate(item.endedAt) ?? null,
          notes: toNullableString(item.notes),
        };

        if (item.id && existingIds.has(item.id)) {
          await tx.prontuarioActivityHistory.update({ where: { id: item.id }, data: payload });
          continue;
        }

        await tx.prontuarioActivityHistory.create({
          data: {
            recordId: record.id,
            ...payload,
          },
        });
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async saveMedicationsProcedures(contractId: string, recordId: string, items: Array<{ id?: string; type: ProntuarioMedicationProcedureType; name: string; dosage?: string | null; frequency?: string | null; startDate?: string | null; endDate?: string | null; notes?: string | null }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.prontuarioMedicationProcedure.findMany({ where: { recordId: record.id }, select: { id: true } });
      const existingIds = new Set(existing.map((item) => item.id));

      for (const item of items) {
        const name = item.name?.trim();
        if (!name) continue;

        const payload = {
          type: item.type,
          name,
          dosage: toNullableString(item.dosage),
          frequency: toNullableString(item.frequency),
          startDate: parseDate(item.startDate) ?? null,
          endDate: parseDate(item.endDate) ?? null,
          notes: toNullableString(item.notes),
        };

        if (item.id && existingIds.has(item.id)) {
          await tx.prontuarioMedicationProcedure.update({ where: { id: item.id }, data: payload });
          continue;
        }

        await tx.prontuarioMedicationProcedure.create({
          data: {
            recordId: record.id,
            ...payload,
          },
        });
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async savePainCases(contractId: string, recordId: string, items: Array<{ id?: string; title: string; region?: string | null; status?: ProntuarioPainCaseStatus; onsetDate?: string | null; description?: string | null; followUps?: Array<{ id?: string; followUpAt?: string; intensity?: number | null; notes?: string | null; conduct?: string | null }> }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existingCases = await tx.prontuarioPainCase.findMany({
        where: { recordId: record.id },
        select: { id: true, followUps: { select: { id: true } } },
      });
      const existingCaseIds = new Set(existingCases.map((item) => item.id));
      const followUpsByCaseId = new Map(
        existingCases.map((item) => [item.id, new Set(item.followUps.map((followUp) => followUp.id))])
      );

      for (const item of items) {
        const title = item.title?.trim();
        if (!title) continue;

        const casePayload = {
          title,
          region: toNullableString(item.region),
          status: item.status ?? 'active',
          onsetDate: parseDate(item.onsetDate) ?? null,
          description: toNullableString(item.description),
          closedAt: item.status === 'resolved' ? new Date() : null,
        };

        let painCaseId: string;
        if (item.id && existingCaseIds.has(item.id)) {
          await tx.prontuarioPainCase.update({ where: { id: item.id }, data: casePayload });
          painCaseId = item.id;
        } else {
          const created = await tx.prontuarioPainCase.create({
            data: {
              recordId: record.id,
              ...casePayload,
            },
            select: { id: true },
          });
          painCaseId = created.id;
        }

        if (item.followUps?.length) {
          const existingFollowUpIds = followUpsByCaseId.get(painCaseId) ?? new Set<string>();

          for (const followUp of item.followUps) {
            const followUpPayload = {
              followUpAt: parseDate(followUp.followUpAt) ?? new Date(),
              intensity: followUp.intensity ?? null,
              notes: toNullableString(followUp.notes),
              conduct: toNullableString(followUp.conduct),
            };

            if (followUp.id && existingFollowUpIds.has(followUp.id)) {
              await tx.prontuarioPainFollowUp.update({
                where: { id: followUp.id },
                data: followUpPayload,
              });
              continue;
            }

            await tx.prontuarioPainFollowUp.create({
              data: {
                painCaseId,
                ...followUpPayload,
              },
            });
          }
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
