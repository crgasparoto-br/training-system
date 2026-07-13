import { describe, expect, it } from 'vitest';
import {
  ensurePreservedFinancialServiceOption,
  readPersistedFinancialServiceName,
  resolveFinancialServiceName,
} from './financial-service-preservation';

describe('financial service preservation', () => {
  it('prioritizes the service linked to the active contract', () => {
    expect(
      resolveFinancialServiceName({
        activeContractServiceName: '  Assessoria Premium  ',
        persistedFinancialServiceName: 'Assessoria antiga',
      })
    ).toBe('Assessoria Premium');
  });

  it('falls back to the persisted financial service', () => {
    const persisted = readPersistedFinancialServiceName({
      financial: {
        currentService: '  Personal 2x por semana  ',
      },
    });

    expect(
      resolveFinancialServiceName({
        activeContractServiceName: null,
        persistedFinancialServiceName: persisted,
      })
    ).toBe('Personal 2x por semana');
  });

  it('adds the current legacy service without duplicating an existing option', () => {
    const select = document.createElement('select');
    select.innerHTML = '<option value="">Selecione</option><option value="Plano atual">Plano atual</option>';

    expect(ensurePreservedFinancialServiceOption(select, 'Plano legado')).toBe(true);
    expect(select.options.item(1)?.value).toBe('Plano legado');
    expect(select.options.item(1)?.textContent).toBe('Plano legado • vínculo atual');
    expect(select.options.item(1)?.dataset.preservedFinancialService).toBe('true');

    expect(ensurePreservedFinancialServiceOption(select, 'Plano legado')).toBe(false);
    expect(Array.from(select.options).filter((option) => option.value === 'Plano legado')).toHaveLength(1);
    expect(ensurePreservedFinancialServiceOption(select, 'Plano atual')).toBe(false);
  });
});
