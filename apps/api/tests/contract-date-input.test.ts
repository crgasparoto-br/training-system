import {
  dateOnlyAtStartOfDayInTimeZone,
  normalizeContractDateFields,
  normalizeContractDateInput,
} from '../src/modules/contracts/contract-date-input.js';

describe('contract date input normalization', () => {
  it('preserves the selected calendar day in America/Sao_Paulo', () => {
    const parsed = dateOnlyAtStartOfDayInTimeZone('2026-07-21', 'America/Sao_Paulo');

    expect(parsed.toISOString()).toBe('2026-07-21T03:00:00.000Z');
    expect(new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(parsed)).toBe('21/07/2026');
  });

  it('normalizes date-only fields without changing full timestamps or unrelated fields', () => {
    expect(normalizeContractDateFields({
      dataInicio: '2026-07-21',
      dataAssinatura: '2026-07-20T15:30:00.000Z',
      notes: 'manter',
    })).toEqual({
      dataInicio: '2026-07-21T03:00:00.000Z',
      dataAssinatura: '2026-07-20T15:30:00.000Z',
      notes: 'manter',
    });

    expect(normalizeContractDateInput(new Date('2026-07-21T12:00:00.000Z')))
      .toEqual(new Date('2026-07-21T12:00:00.000Z'));
  });

  it('rejects invalid calendar dates instead of silently rolling them forward', () => {
    expect(() => normalizeContractDateInput('2026-02-30'))
      .toThrow('Data de contrato inválida');
  });
});
