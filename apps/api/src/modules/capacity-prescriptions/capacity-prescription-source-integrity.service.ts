import type { PrismaClient } from '@prisma/client';
import type { CapacityPrescriptionSourceRef } from '@corrida/types';

const assessmentSourceTypes = new Set<CapacityPrescriptionSourceRef['type']>([
  'physical_assessment',
  'adipometry',
  'bioimpedance',
  'ultrasound',
  'ventilometry',
  'flexibility_assessment',
]);

export class CapacitySourceIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapacitySourceIntegrityError';
  }
}

function assertSourceShape(source: unknown): asserts source is CapacityPrescriptionSourceRef {
  if (
    !source ||
    typeof source !== 'object' ||
    !('type' in source) ||
    typeof source.type !== 'string' ||
    !('id' in source) ||
    typeof source.id !== 'string' ||
    !source.id.trim()
  ) {
    throw new CapacitySourceIntegrityError('Fonte técnica inválida. Informe tipo e identificador válidos.');
  }
}

async function prontuarioAlertExists(
  client: PrismaClient,
  contractId: string,
  alunoId: string,
  sourceId: string
) {
  const [painCase, followUp, medication, discomfort] = await Promise.all([
    client.prontuarioPainCase.findFirst({
      where: { id: sourceId, record: { contractId, alunoId } },
      select: { id: true },
    }),
    client.prontuarioAnamnesisFollowUp.findFirst({
      where: { id: sourceId, record: { contractId, alunoId } },
      select: { id: true },
    }),
    client.prontuarioMedicationProcedure.findFirst({
      where: { id: sourceId, record: { contractId, alunoId } },
      select: { id: true },
    }),
    client.prontuarioDiscomfortSnapshot.findFirst({
      where: { id: sourceId, contractId, alunoId },
      select: { id: true },
    }),
  ]);
  return Boolean(painCase || followUp || medication || discomfort);
}

async function sourceExists(
  client: PrismaClient,
  contractId: string,
  alunoId: string,
  source: CapacityPrescriptionSourceRef
) {
  if (source.type === 'prontuario_goal') {
    return Boolean(
      await client.prontuarioGoal.findFirst({
        where: { id: source.id, record: { contractId, alunoId } },
        select: { id: true },
      })
    );
  }

  if (source.type === 'prontuario_alert') {
    return prontuarioAlertExists(client, contractId, alunoId, source.id);
  }

  if (source.type === 'student_preference') {
    return Boolean(
      await client.studentProfile.findFirst({
        where: { id: source.id, contractId, alunoId },
        select: { id: true },
      })
    );
  }

  if (source.type === 'anthropometry') {
    return Boolean(
      await client.anthropometryAssessment.findFirst({
        where: { id: source.id, contractId, alunoId },
        select: { id: true },
      })
    );
  }

  if (assessmentSourceTypes.has(source.type)) {
    return Boolean(
      await client.studentAssessmentRecord.findFirst({
        where: { id: source.id, contractId, alunoId },
        select: { id: true },
      })
    );
  }

  if (source.type === 'professor_note') {
    if (source.origin === 'Anotação técnica do professor') return true;
    return Boolean(
      await client.prontuarioActivityHistory.findFirst({
        where: { id: source.id, record: { contractId, alunoId } },
        select: { id: true },
      })
    );
  }

  // Tipos desconhecidos permanecem sob responsabilidade do schema Zod da rota final.
  return true;
}

export async function assertCapacitySourceIntegrity(input: {
  client: PrismaClient;
  contractId: string;
  alunoId: string;
  sourceRefs: unknown[];
}) {
  for (const candidate of input.sourceRefs) {
    assertSourceShape(candidate);
    if (!(await sourceExists(input.client, input.contractId, input.alunoId, candidate))) {
      throw new CapacitySourceIntegrityError(
        `Fonte técnica ${candidate.type} não encontrada para este aluno e contrato.`
      );
    }
  }
}
