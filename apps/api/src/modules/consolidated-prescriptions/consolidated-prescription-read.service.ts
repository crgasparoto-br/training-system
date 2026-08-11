import { PrismaClient } from '@prisma/client';
import {
  CAPACITY_PRESCRIPTION_STATUSES,
  PHYSICAL_CAPACITY_TYPES,
  type CapacityPrescriptionSourceRef,
  type CapacityPrescriptionStatus,
  type ConsolidatedPrescriptionCapacityCandidate,
  type ConsolidatedPrescriptionWorkspaceContext,
  type PhysicalCapacityType,
} from '@corrida/types';
import type { ConsolidatedPrescriptionContext } from './consolidated-prescription.service.js';

const prisma = new PrismaClient();

const capacityLabels: Record<PhysicalCapacityType, string> = {
  resisted: 'Resistido',
  flexibility: 'Flexibilidade',
  cyclic: 'Cíclico',
  balance: 'Equilíbrio',
};

function asCapacityStatus(value: string | null | undefined): CapacityPrescriptionStatus | null {
  if (!value) return null;
  return CAPACITY_PRESCRIPTION_STATUSES.includes(value as CapacityPrescriptionStatus)
    ? (value as CapacityPrescriptionStatus)
    : null;
}

function professorName(professor: {
  user: { profile: { name: string } | null };
}) {
  return professor.user.profile?.name ?? null;
}

export function createConsolidatedPrescriptionReadService(client: PrismaClient = prisma) {
  return {
    async getWorkspaceContext(
      context: ConsolidatedPrescriptionContext,
      responsibleProfessorId: string | null
    ): Promise<Omit<ConsolidatedPrescriptionWorkspaceContext, 'capacityCandidates' | 'capacityCandidatesError'> | null> {
      const aluno = await client.aluno.findFirst({
        where: { id: context.alunoId, contractId: context.contractId },
        select: {
          id: true,
          professorId: true,
          user: { select: { profile: { select: { name: true } } } },
        },
      });
      if (!aluno) return null;

      const professorIds = Array.from(
        new Set(
          [context.actorProfessorId, aluno.professorId, responsibleProfessorId].filter(Boolean) as string[]
        )
      );
      const professors = await client.professor.findMany({
        where: { id: { in: professorIds }, contractId: context.contractId },
        select: {
          id: true,
          user: { select: { profile: { select: { name: true } } } },
        },
      });
      const byId = new Map(professors.map((professor) => [professor.id, professor]));
      const toPerson = (id: string | null | undefined) => {
        if (!id) return null;
        const professor = byId.get(id);
        return professor ? { id: professor.id, name: professorName(professor) } : { id, name: null };
      };

      const actor = toPerson(context.actorProfessorId);
      if (!actor) return null;
      const assigned = toPerson(aluno.professorId);
      const responsible = toPerson(responsibleProfessorId) ?? assigned;

      return {
        aluno: { id: aluno.id, name: aluno.user?.profile?.name ?? null },
        actorProfessor: actor,
        assignedProfessor: assigned,
        responsibleProfessor: responsible,
      };
    },

    async listCapacityCandidates(
      context: ConsolidatedPrescriptionContext
    ): Promise<ConsolidatedPrescriptionCapacityCandidate[]> {
      const roots = await client.capacityPrescription.findMany({
        where: { contractId: context.contractId, alunoId: context.alunoId },
        select: {
          id: true,
          capacity: true,
          status: true,
          currentVersion: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
      const rootByCapacity = new Map<PhysicalCapacityType, (typeof roots)[number]>();
      for (const root of roots) {
        const capacity = root.capacity as PhysicalCapacityType;
        if (PHYSICAL_CAPACITY_TYPES.includes(capacity) && !rootByCapacity.has(capacity)) {
          rootByCapacity.set(capacity, root);
        }
      }

      const candidates: ConsolidatedPrescriptionCapacityCandidate[] = [];
      for (const capacity of PHYSICAL_CAPACITY_TYPES) {
        const root = rootByCapacity.get(capacity);
        if (!root) {
          candidates.push({
            capacity,
            prescriptionId: null,
            prescriptionStatus: null,
            capacityPrescriptionVersionId: null,
            version: null,
            versionStatus: null,
            eligible: false,
            reasonCode: 'missing_prescription',
            reason: `Nenhuma prescrição de ${capacityLabels[capacity]} existe para este aluno no contrato atual.`,
            professorSummary: null,
            sourceRefs: [],
          });
          continue;
        }

        const version = await client.capacityPrescriptionVersion.findFirst({
          where: {
            prescriptionId: root.id,
            contractId: context.contractId,
            alunoId: context.alunoId,
            version: root.currentVersion,
          },
          include: { sources: { orderBy: { createdAt: 'asc' } } },
        });
        const prescriptionStatus = asCapacityStatus(root.status);
        if (!version) {
          candidates.push({
            capacity,
            prescriptionId: root.id,
            prescriptionStatus,
            capacityPrescriptionVersionId: null,
            version: root.currentVersion,
            versionStatus: null,
            eligible: false,
            reasonCode: 'missing_current_version',
            reason: `A prescrição de ${capacityLabels[capacity]} aponta para a versão ${root.currentVersion}, mas essa versão não está disponível para a montagem.`,
            professorSummary: null,
            sourceRefs: [],
          });
          continue;
        }

        const versionStatus = asCapacityStatus(version.status);
        const sourceRefs: CapacityPrescriptionSourceRef[] = version.sources.map((source) => ({
          type: source.sourceType as CapacityPrescriptionSourceRef['type'],
          id: source.sourceId,
          label: source.label,
          assessedAt: source.assessedAt?.toISOString() ?? null,
          origin: source.origin,
          version: source.sourceVersion,
          responsibleProfessorId: source.responsibleProfessorId,
        }));

        if (prescriptionStatus !== 'active') {
          candidates.push({
            capacity,
            prescriptionId: root.id,
            prescriptionStatus,
            capacityPrescriptionVersionId: version.id,
            version: version.version,
            versionStatus,
            eligible: false,
            reasonCode: 'prescription_not_active',
            reason: `A prescrição de ${capacityLabels[capacity]} está com status ${root.status}; a montagem aceita somente prescrições ativas.`,
            professorSummary: version.professorSummary,
            sourceRefs,
          });
          continue;
        }

        if (versionStatus !== 'active') {
          candidates.push({
            capacity,
            prescriptionId: root.id,
            prescriptionStatus,
            capacityPrescriptionVersionId: version.id,
            version: version.version,
            versionStatus,
            eligible: false,
            reasonCode: 'version_not_active',
            reason: `A versão ${version.version} de ${capacityLabels[capacity]} está com status ${version.status}; a montagem aceita somente versões ativas.`,
            professorSummary: version.professorSummary,
            sourceRefs,
          });
          continue;
        }

        candidates.push({
          capacity,
          prescriptionId: root.id,
          prescriptionStatus,
          capacityPrescriptionVersionId: version.id,
          version: version.version,
          versionStatus,
          eligible: true,
          reasonCode: 'eligible',
          reason: null,
          professorSummary: version.professorSummary,
          sourceRefs,
        });
      }
      return candidates;
    },
  };
}

export const consolidatedPrescriptionReadService = createConsolidatedPrescriptionReadService();
