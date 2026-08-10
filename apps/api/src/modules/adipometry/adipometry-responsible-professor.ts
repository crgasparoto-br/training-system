import { PrismaClient } from '@prisma/client';
import { AdipometryServiceError } from './adipometry.service.js';

const prisma = new PrismaClient();
const ADIPOMETRY_SCREEN_KEY = 'physicalAssessment.protocol';
const ADIPOMETRY_MANAGE_BLOCK_KEY = 'physicalAssessment.adpt.actions.manage';
const INACTIVE_PROFESSOR_STATUSES = new Set([
  'inactive',
  'inativo',
  'dismissed',
  'desligado',
  'terminated',
  'encerrado',
]);

interface AdipometryResponsibleAccessPermission {
  screenKey: string;
  blockKey: string;
  canView: boolean;
}

export interface AdipometryResponsibleProfessorCandidate {
  id: string;
  role: 'master' | 'professor';
  currentStatus: string | null;
  dismissalDate: Date | null;
  user: {
    isActive: boolean;
    profile: { name: string | null } | null;
  };
  collaboratorFunction: {
    isActive: boolean;
    accessPermissions: AdipometryResponsibleAccessPermission[];
  };
}

export interface AdipometryResponsibleProfessorSummary {
  id: string;
  name: string;
}

export function hasAdipometryResponsibleAccess(
  professor: AdipometryResponsibleProfessorCandidate
): boolean {
  if (professor.role === 'master') return true;

  const hasScreen = professor.collaboratorFunction.accessPermissions.some(
    (permission) =>
      permission.screenKey === ADIPOMETRY_SCREEN_KEY
      && permission.blockKey === ''
      && permission.canView
  );
  const hasManageBlock = professor.collaboratorFunction.accessPermissions.some(
    (permission) =>
      permission.screenKey === ADIPOMETRY_SCREEN_KEY
      && permission.blockKey === ADIPOMETRY_MANAGE_BLOCK_KEY
      && permission.canView
  );

  return hasScreen && hasManageBlock;
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

export function isEligibleAdipometryResponsibleProfessor(
  professor: AdipometryResponsibleProfessorCandidate,
  now = new Date()
): boolean {
  return isActiveAdipometryResponsibleProfessor(professor, now)
    && hasAdipometryResponsibleAccess(professor);
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
  role: true,
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
    select: {
      isActive: true,
      accessPermissions: {
        select: {
          screenKey: true,
          blockKey: true,
          canView: true,
        },
      },
    },
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
    .filter((professor) => isEligibleAdipometryResponsibleProfessor(professor))
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

  if (!professor || !isEligibleAdipometryResponsibleProfessor(professor)) {
    throw new AdipometryServiceError(
      'Professor responsável não disponível.',
      'ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE',
      404
    );
  }

  return serializeAdipometryResponsibleProfessor(professor);
}
