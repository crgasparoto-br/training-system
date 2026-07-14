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
    const targetWindow = { confirm: vi.fn((_message?: string) => false) };
    const uninstall = installContractReplacementPreconfirmation({
      root,
      targetWindow,
      getActiveContractId: () => 'contract-a',
      isUserInitiated: () => true,
    });

    select.value = 'contract-b';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(targetWindow.confirm).toHaveBeenCalledWith(
      CONTRACT_REPLACEMENT_CONFIRMATION_MESSAGE
    );
    expect(select.value).toBe('contract-a');

    uninstall();
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
});
