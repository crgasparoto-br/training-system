import { prismaRuntimeClient } from '../../common/prisma-runtime-client.js';
import { PRNT_HISTORY_BLOCKS, type ProntuarioHistoryEntityType } from '../prontuario/prontuario-history.service.js';

/**
 * A timeline is a read projection. Clinical snapshots stay in their canonical
 * tables; only immutable IDs, event dates and safe provenance leave this module.
 */
export type TimelineClinicalAccess = {
  prnt: Partial<Record<ProntuarioHistoryEntityType, boolean>>;
  intake: boolean;
  parq: boolean;
  anthropometry: boolean;
  adipometry: boolean;
};

export type TimelineDomainAccess = {
  profile: boolean;
  health: boolean;
  assessments: boolean;
  financial: boolean;
  integrations: boolean;
  training: boolean;
  clinical: TimelineClinicalAccess;
};

export const NO_TIMELINE_DOMAIN_ACCESS: TimelineDomainAccess = {
  profile: false,
  health: false,
  assessments: false,
  financial: false,
  integrations: false,
  training: false,
  clinical: { prnt: {}, intake: false, parq: false, anthropometry: false, adipometry: false },
};

export type TimelineEventKind = 'legacy' | 'clinical' | 'training';
export type ClinicalTimelineCursor = { at: string; kind: TimelineEventKind; id: string };
export type ClinicalTimelineEvent = {
  id: string;
  type: string;
  title: string;
  occurredAt: Date;
  sourceType: string;
  sourceId: string;
  contractId: string;
  actorUserId: string | null;
  source: { type: string; reference: string; recordedByUserId: string | null };
  metadata: Record<string, string | number | null>;
};

const prisma = prismaRuntimeClient;
const PRNT_LABELS: Record<ProntuarioHistoryEntityType, string> = {
  record: 'Registro do prontuário',
  goal: 'Objetivo',
  anamnesisFollowUp: 'Acompanhamento da anamnese',
  activityHistory: 'Histórico de atividades',
  medicationProcedure: 'Medicação ou procedimento',
  painCase: 'Caso de dor',
  painFollowUp: 'Acompanhamento de dor',
  discomfortSnapshot: 'Registro de desconfortos',
};

function provenance(
  sourceType: string,
  sourceId: string,
  contractId: string,
  actorUserId: string | null,
) {
  return {
    sourceType,
    sourceId,
    contractId,
    actorUserId,
    source: { type: 'professional', reference: sourceId, recordedByUserId: actorUserId },
  };
}

/**
 * Apply the global cursor at each canonical source BEFORE its own take.
 * At equal instants the three groups are legacy, clinical, training; within
 * a group the projected stable IDs are ordered descending.
 */
function sourceTimeWhere(
  prefix: string,
  field: 'createdAt' | 'completedAt' | 'submittedAt',
  cursor?: ClinicalTimelineCursor,
): Record<string, unknown> {
  if (!cursor) return {};
  const instant = new Date(cursor.at);
  if (cursor.kind === 'training') return { [field]: { lt: instant } };
  if (cursor.kind === 'legacy') return { [field]: { lte: instant } };
  if (cursor.id.startsWith(prefix)) {
    return { OR: [
      { [field]: { lt: instant } },
      { [field]: instant, id: { lt: cursor.id.slice(prefix.length) } },
    ] };
  }
  return { [field]: prefix.localeCompare(cursor.id) < 0 ? { lte: instant } : { lt: instant } };
}

