import { describe, expect, it } from 'vitest';
import type { StudentContractLink } from './aluno.service';
import {
  formatContractOptionValidity,
  stripContractOptionValidity,
  syncContractOptionValidityOptions,
} from './contract-option-validity';
import type { GeneratedContract } from './contract.service';

const signedContract: GeneratedContract = {
  id: 'contract-1',
  title: 'Contrato anual',
  status: 'SIGNED',
  renderedHtml: '<p>Contrato</p>',
  signedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const expiredLink: StudentContractLink = {
  id: 'student-contract-1',
  alunoId: 'student-1',
  contractId: 'contract-1',
  status: 'active',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-07-12T23:59:59.999Z',
  signedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  contract: {
    id: 'contract-1',
    title: 'Contrato anual',
    status: 'SIGNED',
    createdAt: '2026-01-01T00:00:00.000Z',
    signedAt: '2026-01-01T00:00:00.000Z',
    companyContractId: 'company-contract-1',
  },
};

const referenceDate = new Date('2026-07-14T12:00:00.000Z');

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

  it('updates the real contract select and preserves its selected value', () => {
    const select = document.createElement('select');
    select.name = 'intakeForm.financialInfo.selectedContractId';
    select.innerHTML = [
      '<option value="">Selecione um contrato existente</option>',
      '<option value="template-1">Modelo ativo: Contrato padrão • ACTIVE</option>',
      '<option value="contract-1">Contrato anual • Assinado</option>',
    ].join('');
    select.value = 'contract-1';

    syncContractOptionValidityOptions(
      select,
      [signedContract],
      [expiredLink],
      referenceDate
    );

    expect(select.value).toBe('contract-1');
    expect(select.options.item(2)?.textContent).toBe(
      'Contrato anual • Assinado • Vigência: Vencido'
    );
    expect(select.options.item(1)?.textContent).toBe(
      'Modelo ativo: Contrato padrão • ACTIVE'
    );

    syncContractOptionValidityOptions(
      select,
      [signedContract],
      [expiredLink],
      referenceDate
    );

    expect(select.options.item(2)?.textContent).toBe(
      'Contrato anual • Assinado • Vigência: Vencido'
    );
  });
});
