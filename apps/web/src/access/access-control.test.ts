import { describe, expect, it } from 'vitest';
import { canAccessBlock } from './access-control';
import type { AuthResponse } from '@corrida/types';

type User = AuthResponse['user'];

function makeProfessorUser(permissions: Array<{ screenKey: string; blockKey?: string | null; canView: boolean }>): User {
  return {
    id: 'u-1',
    email: 'prof@test.com',
    name: 'Professor',
    type: 'professor',
    professor: {
      id: 'p-1',
      role: 'professor',
      collaboratorFunction: {
        id: 'fn-1',
        name: 'Funcao',
        code: 'professor',
        isActive: true,
        accessPermissions: permissions,
      },
      contract: {
        id: 'c-1',
        type: 'academy',
        document: '00',
      },
    },
  };
}

describe('controle de acesso de abas e acoes sensiveis do aluno', () => {
  it('usuario sem permissao nao acessa aba financeira, avaliacoes e acoes sensiveis', () => {
    const user = makeProfessorUser([
      { screenKey: 'students.details', blockKey: null, canView: true },
      { screenKey: 'students.details', blockKey: 'students.details.summary', canView: true },
    ]);

    expect(canAccessBlock(user, 'students.details.financialContract')).toBe(false);
    expect(canAccessBlock(user, 'students.details.assessments')).toBe(false);
    expect(canAccessBlock(user, 'students.actions.manageAssessments')).toBe(false);
  });

  it('bloco sem acesso de tela pai permanece bloqueado', () => {
    const user = makeProfessorUser([
      { screenKey: 'students.details', blockKey: null, canView: false },
      { screenKey: 'students.details', blockKey: 'students.details.financialContract', canView: true },
    ]);

    expect(canAccessBlock(user, 'students.details.financialContract')).toBe(false);
  });

  it('com tela e bloco liberados, acesso ao bloco e permitido', () => {
    const user = makeProfessorUser([
      { screenKey: 'students.details', blockKey: null, canView: true },
      { screenKey: 'students.details', blockKey: 'students.details.assessments', canView: true },
    ]);

    expect(canAccessBlock(user, 'students.details.assessments')).toBe(true);
  });
});
