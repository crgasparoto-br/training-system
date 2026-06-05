import { describe, expect, it } from 'vitest';
import { canAccessBlock, canAccessScreen } from './access-control';
import type { AuthResponse } from '@corrida/types';

type User = AuthResponse['user'];

function makeProfessorUser(
  permissions: Array<{ screenKey: string; blockKey?: string | null; canView: boolean }>,
  collaboratorFunctionCode = 'professor'
): User {
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
        code: collaboratorFunctionCode,
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
  it('nao quebra quando professor nao possui collaboratorFunction carregada', () => {
    const user = {
      id: 'u-2',
      email: 'prof-sem-funcao@test.com',
      name: 'Professor sem funcao',
      type: 'professor',
      professor: {
        id: 'p-2',
        role: 'professor',
        contract: {
          id: 'c-1',
          type: 'academy',
          document: '00',
        },
      },
    } as unknown as User;

    expect(() => canAccessScreen(user, 'students.consultation')).not.toThrow();
  });

  it('aceita blockKey em canAccessScreen para compatibilidade com abas de cadastro', () => {
    const user = makeProfessorUser([
      { screenKey: 'students.registration', blockKey: null, canView: true },
      { screenKey: 'students.registration', blockKey: 'students.registration.identification', canView: true },
    ]);

    expect(canAccessScreen(user, 'students.registration.identification')).toBe(true);
  });

  it('blockKey em canAccessScreen respeita bloqueio da tela pai', () => {
    const user = makeProfessorUser([
      { screenKey: 'students.registration', blockKey: null, canView: false },
      { screenKey: 'students.registration', blockKey: 'students.registration.identification', canView: true },
    ]);

    expect(canAccessScreen(user, 'students.registration.identification')).toBe(false);
  });

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

  it('fallback de manager inclui acoes sensiveis de colaboradores', () => {
    const user = makeProfessorUser([], 'manager');

    expect(canAccessBlock(user, 'collaborators.actions.resetPassword')).toBe(true);
    expect(canAccessBlock(user, 'collaborators.actions.deactivate')).toBe(true);
  });

  it('fallback de professor nao inclui acoes administrativas de colaboradores', () => {
    const user = makeProfessorUser([], 'professor');

    expect(canAccessBlock(user, 'collaborators.actions.resetPassword')).toBe(false);
    expect(canAccessBlock(user, 'collaborators.actions.deactivate')).toBe(false);
  });
});
