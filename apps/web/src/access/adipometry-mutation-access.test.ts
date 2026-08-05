import { describe, expect, it } from 'vitest';
import { canMutateAdipometryAssessment } from './adipometry-mutation-access';

describe('canMutateAdipometryAssessment', () => {
  const initialDraft = { revisionNumber: 1 };
  const correctionDraft = { revisionNumber: 2 };

  it('usa gestao para criar ou editar o rascunho inicial', () => {
    expect(canMutateAdipometryAssessment(null, {
      canManage: true,
      canCorrectCompleted: false,
    })).toBe(true);
    expect(canMutateAdipometryAssessment(initialDraft, {
      canManage: true,
      canCorrectCompleted: false,
    })).toBe(true);
    expect(canMutateAdipometryAssessment(initialDraft, {
      canManage: false,
      canCorrectCompleted: true,
    })).toBe(false);
  });

  it('usa exclusivamente a permissao de correcao para revisoes posteriores', () => {
    expect(canMutateAdipometryAssessment(correctionDraft, {
      canManage: true,
      canCorrectCompleted: false,
    })).toBe(false);
    expect(canMutateAdipometryAssessment(correctionDraft, {
      canManage: false,
      canCorrectCompleted: true,
    })).toBe(true);
  });

  it('nega qualquer mutacao quando nenhuma capacidade esta disponivel', () => {
    expect(canMutateAdipometryAssessment(null, {
      canManage: false,
      canCorrectCompleted: false,
    })).toBe(false);
    expect(canMutateAdipometryAssessment(initialDraft, {
      canManage: false,
      canCorrectCompleted: false,
    })).toBe(false);
    expect(canMutateAdipometryAssessment(correctionDraft, {
      canManage: false,
      canCorrectCompleted: false,
    })).toBe(false);
  });
});
