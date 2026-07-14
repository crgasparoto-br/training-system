export const CONTRACT_SELECTION_FIELD = 'intakeForm.financialInfo.selectedContractId';
export const CONTRACT_REPLACEMENT_CONFIRMATION_MESSAGE =
  'Este aluno já possui um contrato ativo. Ao ativar um novo contrato, o anterior será encerrado.';

type ConfirmationWindow = Pick<Window, 'confirm'>;

type ContractReplacementPreconfirmationOptions = {
  root?: ParentNode & EventTarget;
  targetWindow?: ConfirmationWindow;
  getActiveContractId: () => string;
  isUserInitiated?: (event: Event) => boolean;
};

const getContractSelectionControl = (root: ParentNode) =>
  root.querySelector<HTMLSelectElement>(
    `select[name="${CONTRACT_SELECTION_FIELD}"]`
  );

export function installContractReplacementPreconfirmation({
  root = document,
  targetWindow = window,
  getActiveContractId,
  isUserInitiated = (event) => event.isTrusted,
}: ContractReplacementPreconfirmationOptions) {
  const originalConfirm = targetWindow.confirm;
  let acceptedReplacementId = '';

  const confirmReplacementBeforeApplying = (event: Event) => {
    const target = event.target;
    if (
      !isUserInitiated(event) ||
      !(target instanceof HTMLSelectElement) ||
      target.name !== CONTRACT_SELECTION_FIELD
    ) {
      return;
    }

    const activeContractId = getActiveContractId();
    const selectedContractId = target.value;

    if (!activeContractId || !selectedContractId || selectedContractId === activeContractId) {
      acceptedReplacementId = '';
      return;
    }

    const confirmed = originalConfirm.call(
      targetWindow,
      CONTRACT_REPLACEMENT_CONFIRMATION_MESSAGE
    );

    if (confirmed) {
      acceptedReplacementId = selectedContractId;
      return;
    }

    acceptedReplacementId = '';
    target.value = activeContractId;
    target.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const confirm: typeof targetWindow.confirm = (message) => {
    const selectedContractId = getContractSelectionControl(root)?.value || '';
    if (
      message === CONTRACT_REPLACEMENT_CONFIRMATION_MESSAGE &&
      selectedContractId &&
      selectedContractId === acceptedReplacementId
    ) {
      acceptedReplacementId = '';
      return true;
    }

    return originalConfirm.call(targetWindow, message);
  };

  root.addEventListener('change', confirmReplacementBeforeApplying, true);
  targetWindow.confirm = confirm;

  return () => {
    root.removeEventListener('change', confirmReplacementBeforeApplying, true);
    if (targetWindow.confirm === confirm) {
      targetWindow.confirm = originalConfirm;
    }
  };
}
