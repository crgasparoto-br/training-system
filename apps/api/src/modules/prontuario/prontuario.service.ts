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

async function resolveAlunoContractContext(
  alunoId: string,
  fallbackContractId?: string,
  client: PrismaClient | Prisma.TransactionClient = prisma
) {
  const aluno = await client.aluno.findUnique({
    where: { id: alunoId },
    select: {
      id: true,
      professorId: true,
      contractId: true,
      professor: { select: { contractId: true } },
      currentStudentContract: {
        select: {
          contract: {
            select: {
              companyContractId: true,
            },
          },
        },
      },
    },
  });

  if (!aluno) {
    throw new Error('Aluno não encontrado no contrato');
  }

  // Issue #268: contractId direto em Aluno é a fonte tenant-scoped correta.
  const resolvedContractId =
    aluno.contractId ||
    aluno.currentStudentContract?.contract.companyContractId ||
    aluno.professor?.contractId;

  if (fallbackContractId && resolvedContractId !== fallbackContractId) {
    throw new Error('Aluno não encontrado no contrato');
  }

  return {
    id: aluno.id,
    professorId: aluno.professorId,
    contractId: resolvedContractId,
  };
}

async function assertAlunoInContract(alunoId: string, contractId: string) {
  return resolveAlunoContractContext(alunoId, contractId);
}

function isTerminalItemStatus(status: ProntuarioItemStatus) {
  return status === 'resolved' || status === 'archived';
}

function toArchivedItemState<T extends { status: ProntuarioItemStatus; closedAt?: Date | null }>(item: T) {
  return {
    status: (item.status === 'resolved' ? item.status : 'archived') as ProntuarioItemStatus,
    closedAt: item.closedAt ?? new Date(),
  };
}

function toArchivedPainCaseState(status: ProntuarioPainCaseStatus, closedAt?: Date | null) {
  return {
    status: (status === 'resolved' ? status : 'archived') as ProntuarioPainCaseStatus,
    closedAt: closedAt ?? new Date(),
  };
}

function effectivePainCaseClosedAt(status: ProntuarioPainCaseStatus, currentClosedAt?: Date | null) {
  if (status === 'resolved' || status === 'archived') {
    return currentClosedAt ?? new Date();
  }

  return null;
}

async function assertParqSubmissionBelongsToRecord(
  tx: Prisma.TransactionClient,
  params: { contractId: string; alunoId: string; parqSubmissionId?: string | null }
) {
  if (!params.parqSubmissionId) return null;

  return tx.studentParqSubmission.findFirstOrThrow({
    where: {
      id: params.parqSubmissionId,
      contractId: params.contractId,
      alunoId: params.alunoId,
    },
    select: { id: true },
  });
}

function nextCodeFrom(code?: string | null) {
  const match = code?.match(/PRNT-(\d+)/i);
  const next = match ? Number(match[1]) + 1 : 1;
  return `PRNT-${String(next).padStart(3, '0')}`;
}

