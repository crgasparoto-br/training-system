import { PrismaClient } from '@prisma/client';
import { preRegistrationParqService } from '../pre-registration-public/pre-registration-parq.service.js';

export interface ProntuarioOverviewReadPermissions {
  goals: boolean;
  anamnesisFollowUp: boolean;
  activityHistory: boolean;
  medicationsProcedures: boolean;
  painCases: boolean;
  discomforts: boolean;
}

type ProntuarioOverviewReadClient = Pick<PrismaClient, 'aluno' | 'prontuarioRecord'>;
type ParqOverviewLoader = typeof preRegistrationParqService.overview;

export const prontuarioOverviewBoundaryPrisma = new PrismaClient();

function buildRecordInclude(permissions: ProntuarioOverviewReadPermissions) {
  const include: Record<string, unknown> = {};

  if (permissions.goals) {
    include.goals = { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] };
  }
  if (permissions.anamnesisFollowUp) {
    include.anamnesisFollowUps = { orderBy: { createdAt: 'asc' } };
  }
  if (permissions.activityHistory) {
    include.activityHistory = { orderBy: { createdAt: 'asc' } };
  }
  if (permissions.medicationsProcedures) {
    include.medicationsProcedures = { orderBy: { createdAt: 'asc' } };
  }
  if (permissions.painCases) {
    include.painCases = {
      include: { followUps: { orderBy: { followUpAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    };
  }
  if (permissions.discomforts) {
    include.discomfortSnapshots = {
      include: { entries: true },
      orderBy: { snapshotAt: 'desc' },
    };
  }

  return include;
}

function normalizeRecord(
  record: Record<string, any>,
  permissions: ProntuarioOverviewReadPermissions
) {
  return {
    ...record,
    goals: permissions.goals ? record.goals ?? [] : [],
    anamnesisFollowUps: permissions.anamnesisFollowUp
      ? record.anamnesisFollowUps ?? []
      : [],
    activityHistory: permissions.activityHistory ? record.activityHistory ?? [] : [],
    medicationsProcedures: permissions.medicationsProcedures
      ? record.medicationsProcedures ?? []
      : [],
    painCases: permissions.painCases ? record.painCases ?? [] : [],
    discomfortSnapshots: permissions.discomforts
      ? (record.discomfortSnapshots ?? []).map((snapshot: Record<string, any>) => ({
          ...snapshot,
          professorId: snapshot.professorId ?? record.professorId ?? null,
        }))
      : [],
  };
}

export function createProntuarioOverviewReadService(
  client: ProntuarioOverviewReadClient = prontuarioOverviewBoundaryPrisma,
  loadParqOverview: ParqOverviewLoader = preRegistrationParqService.overview.bind(
    preRegistrationParqService
  )
) {
  async function overview(
    contractId: string,
    alunoId: string,
    permissions: ProntuarioOverviewReadPermissions
  ) {
    const aluno = await client.aluno.findFirst({
      where: { id: alunoId, contractId },
      select: { id: true },
    });
    if (!aluno) throw new Error('Aluno não encontrado no contrato');

    const [records, parq] = await Promise.all([
      client.prontuarioRecord.findMany({
        where: { contractId, alunoId },
        include: buildRecordInclude(permissions) as any,
        orderBy: [{ recordDate: 'desc' }, { createdAt: 'desc' }],
      }),
      loadParqOverview(contractId, alunoId),
    ]);

    const normalizedRecords = (records as Array<Record<string, any>>).map((record) =>
      normalizeRecord(record, permissions)
    );

    return {
      records: normalizedRecords,
      currentRecord: normalizedRecords[0] ?? null,
      latestParqSubmission: parq.latestSubmission,
      parqSubmissions: parq.submissions,
      parqState: parq.state,
      parqLegacy: parq.legacy,
    };
  }

  return { overview };
}

export const prontuarioOverviewReadService = createProntuarioOverviewReadService();
