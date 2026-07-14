import { describe, expect, it } from 'vitest';
import {
  formatContractOptionValidity,
  stripContractOptionValidity,
} from './contract-option-validity';

describe('contract option validity', () => {
  it('appends the validity after the document status', () => {
    expect(
      formatContractOptionValidity('Contrato anual • Assinado', {
        status: 'expired',
        label: 'Vencido',
      })
    ).toBe('Contrato anual • Assinado • Vigência: Vencido');
  });

  it('replaces a previous validity instead of duplicating it', () => {
    expect(
      formatContractOptionValidity('Contrato anual • Assinado • Vigência: Vigente', {
        status: 'expired',
        label: 'Vencido',
      })
    ).toBe('Contrato anual • Assinado • Vigência: Vencido');
  });

  it('keeps options without contractual validity unchanged', () => {
    expect(formatContractOptionValidity('Modelo ativo: Contrato anual • ACTIVE', null)).toBe(
      'Modelo ativo: Contrato anual • ACTIVE'
    );
  });

  it('removes a stale validity suffix when needed', () => {
    expect(stripContractOptionValidity('Contrato anual • Assinado • Vigência: Vigente')).toBe(
      'Contrato anual • Assinado'
    );
  });
});
