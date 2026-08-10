import { describe, expect, it } from 'vitest';
import { responsibleProfessorOptionLabel } from './AdipometryView';

describe('responsibleProfessorOptionLabel', () => {
  it('usa texto neutro quando o responsavel historico nao esta mais elegivel', () => {
    expect(responsibleProfessorOptionLabel({
      currentProfessorId: 'internal-professor-uuid',
      responsibleProfessors: [{ id: 'active-1', name: 'Prof. Ativo' }],
    })).toBe('Responsável histórico indisponível');
  });

  it('nao cria opcao duplicada quando o responsavel continua elegivel', () => {
    expect(responsibleProfessorOptionLabel({
      currentProfessorId: 'active-1',
      responsibleProfessors: [{ id: 'active-1', name: 'Prof. Ativo' }],
    })).toBeNull();
  });
});