export async function readClinicalTimeline(
  alunoId: string,
  contractId: string,
  access: TimelineClinicalAccess,
  limit: number,
  cursor?: ClinicalTimelineCursor,
): Promise<{ items: ClinicalTimelineEvent[]; unavailableDomains: string[] }> {
  const tasks: Array<{ domain: string; execute: () => Promise<ClinicalTimelineEvent[]> }> = [];
  const permittedPrntTypes = (Object.keys(PRNT_HISTORY_BLOCKS) as ProntuarioHistoryEntityType[])
    .filter((entityType) => access.prnt[entityType]);

  if (permittedPrntTypes.length) {
    tasks.push({ domain: 'PRNT', execute: async () => {
      const rows = await prisma.prontuarioHistoryEvent.findMany({
        where: { alunoId, contractId, entityType: { in: permittedPrntTypes },
          ...sourceTimeWhere('clinical-prnt-', 'createdAt', cursor) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: { id: true, recordId: true, contractId: true, entityType: true,
          entityId: true, version: true, action: true, actorUserId: true, source: true, createdAt: true },
      });
      return rows.map((row) => {
        const entityType = row.entityType as ProntuarioHistoryEntityType;
        const action = row.action === 'closed' ? 'encerrado'
          : row.action === 'baseline' ? 'importado' : row.action === 'created' ? 'registrado' : 'atualizado';
        return {
          id: `clinical-prnt-${row.id}`,
          type: `prnt_${entityType}_${row.action}`,
          title: `${PRNT_LABELS[entityType]} ${action}`,
          occurredAt: row.createdAt,
          ...provenance('prontuario-history-event', row.id, row.contractId, row.actorUserId),
          metadata: { recordId: row.recordId, entityType, entityId: row.entityId,
            version: row.version, action: row.action, origin: row.source },
        };
      });
    } });
  }

  if (access.intake) {
    tasks.push({ domain: 'Anamnese', execute: async () => {
      const rows = await prisma.studentHealthIntakeRevision.findMany({
        where: { alunoId, contractId, ...sourceTimeWhere('clinical-intake-', 'createdAt', cursor) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        select: { id: true, contractId: true, intakeId: true, revision: true, sourceVersion: true,
          actorUserId: true, createdAt: true },
      });
      return rows.map((row) => ({
        id: `clinical-intake-${row.id}`,
        type: 'prnt_intake_revision',
        title: row.revision === 1 ? 'Anamnese inicial registrada' : 'Anamnese inicial revisada',
        occurredAt: row.createdAt,
        ...provenance('student-health-intake-revision', row.id, row.contractId, row.actorUserId),
        metadata: { intakeId: row.intakeId, revision: row.revision, sourceVersion: row.sourceVersion },
      }));
    } });
  }

  if (access.parq) {
    tasks.push({ domain: 'PAR-Q', execute: async () => {
      const rows = await prisma.studentParqSubmission.findMany({
        where: { alunoId, contractId, ...sourceTimeWhere('clinical-parq-', 'submittedAt', cursor) },
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        select: { id: true, contractId: true, submittedByUserId: true,
          submittedAt: true, catalogVersion: true },
      });
      return rows.map((row) => ({
        id: `clinical-parq-${row.id}`,
        type: 'prnt_parq_submitted',
        title: 'Questionário PAR-Q enviado',
        occurredAt: row.submittedAt,
        ...provenance('student-parq-submission', row.id, row.contractId, row.submittedByUserId),
        metadata: { catalogVersion: row.catalogVersion },
      }));
    } });
  }

  if (access.anthropometry) {
    tasks.push({ domain: 'Antropometria', execute: async () => {
      const rows = await prisma.studentLifecycleEvent.findMany({
        where: { alunoId, contractId,
          metadata: { path: ['domain'], equals: 'anthropometry' },
          ...sourceTimeWhere('clinical-anthropometry-', 'createdAt', cursor) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        select: { id: true, contractId: true, actorUserId: true, createdAt: true, metadata: true },
      });
      return rows.flatMap((row) => {
        const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? row.metadata as Record<string, unknown> : null;
        const action = meta?.action;
        const assessmentId = meta?.assessmentId;
        const correctionId = meta?.correctionId;
        if ((action !== 'completed' && action !== 'corrected') || typeof assessmentId !== 'string'
          || (action === 'corrected' && typeof correctionId !== 'string')) return [];
        const sourceType = action === 'corrected' ? 'anthropometry-correction' : 'anthropometry-assessment';
        const sourceId = action === 'corrected' ? correctionId as string : assessmentId;
        return [{
          id: `clinical-anthropometry-${row.id}`,
          type: action === 'corrected' ? 'anthropometry_corrected' : 'anthropometry_completed',
          title: action === 'corrected' ? 'Antropometria corrigida' : 'Antropometria concluída',
          occurredAt: row.createdAt,
          ...provenance(sourceType, sourceId, row.contractId, row.actorUserId),
          metadata: { assessmentId, assessmentCode:
            typeof meta?.assessmentCode === 'string' ? meta.assessmentCode : null,
            correctionId: typeof correctionId === 'string' ? correctionId : null },
        }];
      });
    } });
  }

  if (access.adipometry) {
    tasks.push({ domain: 'Adipometria', execute: async () => {
      const rows = await prisma.adipometryAssessment.findMany({
        where: { alunoId, contractId, status: 'COMPLETED', revisionStatus: 'FINALIZED',
          completedAt: { not: null }, ...sourceTimeWhere('clinical-adipometry-', 'completedAt', cursor) },
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        select: { id: true, contractId: true, code: true, rootAssessmentId: true,
          revisionNumber: true, correctsAssessmentId: true,
          correctionAuthorUserId: true, completedAt: true },
      });
      return rows.flatMap((row) => row.completedAt ? [{
        id: `clinical-adipometry-${row.id}`,
        type: row.revisionNumber > 1 ? 'adipometry_corrected' : 'adipometry_completed',
        title: row.revisionNumber > 1 ? 'Adipometria corrigida' : 'Adipometria concluída',
        occurredAt: row.completedAt,
        ...provenance('adipometry-assessment', row.id, row.contractId, row.correctionAuthorUserId),
        metadata: { assessmentId: row.id, assessmentCode: row.code,
          rootAssessmentId: row.rootAssessmentId, revisionNumber: row.revisionNumber,
          correctsAssessmentId: row.correctsAssessmentId },
      }] : []);
    } });
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.execute()));
  const unavailableDomains: string[] = [];
  const all = new Map<string, ClinicalTimelineEvent>();
  settled.forEach((result, index) => {
    if (result.status === 'rejected') {
      unavailableDomains.push(tasks[index].domain);
      // Keep errors local and do not expose database details or clinical payloads.
      console.error('Falha localizada na projeção clínica da timeline', { domain: tasks[index].domain });
      return;
    }
    for (const event of result.value) {
      const identity = `${event.sourceType}:${event.sourceId}:${event.type}`;
      if (!all.has(identity)) all.set(identity, event);
    }
  });
  return { items: [...all.values()], unavailableDomains };
}
