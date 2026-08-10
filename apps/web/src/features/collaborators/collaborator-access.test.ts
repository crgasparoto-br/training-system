import { describe, expect, it } from 'vitest';
import type { ProfessorSummary } from '@corrida/types';
import { canCreateCollaborator, canWriteCollaborator } from './collaborator-access';

function collaborator(id: string, responsibleManagerId?: string) {
  return {
    id,
    responsibleManager: responsibleManagerId ? { id: responsibleManagerId } : null,
  } as ProfessorSummary;
}

describe('collaborator access', () => {
  it('limita criação ao escopo do contrato', () => {
    expect(canCreateCollaborator('contract')).toBe(true);
    expect(canCreateCollaborator('managed')).toBe(false);
    expect(canCreateCollaborator('self')).toBe(false);
  });

  it('aplica o escopo de escrita ao registro individual', () => {
    const own = collaborator('actor');
    const managed = collaborator('managed', 'actor');
    const unrelated = collaborator('unrelated', 'other-manager');

    expect(canWriteCollaborator('actor', unrelated, 'contract')).toBe(true);
    expect(canWriteCollaborator('actor', own, 'self')).toBe(true);
    expect(canWriteCollaborator('actor', managed, 'managed')).toBe(true);
    expect(canWriteCollaborator('actor', unrelated, 'managed')).toBe(false);
    expect(canWriteCollaborator('actor', unrelated, 'self')).toBe(false);
  });
});
