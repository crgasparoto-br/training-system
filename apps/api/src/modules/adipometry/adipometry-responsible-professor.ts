import { PrismaClient } from '@prisma/client';
import { AdipometryServiceError } from './adipometry.service.js';

const prisma = new PrismaClient();
const INACTIVE_PROFESSOR_STATUSES = new Set([
  'inactive',
  'inativo',
  'dismissed',
  'desligado',
  'terminated',
  'encerrado',
]);

export interface AdipometryResponsibleProfessorCandidate {
  id: string;
  currentStatus: string | null;
  dismissalDate: Date | null;
  user: {
    isActive: boolean;
    profile: { name: string | null } | null;
  };
  collaboratorFunction: {
    isActive: boolean;
  };
}

export interface AdipometryResponsibleProfessorSummary {
  id: string;
  name: string;
}

export function isActiveAdipometryResponsibleProfessor(
  professor: AdipometryResponsibleProfessorCandidate,
  now = new Date()
): boolean {
  const normalizedStatus = professor.currentStatus?.trim().toLowerCase() ?? 'active';
  const dismissalIsEffective = Boolean(
    professor.dismissalDate && professor.dismissalDate.getTime() <= now.getTime()
  );

  return professor.user.isActive
    && professor.collaboratorFunction.isActive
    && !INACTIVE_PROFESSOR_STATUSES.has(normalizedStatus)
    && !dismissalIsEffective;
}

export function serializeAdipometryResponsibleProfessor(
  professor: AdipometryResponsibleProfessorCandidate
): AdipometryResponsibleProfessorSummary {
  return {
    id: professor.id,
    name: professor.user.profile?.name?.trim() || 'Professor sem nome cadastrado',
  };
}

const professorSelect = {
  id: true,
  currentStatus: true,
  dismissalDate: true,
  user: {
    select: {
      isActive: true,
      profile: {
        select: { name: true },
      },
    },
  },
  collaboratorFunction: {
    select: { isActive: true },
  },
} as const;

export async function listAdipometryResponsibleProfessors(
  contractId: string
): Promise<AdipometryResponsibleProfessorSummary[]> {
  const professors = await prisma.professor.findMany({
    where: { contractId },
    select: professorSelect,
    orderBy: { id: 'asc' },
  });

  return professors
    .filter((professor) => isActiveAdipometryResponsibleProfessor(professor))
    .map(serializeAdipometryResponsibleProfessor)
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR') || left.id.localeCompare(right.id));
}

export async function requireAdipometryResponsibleProfessor(
  contractId: string,
  professorId: string
): Promise<AdipometryResponsibleProfessorSummary> {
  const professor = await prisma.professor.findFirst({
    where: { id: professorId, contractId },
    select: professorSelect,
  });

  if (!professor || !isActiveAdipometryResponsibleProfessor(professor)) {
    throw new AdipometryServiceError(
      'Professor responsável não disponível.',
      'ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE',
      404
    );
  }

  return serializeAdipometryResponsibleProfessor(professor);
}
