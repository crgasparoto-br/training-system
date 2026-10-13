import {
  Prisma,
  PrismaClient,
  type ProntuarioActivityType,
  type ProntuarioItemStatus,
  type ProntuarioMedicationProcedureType,
  type ProntuarioPainCaseStatus,
} from '@prisma/client';
import { appendProntuarioHistory, assertKnownProntuarioItem, type ProntuarioHistoryEntityType } from './prontuario-history.service.js';
import { preRegistrationParqService } from '../pre-registration-public/pre-registration-parq.service.js';

const prisma = new PrismaClient();

const includeRecord = {
  goals: { orderBy: [{ priority: 'asc' as const }, { createdAt: 'asc' as const }] },
  anamnesisFollowUps: { orderBy: { createdAt: 'asc' as const } },
  activityHistory: { orderBy: { createdAt: 'asc' as const } },
  medicationsProcedures: { orderBy: { createdAt: 'asc' as const } },
  painCases: {
    include: { followUps: { orderBy: { followUpAt: 'desc' as const } } },
    orderBy: { createdAt: 'desc' as const },
  },
  discomfortSnapshots: {
    include: { entries: true },
    orderBy: { snapshotAt: 'desc' as const },
  },
};

function parseDate(value?: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
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

  // Issue #268: contractId direto em Aluno é obrigatório e canônico.
  const resolvedContractId = aluno.contractId;

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

function goalSnapshot(goal: { title?: string; description?: string | null; status?: ProntuarioItemStatus; priority?: number; targetDate?: Date | null; closedAt?: Date | null }) {
  return {
    title: goal.title ?? null, description: goal.description ?? null, status: goal.status ?? null,
    priority: goal.priority ?? 0, targetDate: goal.targetDate ?? null, closedAt: goal.closedAt ?? null,
  };
}

function medicationSnapshot(item: { type?: ProntuarioMedicationProcedureType; name?: string; dosage?: string | null; frequency?: string | null; startDate?: Date | null; endDate?: Date | null; notes?: string | null }) {
  return {
    type: item.type ?? null, name: item.name ?? null, dosage: item.dosage ?? null,
    frequency: item.frequency ?? null, startDate: item.startDate ?? null,
    endDate: item.endDate ?? null, notes: item.notes ?? null,
  };
}

function followUpSnapshot(item: { parqSubmissionId?: string | null; itemKey?: string; itemLabel?: string; status?: ProntuarioItemStatus; followUpNotes?: string | null; actionPlan?: string | null; closedAt?: Date | null }) {
  return {
    parqSubmissionId: item.parqSubmissionId ?? null, itemKey: item.itemKey ?? null,
    itemLabel: item.itemLabel ?? null, status: item.status ?? null,
    followUpNotes: item.followUpNotes ?? null, actionPlan: item.actionPlan ?? null,
    closedAt: item.closedAt ?? null,
  };
}

function painSnapshot(item: { title?: string; region?: string | null; status?: ProntuarioPainCaseStatus; onsetDate?: Date | null; description?: string | null; closedAt?: Date | null }) {
  return {
    title: item.title ?? null, region: item.region ?? null, status: item.status ?? null,
    onsetDate: item.onsetDate ?? null, description: item.description ?? null, closedAt: item.closedAt ?? null,
  };
}

function activitySnapshot(item: { activityType?: ProntuarioActivityType; description?: string; frequency?: string | null; duration?: string | null; intensity?: string | null; startedAt?: Date | null; endedAt?: Date | null; notes?: string | null }) {
  return {
    activityType: item.activityType ?? null, description: item.description ?? null,
    frequency: item.frequency ?? null, duration: item.duration ?? null,
    intensity: item.intensity ?? null, startedAt: item.startedAt ?? null,
    endedAt: item.endedAt ?? null, notes: item.notes ?? null,
  };
}

function recordSnapshot(item: { recordDate: Date; summary?: string | null; notes?: string | null; status: string; closedAt?: Date | null }) {
  return {
    recordDate: item.recordDate, summary: item.summary ?? null, notes: item.notes ?? null,
    status: item.status, closedAt: item.closedAt ?? null,
  };
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
    return preRegistrationParqService.listSubmissions(contractId, alunoId);
  },

  async overview(contractId: string, alunoId: string) {
    await assertAlunoInContract(alunoId, contractId);
    const [records, parq] = await Promise.all([
      prisma.prontuarioRecord.findMany({
        where: { contractId, alunoId },
        include: includeRecord,
        orderBy: [{ recordDate: 'desc' }, { createdAt: 'desc' }],
      }),
      preRegistrationParqService.overview(contractId, alunoId),
    ]);

    const normalizedRecords = records.map((record) => withSnapshotProfessorId(record));
    return {
      records: normalizedRecords,
      currentRecord: normalizedRecords[0] ?? null,
      latestParqSubmission: parq.latestSubmission,
      parqSubmissions: parq.submissions,
      parqState: parq.state,
      parqLegacy: parq.legacy,
    };
  },

  async createRecord(contractId: string, alunoId: string, professorId: string | undefined, data: { recordDate?: string; summary?: string | null; notes?: string | null }, actorUserId?: string) {
    const aluno = await assertAlunoInContract(alunoId, contractId);
    return prisma.$transaction(async (tx) => {
      const latest = await tx.prontuarioRecord.findFirst({
        where: { contractId: aluno.contractId, alunoId },
        orderBy: [{ createdAt: 'desc' }],
        select: { code: true },
      });
      const record = await tx.prontuarioRecord.create({
        data: {
          contractId: aluno.contractId, alunoId, professorId,
          code: nextCodeFrom(latest?.code), recordDate: parseDate(data.recordDate) ?? new Date(),
          summary: data.summary, notes: data.notes,
        },
        include: includeRecord,
      });
      await appendProntuarioHistory(tx, record, 'record', record.id, null, recordSnapshot(record), actorUserId);
      return withSnapshotProfessorId(record);
    });
  },

  async updateRecord(contractId: string, recordId: string, data: { recordDate?: string; summary?: string | null; notes?: string | null; status?: 'open' | 'closed' | 'archived' }, actorUserId?: string) {
    const updated = await prisma.$transaction(async (tx) => {
      const previous = await tx.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
      const status = data.status ?? previous.status;
      const payload = {
        recordDate: data.recordDate === undefined ? previous.recordDate : parseDate(data.recordDate) ?? previous.recordDate,
        summary: data.summary === undefined ? previous.summary : toNullableString(data.summary),
        notes: data.notes === undefined ? previous.notes : toNullableString(data.notes),
        status,
        closedAt: status === 'open' ? null : previous.closedAt ?? new Date(),
      };
      if (await appendProntuarioHistory(tx, previous, 'record', previous.id, recordSnapshot(previous), recordSnapshot(payload), actorUserId)) {
        await tx.prontuarioRecord.update({ where: { id: previous.id }, data: payload });
      }
      return tx.prontuarioRecord.findFirstOrThrow({ where: { id: previous.id, contractId }, include: includeRecord });
    });
    return withSnapshotProfessorId(updated);
  },

  async saveGoals(contractId: string, recordId: string, goals: Array<{ id?: string; title: string; description?: string | null; status?: ProntuarioItemStatus; priority?: number; targetDate?: string | null }>, actorUserId?: string) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.prontuarioGoal.findMany({ where: { recordId: record.id } });
      const existingById = new Map(existing.map((item) => [item.id, item]));
      const touchedIds = new Set<string>();

      for (const [index, item] of goals.entries()) {
        const title = item.title?.trim();
        if (!title) continue;
        const previous = item.id ? existingById.get(item.id) : undefined;
        assertKnownProntuarioItem(item.id, Boolean(previous));
        const status = item.status ?? previous?.status ?? 'active';
        const payload = {
          title,
          description: toNullableString(item.description) ?? previous?.description ?? null,
          status,
          priority: item.priority ?? previous?.priority ?? index,
          targetDate: item.targetDate === undefined ? previous?.targetDate ?? null : parseDate(item.targetDate) ?? null,
          closedAt: isTerminalItemStatus(status) ? previous?.closedAt ?? new Date() : null,
        };
        if (previous) {
          const before = goalSnapshot(previous);
          const after = goalSnapshot(payload);
          if (await appendProntuarioHistory(tx, record, 'goal', previous.id, before, after, actorUserId)) {
            await tx.prontuarioGoal.update({ where: { id: previous.id }, data: payload });
          }
          touchedIds.add(previous.id);
        } else {
          const created = await tx.prontuarioGoal.create({
            data: { recordId: record.id, ...payload },
          });
          await appendProntuarioHistory(tx, record, 'goal', created.id, null, goalSnapshot(payload), actorUserId);
          touchedIds.add(created.id);
        }
      }

      for (const item of existing) {
        if (touchedIds.has(item.id) || isTerminalItemStatus(item.status)) continue;
        const archived = { ...item, status: 'archived' as ProntuarioItemStatus, closedAt: item.closedAt ?? new Date() };
        await appendProntuarioHistory(tx, record, 'goal', item.id, goalSnapshot(item), goalSnapshot(archived), actorUserId);
        await tx.prontuarioGoal.update({
          where: { id: item.id },
          data: { status: 'archived', closedAt: archived.closedAt },
        });
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async saveAnamnesisFollowUps(contractId: string, recordId: string, items: Array<{ id?: string; parqSubmissionId?: string | null; itemKey: string; itemLabel: string; status?: ProntuarioItemStatus; followUpNotes?: string | null; actionPlan?: string | null; closedAt?: string | null }>, actorUserId?: string) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.prontuarioAnamnesisFollowUp.findMany({ where: { recordId: record.id } });
      const existingById = new Map(existing.map((item) => [item.id, item]));
      const existingBySubmissionAndKey = new Map(existing.map((item) => [
        `${item.parqSubmissionId ?? '__none__'}:${item.itemKey}`, item,
      ]));
      const targetedSubmissionIds = new Set(items.map((item) => item.parqSubmissionId || '__none__'));
      const touchedIds = new Set<string>();
      for (const item of items) {
        const itemKey = item.itemKey?.trim();
        const itemLabel = item.itemLabel?.trim();
        if (!itemKey || !itemLabel) continue;
        await assertParqSubmissionBelongsToRecord(tx, { contractId, alunoId: record.alunoId, parqSubmissionId: item.parqSubmissionId });
        const compositeKey = `${item.parqSubmissionId ?? '__none__'}:${itemKey}`;
        const previous = item.id ? existingById.get(item.id) : existingBySubmissionAndKey.get(compositeKey);
        assertKnownProntuarioItem(item.id, Boolean(previous));
        if (previous && (previous.itemKey !== itemKey || previous.parqSubmissionId !== (item.parqSubmissionId || null))) {
          throw new Error('Registro clínico não encontrado no contrato');
        }
        const status = item.status ?? previous?.status ?? 'active';
        const payload = {
          parqSubmissionId: item.parqSubmissionId || null, itemKey, itemLabel, status,
          followUpNotes: item.followUpNotes === undefined ? previous?.followUpNotes ?? null : toNullableString(item.followUpNotes) ?? null,
          actionPlan: item.actionPlan === undefined ? previous?.actionPlan ?? null : toNullableString(item.actionPlan) ?? null,
          closedAt: isTerminalItemStatus(status) ? parseDate(item.closedAt) ?? previous?.closedAt ?? new Date() : null,
        };
        if (previous) {
          if (await appendProntuarioHistory(tx, record, 'anamnesisFollowUp', previous.id, followUpSnapshot(previous), followUpSnapshot(payload), actorUserId)) {
            await tx.prontuarioAnamnesisFollowUp.update({ where: { id: previous.id }, data: payload });
          }
          touchedIds.add(previous.id);
        } else {
          const created = await tx.prontuarioAnamnesisFollowUp.create({ data: { recordId: record.id, ...payload } });
          await appendProntuarioHistory(tx, record, 'anamnesisFollowUp', created.id, null, followUpSnapshot(payload), actorUserId);
          touchedIds.add(created.id);
        }
      }
      for (const item of existing) {
        if (touchedIds.has(item.id) || isTerminalItemStatus(item.status)) continue;
        if (!targetedSubmissionIds.has(item.parqSubmissionId || '__none__')) continue;
        const archived = { ...item, ...toArchivedItemState(item) };
        await appendProntuarioHistory(tx, record, 'anamnesisFollowUp', item.id, followUpSnapshot(item), followUpSnapshot(archived), actorUserId);
        await tx.prontuarioAnamnesisFollowUp.update({ where: { id: item.id }, data: toArchivedItemState(item) });
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async closeAnamnesisFollowUp(contractId: string, followUpId: string, actorUserId?: string) {
    const recordId = await prisma.$transaction(async (tx) => {
      const followUp = await tx.prontuarioAnamnesisFollowUp.findFirstOrThrow({
        where: { id: followUpId, record: { contractId } }, include: { record: true },
      });
      if (!isTerminalItemStatus(followUp.status)) {
        const closed = { ...followUp, status: 'resolved' as ProntuarioItemStatus, closedAt: followUp.closedAt ?? new Date() };
        await appendProntuarioHistory(tx, followUp.record, 'anamnesisFollowUp', followUp.id, followUpSnapshot(followUp), followUpSnapshot(closed), actorUserId);
        await tx.prontuarioAnamnesisFollowUp.update({ where: { id: followUp.id }, data: { status: 'resolved', closedAt: closed.closedAt } });
      }
      return followUp.recordId;
    });
    return this.getRecord(contractId, recordId);
  },

  async saveActivityHistory(contractId: string, recordId: string, items: Array<{ id?: string; activityType?: ProntuarioActivityType; description: string; frequency?: string | null; duration?: string | null; intensity?: string | null; startedAt?: string | null; endedAt?: string | null; notes?: string | null }>, actorUserId?: string) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.prontuarioActivityHistory.findMany({ where: { recordId: record.id } });
      const existingById = new Map(existing.map((item) => [item.id, item]));
      const touchedIds = new Set<string>();
      for (const item of items) {
        const description = item.description?.trim();
        if (!description) continue;
        const previous = item.id ? existingById.get(item.id) : undefined;
        assertKnownProntuarioItem(item.id, Boolean(previous));
        const payload = {
          activityType: item.activityType ?? previous?.activityType ?? 'other', description,
          frequency: item.frequency === undefined ? previous?.frequency ?? null : toNullableString(item.frequency) ?? null,
          duration: item.duration === undefined ? previous?.duration ?? null : toNullableString(item.duration) ?? null,
          intensity: item.intensity === undefined ? previous?.intensity ?? null : toNullableString(item.intensity) ?? null,
          startedAt: item.startedAt === undefined ? previous?.startedAt ?? null : parseDate(item.startedAt) ?? null,
          endedAt: item.endedAt === undefined ? previous?.endedAt ?? null : parseDate(item.endedAt) ?? null,
          notes: item.notes === undefined ? previous?.notes ?? null : toNullableString(item.notes) ?? null,
        };
        if (previous) {
          if (await appendProntuarioHistory(tx, record, 'activityHistory', previous.id, activitySnapshot(previous), activitySnapshot(payload), actorUserId)) {
            await tx.prontuarioActivityHistory.update({ where: { id: previous.id }, data: payload });
          }
          touchedIds.add(previous.id);
        } else {
          const created = await tx.prontuarioActivityHistory.create({ data: { recordId: record.id, ...payload } });
          await appendProntuarioHistory(tx, record, 'activityHistory', created.id, null, activitySnapshot(payload), actorUserId);
          touchedIds.add(created.id);
        }
      }
      for (const item of existing) {
        if (touchedIds.has(item.id) || item.endedAt) continue;
        const ended = { ...item, endedAt: new Date() };
        await appendProntuarioHistory(tx, record, 'activityHistory', item.id, activitySnapshot(item), activitySnapshot(ended), actorUserId);
        await tx.prontuarioActivityHistory.update({ where: { id: item.id }, data: { endedAt: ended.endedAt } });
      }
    });
    return this.getRecord(contractId, record.id);
  },

  async saveMedicationsProcedures(contractId: string, recordId: string, items: Array<{ id?: string; type: ProntuarioMedicationProcedureType; name: string; dosage?: string | null; frequency?: string | null; startDate?: string | null; endDate?: string | null; notes?: string | null }>, actorUserId?: string) {
    const record = await prisma.prontuarioRecord.findFirstOrThrow({ where: { id: recordId, contractId } });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.prontuarioMedicationProcedure.findMany({ where: { recordId: record.id } });
      const existingById = new Map(existing.map((item) => [item.id, item]));
      const touchedIds = new Set<string>();
      for (const item of items) {
        const name = item.name?.trim();
        if (!name) continue;
        const previous = item.id ? existingById.get(item.id) : undefined;
        assertKnownProntuarioItem(item.id, Boolean(previous));
        const payload = {
          type: item.type, name,
          dosage: toNullableString(item.dosage) ?? previous?.dosage ?? null,
          frequency: toNullableString(item.frequency) ?? previous?.frequency ?? null,
          startDate: item.startDate === undefined ? previous?.startDate ?? null : parseDate(item.startDate) ?? null,
          endDate: item.endDate === undefined ? previous?.endDate ?? null : parseDate(item.endDate) ?? null,
          notes: toNullableString(item.notes) ?? previous?.notes ?? null,
        };
        if (previous) {
          if (await appendProntuarioHistory(tx, record, 'medicationProcedure', previous.id, medicationSnapshot(previous), medicationSnapshot(payload), actorUserId)) {
            await tx.prontuarioMedicationProcedure.update({ where: { id: previous.id }, data: payload });
          }
          touchedIds.add(previous.id);
        } else {
          const created = await tx.prontuarioMedicationProcedure.create({ data: { recordId: record.id, ...payload } });
          await appendProntuarioHistory(tx, record, 'medicationProcedure', created.id, null, medicationSnapshot(payload), actorUserId);
          touchedIds.add(created.id);
        }
      }
      for (const item of existing) {
        if (touchedIds.has(item.id) || item.endDate) continue;
        const ended = { ...item, endDate: new Date() };
        await appendProntuarioHistory(tx, record, 'medicationProcedure', item.id, medicationSnapshot(item), medicationSnapshot(ended), actorUserId);
        await tx.prontuarioMedicationProcedure.update({ where: { id: item.id }, data: { endDate: ended.endDate } });
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

  async getHistory(
    contractId: string,
    recordId: string,
    entityType: ProntuarioHistoryEntityType,
    options: { entityId?: string; version?: number; skip?: number } = {}
  ) {
    const record = await prisma.prontuarioRecord.findFirst({
      where: { id: recordId, contractId },
      select: { id: true, alunoId: true },
    });
    if (!record) throw new Error('Registro clínico não encontrado no contrato');
    return prisma.prontuarioHistoryEvent.findMany({
      where: {
        contractId, recordId, alunoId: record.alunoId, entityType,
        ...(options.entityId ? { entityId: options.entityId } : {}),
        ...(options.version ? { version: options.version } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      skip: options.skip ?? 0,
    });
  },

  async getRecord(contractId: string, recordId: string) {
    const record = await prisma.prontuarioRecord.findFirst({
      where: { id: recordId, contractId },
      include: includeRecord,
    });

    return record ? withSnapshotProfessorId(record) : null;
  },
};