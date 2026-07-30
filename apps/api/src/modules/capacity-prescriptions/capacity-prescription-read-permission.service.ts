import type { CapacityPrescriptionSourceRef } from '@corrida/types';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import {
  canProfessorReadCapacitySource,
  type CapacitySourceAccessSubject,
  type CapacitySourcePermissionCache,
  type CapacitySourcePermissionClient,
} from './capacity-prescription-source-permission.service.js';

const sourceDerivedAlertCodes = new Set([
  'PRNT_CONDITION',
  'STUDENT_PREFERENCE',
  'ASSESSMENT_CONTEXT',
]);

function sourceRefFromRow(source: Record<string, any>): CapacityPrescriptionSourceRef | null {
  const type = source.sourceType ?? source.type;
  const id = source.sourceId ?? source.id;
  const label = source.label;
  if (typeof type !== 'string' || typeof id !== 'string' || typeof label !== 'string') {
    return null;
  }

  return {
    type: type as CapacityPrescriptionSourceRef['type'],
    id,
    label,
    assessedAt: source.assessedAt ?? null,
    origin: source.origin ?? null,
    version: source.version ?? source.sourceVersion ?? null,
    responsibleProfessorId: source.responsibleProfessorId ?? null,
  };
}

async function canReadBlock(
  professor: CapacitySourceAccessSubject,
  blockKey: string,
  cache: CapacitySourcePermissionCache
) {
  let allowed = cache.get(blockKey);
  if (allowed === undefined) {
    allowed = await canProfessorAccessBlock(professor, blockKey);
    cache.set(blockKey, allowed);
  }
  return allowed;
}

async function filterVersion(input: {
  client: CapacitySourcePermissionClient;
  professor: CapacitySourceAccessSubject;
  contractId: string;
  alunoId: string;
  version: Record<string, any>;
  cache: CapacitySourcePermissionCache;
}) {
  const sourceField = Array.isArray(input.version.sourceRefs)
    ? 'sourceRefs'
    : Array.isArray(input.version.sources)
      ? 'sources'
      : null;
  const sources = sourceField ? (input.version[sourceField] as Record<string, any>[]) : [];
  const visibleSources: Record<string, any>[] = [];
  const visibleSourceIds = new Set<string>();

  for (const source of sources) {
    const ref = sourceRefFromRow(source);
    if (!ref) continue;
    const allowed = await canProfessorReadCapacitySource({
      client: input.client,
      professor: input.professor,
      contractId: input.contractId,
      alunoId: input.alunoId,
      source: ref,
      cache: input.cache,
    });
    if (!allowed) continue;
    visibleSources.push(source);
    visibleSourceIds.add(ref.id);
  }

  const goalsAllowed = await canReadBlock(
    input.professor,
    'physicalAssessment.prnt.goals',
    input.cache
  );
  const alerts = Array.isArray(input.version.alerts)
    ? input.version.alerts.filter((alert: Record<string, any>) => {
        const sourceRefId = typeof alert.sourceRefId === 'string' ? alert.sourceRefId : null;
        if (sourceRefId) return visibleSourceIds.has(sourceRefId);
        return !sourceDerivedAlertCodes.has(String(alert.code ?? ''));
      })
    : input.version.alerts;

  return {
    ...input.version,
    ...(sourceField ? { [sourceField]: visibleSources } : {}),
    ...(Array.isArray(input.version.goals)
      ? { goals: goalsAllowed ? input.version.goals : [] }
      : {}),
    ...(Array.isArray(input.version.linkedProntuarioGoalIds)
      ? {
          linkedProntuarioGoalIds: goalsAllowed
            ? input.version.linkedProntuarioGoalIds
            : [],
        }
      : {}),
    ...(Array.isArray(input.version.alerts) ? { alerts } : {}),
  };
}

async function filterNode(input: {
  client: CapacitySourcePermissionClient;
  professor: CapacitySourceAccessSubject;
  contractId: string;
  value: unknown;
  cache: CapacitySourcePermissionCache;
  inheritedAlunoId?: string;
}): Promise<unknown> {
  if (Array.isArray(input.value)) {
    return Promise.all(
      input.value.map((item) => filterNode({ ...input, value: item }))
    );
  }
  if (!input.value || typeof input.value !== 'object') return input.value;

  const item = input.value as Record<string, any>;
  const alunoId =
    typeof item.alunoId === 'string' ? item.alunoId : input.inheritedAlunoId ?? '';
  let filtered: Record<string, any> = item;

  if (
    Array.isArray(item.sources) ||
    Array.isArray(item.sourceRefs) ||
    Array.isArray(item.goals) ||
    Array.isArray(item.linkedProntuarioGoalIds) ||
    Array.isArray(item.alerts)
  ) {
    filtered = await filterVersion({
      client: input.client,
      professor: input.professor,
      contractId: input.contractId,
      alunoId,
      version: item,
      cache: input.cache,
    });
  }

  if (filtered.latestVersion) {
    filtered = {
      ...filtered,
      latestVersion: await filterNode({
        ...input,
        value: filtered.latestVersion,
        inheritedAlunoId: alunoId,
      }),
    };
  }

  if (Array.isArray(filtered.versions)) {
    filtered = {
      ...filtered,
      versions: await filterNode({
        ...input,
        value: filtered.versions,
        inheritedAlunoId: alunoId,
      }),
    };
  }

  return filtered;
}

export async function filterCapacityPrescriptionReadData(input: {
  client: CapacitySourcePermissionClient;
  professor: CapacitySourceAccessSubject;
  contractId: string;
  value: unknown;
}) {
  return filterNode({
    ...input,
    cache: new Map(),
  });
}
