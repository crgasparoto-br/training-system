import type { PrismaClient } from '@prisma/client';
import type { CapacityPrescriptionSourceRef } from '@corrida/types';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';

export type CapacitySourceAccessSubject = Parameters<typeof canProfessorAccessBlock>[0];
export type CapacitySourcePermissionCache = Map<string, boolean>;
export type CapacitySourcePermissionClient = Pick<
  PrismaClient,
  | 'prontuarioPainCase'
  | 'prontuarioAnamnesisFollowUp'
  | 'prontuarioMedicationProcedure'
  | 'prontuarioDiscomfortSnapshot'
  | 'prontuarioActivityHistory'
>;

const assessmentSourceTypes = new Set<CapacityPrescriptionSourceRef['type']>([
  'physical_assessment',
  'anthropometry',
  'adipometry',
  'bioimpedance',
  'ultrasound',
  'ventilometry',
  'flexibility_assessment',
]);

export class CapacitySourcePermissionError extends Error {
  constructor() {
    super('Perfil sem permissão para acessar este recurso');
    this.name = 'CapacitySourcePermissionError';
  }
}

async function assertBlock(
  professor: CapacitySourceAccessSubject,
  blockKey: string,
  cache: CapacitySourcePermissionCache
) {
  let allowed = cache.get(blockKey);
  if (allowed === undefined) {
    allowed = await canProfessorAccessBlock(professor, blockKey);
    cache.set(blockKey, allowed);
  }
  if (!allowed) throw new CapacitySourcePermissionError();
}

async function assertProntuarioAlertPermission(input: {
  client: CapacitySourcePermissionClient;
  contractId: string;
  alunoId: string;
  sourceId: string;
  professor: CapacitySourceAccessSubject;
  cache: CapacitySourcePermissionCache;
  rejectUnknown?: boolean;
}) {
  const [painCase, followUp, medication, discomfort] = await Promise.all([
    input.client.prontuarioPainCase.findFirst({
      where: {
        id: input.sourceId,
        record: { contractId: input.contractId, alunoId: input.alunoId },
      },
      select: { id: true },
    }),
    input.client.prontuarioAnamnesisFollowUp.findFirst({
      where: {
        id: input.sourceId,
        record: { contractId: input.contractId, alunoId: input.alunoId },
      },
      select: { id: true },
    }),
    input.client.prontuarioMedicationProcedure.findFirst({
      where: {
        id: input.sourceId,
        record: { contractId: input.contractId, alunoId: input.alunoId },
      },
      select: { id: true },
    }),
    input.client.prontuarioDiscomfortSnapshot.findFirst({
      where: {
        id: input.sourceId,
        contractId: input.contractId,
        alunoId: input.alunoId,
      },
      select: { id: true },
    }),
  ]);

  if (painCase) {
    await assertBlock(input.professor, 'physicalAssessment.prnt.painCases', input.cache);
  } else if (followUp) {
    await assertBlock(
      input.professor,
      'physicalAssessment.prnt.anamnesisFollowUp',
      input.cache
    );
  } else if (medication) {
    await assertBlock(
      input.professor,
      'physicalAssessment.prnt.medicationsProcedures',
      input.cache
    );
  } else if (discomfort) {
    await assertBlock(input.professor, 'physicalAssessment.prnt.discomforts', input.cache);
  } else if (input.rejectUnknown) {
    throw new CapacitySourcePermissionError();
  }
}

async function assertProfessorNotePermission(input: {
  client: CapacitySourcePermissionClient;
  contractId: string;
  alunoId: string;
  sourceId: string;
  sourceOrigin?: string | null;
  professor: CapacitySourceAccessSubject;
  cache: CapacitySourcePermissionCache;
  rejectUnknown?: boolean;
}) {
  const activity = await input.client.prontuarioActivityHistory.findFirst({
    where: {
      id: input.sourceId,
      record: { contractId: input.contractId, alunoId: input.alunoId },
    },
    select: { id: true },
  });
  if (activity) {
    await assertBlock(
      input.professor,
      'physicalAssessment.prnt.activityHistory',
      input.cache
    );
  } else if (
    input.rejectUnknown &&
    input.sourceOrigin !== 'Anotação técnica do professor'
  ) {
    throw new CapacitySourcePermissionError();
  }
}

async function assertSourcePermission(input: {
  client: CapacitySourcePermissionClient;
  contractId: string;
  alunoId: string;
  source: CapacityPrescriptionSourceRef;
  professor: CapacitySourceAccessSubject;
  cache: CapacitySourcePermissionCache;
  rejectUnknownProntuarioAlert?: boolean;
  rejectUnknownProfessorNote?: boolean;
}) {
  if (assessmentSourceTypes.has(input.source.type)) {
    await assertBlock(input.professor, 'students.details.assessments', input.cache);
    return;
  }

  if (input.source.type === 'student_preference') {
    await assertBlock(input.professor, 'students.details.profile', input.cache);
    return;
  }

  if (input.source.type === 'prontuario_goal') {
    await assertBlock(input.professor, 'physicalAssessment.prnt.goals', input.cache);
    return;
  }

  if (input.source.type === 'prontuario_alert') {
    await assertProntuarioAlertPermission({
      ...input,
      sourceId: input.source.id,
      rejectUnknown: input.rejectUnknownProntuarioAlert,
    });
    return;
  }

  if (input.source.type === 'professor_note') {
    await assertProfessorNotePermission({
      ...input,
      sourceId: input.source.id,
      sourceOrigin: input.source.origin,
      rejectUnknown: input.rejectUnknownProfessorNote,
    });
  }
}

export async function canProfessorReadCapacitySource(input: {
  client: CapacitySourcePermissionClient;
  professor: CapacitySourceAccessSubject;
  contractId: string;
  alunoId: string;
  source: CapacityPrescriptionSourceRef;
  cache?: CapacitySourcePermissionCache;
}) {
  try {
    await assertSourcePermission({
      ...input,
      cache: input.cache ?? new Map(),
      rejectUnknownProntuarioAlert: true,
      rejectUnknownProfessorNote: true,
    });
    return true;
  } catch (error) {
    if (error instanceof CapacitySourcePermissionError) return false;
    throw error;
  }
}

export async function assertCapacitySourcePermissions(input: {
  client: CapacitySourcePermissionClient;
  professor: CapacitySourceAccessSubject;
  contractId: string;
  alunoId: string;
  sourceRefs: CapacityPrescriptionSourceRef[];
  linkedGoalIds: string[];
}) {
  const cache: CapacitySourcePermissionCache = new Map();
  await assertBlock(input.professor, 'plans.capacityPrescriptions.manage', cache);

  for (const source of input.sourceRefs) {
    if (!source || typeof source !== 'object' || typeof source.id !== 'string') continue;
    await assertSourcePermission({ ...input, source, cache });
  }

  if (input.linkedGoalIds.length > 0) {
    await assertBlock(input.professor, 'physicalAssessment.prnt.goals', cache);
  }
}
