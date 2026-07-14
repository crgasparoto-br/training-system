import { describe, expect, it, vi } from 'vitest';
import {
  ensurePreservedFinancialServiceControl,
  ensurePreservedFinancialServiceOption,
  installFinancialServicePayloadAdapter,
  patchProfileFinancialService,
  readFinancialServiceControlValue,
  readPersistedFinancialServiceName,
  removePreservedFinancialServiceFallback,
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

  it('renders only the current legacy service when there are no active offers', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div>
        <p>Nenhuma oferta financeira ativa cadastrada em Configurações &gt; Serviços.</p>
      </div>
    `;

    const control = ensurePreservedFinancialServiceControl(root, 'Plano legado');

    expect(control?.name).toBe('intakeForm.financialInfo.currentService');
    expect(control?.value).toBe('Plano legado');
    expect(Array.from(control?.options ?? []).map((option) => option.value)).toEqual([
      '',
      'Plano legado',
    ]);
    expect(root.querySelector('p')?.hidden).toBe(true);

    removePreservedFinancialServiceFallback(root);
    expect(root.querySelector('select')).toBeNull();
    expect(root.querySelector('p')?.hidden).toBe(false);
  });

  it('recreates an empty fallback after the financial tab is mounted again', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div>
        <p>Nenhuma oferta financeira ativa cadastrada em Configurações &gt; Serviços.</p>
      </div>
    `;

    const firstControl = ensurePreservedFinancialServiceControl(root, 'Plano legado');
    firstControl!.value = '';
    removePreservedFinancialServiceFallback(root);

    const recreatedControl = ensurePreservedFinancialServiceControl(root, '');

    expect(recreatedControl).toBeTruthy();
    expect(recreatedControl?.value).toBe('');
    expect(Array.from(recreatedControl?.options ?? []).map((option) => option.value)).toEqual([
      '',
    ]);
    expect(root.querySelector('p')?.hidden).toBe(true);
  });

  it('reads the service selected programmatically by the chosen contract', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <select name="intakeForm.financialInfo.currentService">
        <option value="Plano A">Plano A</option>
        <option value="Plano B">Plano B</option>
      </select>
    `;
    const control = root.querySelector<HTMLSelectElement>('select')!;

    control.value = 'Plano B';

    expect(readFinancialServiceControlValue(root)).toBe('Plano B');
  });

  it('persists the resolved service even when the fallback control is not registered by the form', async () => {
    const originalUpdate = vi.fn(async (_alunoId: string, data: Record<string, unknown>) => data);
    const service = { update: originalUpdate };
    let currentService = 'Plano legado';
    const uninstall = installFinancialServicePayloadAdapter(
      () => currentService,
      service
    );

    await service.update('student-1', {
      intakeForm: {
        formResponses: {
          financial: { monthlyValue: '300,00' },
        },
      },
    });

    expect(originalUpdate).toHaveBeenCalledWith('student-1', {
      intakeForm: {
        formResponses: {
          financial: {
            monthlyValue: '300,00',
            currentService: 'Plano legado',
          },
        },
      },
    });

    currentService = '';
    await service.update('student-1', {
      intakeForm: { formResponses: { financial: {} } },
    });
    expect(originalUpdate).toHaveBeenLastCalledWith('student-1', {
      intakeForm: {
        formResponses: {
          financial: { currentService: '' },
        },
      },
    });

    uninstall();
    expect(service.update).toBe(originalUpdate);
  });

  it('keeps unrelated profile fields while patching the service', () => {
    expect(
      patchProfileFinancialService(
        {
          name: 'Aluno',
          intakeForm: {
            formResponses: {
              financial: { monthlyValue: '350,00' },
            },
          },
        },
        '  Assessoria Premium  '
      )
    ).toEqual({
      name: 'Aluno',
      intakeForm: {
        formResponses: {
          financial: {
            monthlyValue: '350,00',
            currentService: 'Assessoria Premium',
          },
        },
      },
    });
  });
});
