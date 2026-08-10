import type { AccessDataScope, ProfessorSummary } from '@corrida/types';

export function canCreateCollaborator(scope?: AccessDataScope | null) {
  return scope === 'contract';
}

export function canWriteCollaborator(
  actorProfessorId: string | undefined,
  collaborator: ProfessorSummary,
  scope?: AccessDataScope | null
) {
  if (!scope) return false;
  if (scope === 'contract') return true;
  if (!actorProfessorId) return false;
  if (collaborator.id === actorProfessorId) return true;
  return scope === 'managed' && collaborator.responsibleManager?.id === actorProfessorId;
}

export function isSelfCollaborator(actorProfessorId: string | undefined, collaborator: ProfessorSummary) {
  return Boolean(actorProfessorId && collaborator.id === actorProfessorId);
}
