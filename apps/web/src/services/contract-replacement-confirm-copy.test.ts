import { describe, expect, it } from 'vitest';
import {
  isLegacyContractReplacementConfirmation,
  normalizeContractReplacementConfirmation,
} from './contract-replacement-confirm-copy';

describe('normalizeContractReplacementConfirmation', () => {
  it('explica que o contrato vigente permanece até assinatura e início do novo', () => {
    const normalized = normalizeContractReplacementConfirmation(
      'O contrato assinado "Plano atual" será encerrado quando este cadastro for salvo. Confirma a troca pelo novo contrato selecionado?'
    );

    expect(normalized).toContain('continuará vigente');
    expect(normalized).toContain('assinado');
    expect(normalized).toContain('data de início');
  });

  it('substitui também a confirmação legada que afirmava encerramento imediato', () => {
    const legacyMessage =
      'Este aluno já possui um contrato ativo. Ao ativar um novo contrato, o anterior será encerrado.';

    expect(isLegacyContractReplacementConfirmation(legacyMessage)).toBe(true);
    expect(normalizeContractReplacementConfirmation(legacyMessage)).toContain(
      'somente será encerrado quando o novo contrato estiver assinado'
    );
  });

  it('não altera confirmações de outros fluxos', () => {
    expect(normalizeContractReplacementConfirmation('Gerar um novo link?')).toBe(
      'Gerar um novo link?'
    );
  });
});
