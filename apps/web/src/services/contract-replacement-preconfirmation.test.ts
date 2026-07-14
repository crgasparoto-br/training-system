import { describe, expect, it, vi } from 'vitest';
import {
  CONTRACT_REPLACEMENT_CONFIRMATION_MESSAGE,
  installContractReplacementPreconfirmation,
} from './contract-replacement-preconfirmation';

const buildRoot = () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <select name="intakeForm.financialInfo.selectedContractId">
      <option value="contract-a">Contrato A</option>
      <option value="contract-b">Contrato B</option>
    </select>
  `;
  return root;
};

describe('contract replacement preconfirmation', () => {
  it('reverts the selection before the form applies a rejected replacement', () => {
    const root = buildRoot();
    const select = root.querySelector<HTMLSelectElement>('select')!;
    select.value = 'contract-a';
    const originalConfirm = vi.fn((_message?: string) => false);
    const targetWindow = { confirm: originalConfirm };
    const uninstall = installContractReplacementPreconfirmation({
      root,
      targetWindow,
      getActiveContractId: () => 'contract-a',
      isUserInitiated: () => true,
    });

    select.value = 'contract-b';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(originalConfirm).toHaveBeenCalledWith(
      CONTRACT_REPLACEMENT_CONFIRMATION_MESSAGE
    );
    expect(select.value).toBe('contract-a');

    uninstall();
    expect(targetWindow.confirm).toBe(originalConfirm);
  });

  it('uses the accepted selection without prompting again during save', () => {
    const root = buildRoot();
    const select = root.querySelector<HTMLSelectElement>('select')!;
    select.value = 'contract-a';
    const originalConfirm = vi.fn((_message?: string) => true);
    const targetWindow = { confirm: originalConfirm };
    const uninstall = installContractReplacementPreconfirmation({
      root,
      targetWindow,
      getActiveContractId: () => 'contract-a',
      isUserInitiated: () => true,
    });

    select.value = 'contract-b';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const saveConfirmation = targetWindow.confirm(
      CONTRACT_REPLACEMENT_CONFIRMATION_MESSAGE
    );

    expect(saveConfirmation).toBe(true);
    expect(originalConfirm).toHaveBeenCalledTimes(1);

    uninstall();
    expect(targetWindow.confirm).toBe(originalConfirm);
  });

  it('confirms a replacement panel mounted after selection without a second dialog', async () => {
    const root = buildRoot();
    const select = root.querySelector<HTMLSelectElement>('select')!;
    select.value = 'contract-a';
    const originalConfirm = vi.fn((_message?: string) => true);
    const targetWindow = { confirm: originalConfirm };
    const replacementApplied = vi.fn();

    const uninstall = installContractReplacementPreconfirmation({
      root,
      targetWindow,
      getActiveContractId: () => 'contract-a',
      isUserInitiated: () => true,
    });

    select.value = 'contract-b';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const panel = document.createElement('div');
    panel.id = 'aluno-contract-replacement-confirmation';
    const button = document.createElement('button');
    button.textContent = 'Confirmar preparação da substituição';
    button.addEventListener('click', () => {
      const confirmed = targetWindow.confirm(
        'O contrato assinado "Contrato A" será encerrado quando este cadastro for salvo. Confirma a troca pelo novo contrato selecionado?'
      );
      if (confirmed) replacementApplied();
    });
    panel.appendChild(button);
    root.appendChild(panel);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(replacementApplied).toHaveBeenCalledTimes(1);
    expect(originalConfirm).toHaveBeenCalledTimes(1);
    expect(originalConfirm).toHaveBeenCalledWith(
      CONTRACT_REPLACEMENT_CONFIRMATION_MESSAGE
    );

    uninstall();
  });
});