function withSnapshotProfessorId<T extends { professorId?: string | null; discomfortSnapshots: Array<Record<string, unknown>> }>(record: T) {
  return {
    ...record,
    discomfortSnapshots: record.discomfortSnapshots.map((snapshot) => ({
      ...snapshot,
      professorId: (snapshot as { professorId?: string | null }).professorId ?? record.professorId ?? null,
    })),
  };
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
    const aluno = await assertAlunoInContract(alunoId, contractId);
    const normalizedResponses = normalizeParqResponses(responses);
    return prisma.studentParqSubmission.create({
      data: {
        contractId: aluno.contractId,
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
    const [records, parqSubmissions] = await Promise.all([
      prisma.prontuarioRecord.findMany({
        where: { contractId, alunoId },
        include: includeRecord,
        orderBy: [{ recordDate: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.studentParqSubmission.findMany({
        where: { contractId, alunoId },
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const normalizedRecords = records.map((record) => withSnapshotProfessorId(record));

    return {
      records: normalizedRecords,
      currentRecord: normalizedRecords[0] ?? null,
      latestParqSubmission: parqSubmissions[0] ?? null,
      parqSubmissions,
    };
  },

  async createRecord(contractId: string, alunoId: string, professorId: string | undefined, data: { recordDate?: string; summary?: string | null; notes?: string | null }) {
    const aluno = await assertAlunoInContract(alunoId, contractId);
    const latest = await prisma.prontuarioRecord.findFirst({
      where: { contractId: aluno.contractId, alunoId },
      orderBy: [{ createdAt: 'desc' }],
      select: { code: true },
    });

    const record = await prisma.prontuarioRecord.create({
      data: {
        contractId: aluno.contractId,
        alunoId,
        professorId,
        code: nextCodeFrom(latest?.code),
        recordDate: parseDate(data.recordDate) ?? new Date(),
        summary: data.summary,
        notes: data.notes,
      },
      include: includeRecord,
    });

    return withSnapshotProfessorId(record);
  },

  async updateRecord(contractId: string, recordId: string, data: { recordDate?: string; summary?: string | null; notes?: string | null; status?: 'open' | 'closed' | 'archived' }) {
    const existing = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    const record = await prisma.prontuarioRecord.update({
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
    return withSnapshotProfessorId(record);
  },

  async saveGoals(contractId: string, recordId: string, goals: Array<{ id?: string; title: string; description?: string | null; status?: ProntuarioItemStatus; priority?: number; targetDate?: string | null }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.prontuarioGoal.findMany({ where: { recordId: record.id }, select: { id: true, status: true } });
      const existingById = new Map(existing.map((item) => [item.id, item]));
      const touchedIds = new Set<string>();

      for (const [index, item] of goals.entries()) {
        const title = item.title?.trim();
        if (!title) continue;

        const existingItem = item.id ? existingById.get(item.id) : null;

        const payload = {
          title,
          description: toNullableString(item.description),
          status: item.status ?? existingItem?.status ?? 'active',
          priority: item.priority ?? index,
          targetDate: parseDate(item.targetDate) ?? null,
        };

        if (item.id && existingItem) {
          await tx.prontuarioGoal.update({ where: { id: item.id }, data: payload });
          touchedIds.add(item.id);
          continue;
        }

        const created = await tx.prontuarioGoal.create({
          data: {
            recordId: record.id,
            ...payload,
          },
          select: { id: true },
        });
        touchedIds.add(created.id);
      }

      for (const item of existing) {
        if (touchedIds.has(item.id) || isTerminalItemStatus(item.status)) continue;
        await tx.prontuarioGoal.update({
          where: { id: item.id },
          data: { status: 'archived' },
        });
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async saveAnamnesisFollowUps(contractId: string, recordId: string, items: Array<{ id?: string; parqSubmissionId?: string | null; itemKey: string; itemLabel: string; status?: ProntuarioItemStatus; followUpNotes?: string | null; actionPlan?: string | null; closedAt?: string | null }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.prontuarioAnamnesisFollowUp.findMany({
        where: { recordId: record.id },
        select: { id: true, itemKey: true, parqSubmissionId: true, status: true, closedAt: true },
      });
      const existingById = new Map(existing.map((item) => [item.id, item]));
      const existingBySubmissionAndKey = new Map(
        existing.map((item) => [`${item.parqSubmissionId ?? '__none__'}:${item.itemKey}`, item])
      );
      const targetedSubmissionIds = new Set(
        items.map((item) => item.parqSubmissionId || '__none__')
      );
      const touchedIds = new Set<string>();

      for (const item of items) {
        const itemKey = item.itemKey?.trim();
        const itemLabel = item.itemLabel?.trim();
        if (!itemKey || !itemLabel) continue;

        await assertParqSubmissionBelongsToRecord(tx, {
          contractId,
          alunoId: record.alunoId,
          parqSubmissionId: item.parqSubmissionId,
        });

        const compositeKey = `${item.parqSubmissionId ?? '__none__'}:${itemKey}`;
        const existingItem = item.id
          ? existingById.get(item.id)
          : existingBySubmissionAndKey.get(compositeKey) ?? null;

        const payload = {
          parqSubmissionId: item.parqSubmissionId || null,
          itemKey,
          itemLabel,
          status: item.status ?? existingItem?.status ?? 'active',
          followUpNotes: toNullableString(item.followUpNotes),
          actionPlan: toNullableString(item.actionPlan),
          closedAt: parseDate(item.closedAt) ?? existingItem?.closedAt ?? null,
        };

        if (item.id && existingItem) {
          await tx.prontuarioAnamnesisFollowUp.update({ where: { id: item.id }, data: payload });
          touchedIds.add(item.id);
          continue;
        }

        if (existingItem) {
          await tx.prontuarioAnamnesisFollowUp.update({ where: { id: existingItem.id }, data: payload });
          touchedIds.add(existingItem.id);
          continue;
        }

        const created = await tx.prontuarioAnamnesisFollowUp.create({
          data: {
            recordId: record.id,
            ...payload,
          },
          select: { id: true },
        });
        touchedIds.add(created.id);
      }

      for (const item of existing) {
        if (touchedIds.has(item.id) || isTerminalItemStatus(item.status)) continue;
        if (!targetedSubmissionIds.has(item.parqSubmissionId || '__none__')) continue;
        await tx.prontuarioAnamnesisFollowUp.update({
          where: { id: item.id },
          data: toArchivedItemState(item),
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

  async saveActivityHistory(contractId: string, recordId: string, items: Array<{ id?: string; activityType?: ProntuarioActivityType; description: string; frequency?: string | null; duration?: string | null; intensity?: string | null; startedAt?: string | null; endedAt?: string | null; notes?: string | null }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.prontuarioActivityHistory.findMany({ where: { recordId: record.id }, select: { id: true, endedAt: true } });
      const existingIds = new Set(existing.map((item) => item.id));
      const touchedIds = new Set<string>();

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
          touchedIds.add(item.id);
          continue;
        }

        const created = await tx.prontuarioActivityHistory.create({
          data: {
            recordId: record.id,
            ...payload,
          },
          select: { id: true },
        });
        touchedIds.add(created.id);
      }

      for (const item of existing) {
        if (touchedIds.has(item.id) || item.endedAt) continue;
        await tx.prontuarioActivityHistory.update({
          where: { id: item.id },
          data: { endedAt: new Date() },
        });
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async saveMedicationsProcedures(contractId: string, recordId: string, items: Array<{ id?: string; type: ProntuarioMedicationProcedureType; name: string; dosage?: string | null; frequency?: string | null; startDate?: string | null; endDate?: string | null; notes?: string | null }>) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.prontuarioMedicationProcedure.findMany({ where: { recordId: record.id }, select: { id: true, endDate: true } });
      const existingIds = new Set(existing.map((item) => item.id));
      const touchedIds = new Set<string>();

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
          touchedIds.add(item.id);
          continue;
        }

        const created = await tx.prontuarioMedicationProcedure.create({
          data: {
            recordId: record.id,
            ...payload,
          },
          select: { id: true },
        });
        touchedIds.add(created.id);
      }

      for (const item of existing) {
        if (touchedIds.has(item.id) || item.endDate) continue;
        await tx.prontuarioMedicationProcedure.update({
          where: { id: item.id },
          data: { endDate: new Date() },
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
        select: { id: true, status: true, closedAt: true, followUps: { select: { id: true } } },
      });
      const existingCaseIds = new Set(existingCases.map((item) => item.id));
      const followUpsByCaseId = new Map(
        existingCases.map((item) => [item.id, new Set(item.followUps.map((followUp) => followUp.id))])
      );
      const touchedCaseIds = new Set<string>();

      for (const item of items) {
        const title = item.title?.trim();
        if (!title) continue;

        const existingCase = item.id ? existingCases.find((entry) => entry.id === item.id) : null;
        const nextStatus = item.status ?? existingCase?.status ?? 'active';

        const casePayload = {
          title,
          region: toNullableString(item.region),
          status: nextStatus,
          onsetDate: parseDate(item.onsetDate) ?? null,
          description: toNullableString(item.description),
          closedAt: effectivePainCaseClosedAt(nextStatus, existingCase?.closedAt),
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
        touchedCaseIds.add(painCaseId);

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

      for (const item of existingCases) {
        if (touchedCaseIds.has(item.id) || item.status === 'resolved' || item.status === 'archived') continue;
        await tx.prontuarioPainCase.update({
          where: { id: item.id },
          data: toArchivedPainCaseState(item.status, item.closedAt),
        });
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async createDiscomfortSnapshot(contractId: string, recordId: string, data: { notes?: string | null; entries: Array<{ regionId: string; regionName: string; discomfortTypes: string[]; intensity: number; notes?: string | null }> }) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    const snapshot = await prisma.prontuarioDiscomfortSnapshot.create({
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

    return {
      ...snapshot,
      professorId: record.professorId ?? null,
    };
  },

  async getRecord(contractId: string, recordId: string) {
    const record = await prisma.prontuarioRecord.findFirst({
      where: { id: recordId, contractId },
      include: includeRecord,
    });

    return record ? withSnapshotProfessorId(record) : null;
  },
};