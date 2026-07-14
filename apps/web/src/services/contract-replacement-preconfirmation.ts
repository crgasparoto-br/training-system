export const CONTRACT_SELECTION_FIELD = 'intakeForm.financialInfo.selectedContractId';
export const CONTRACT_REPLACEMENT_CONFIRMATION_MESSAGE =
  'Este aluno já possui um contrato ativo. Ao ativar um novo contrato, o anterior será encerrado.';

const CONTRACT_REPLACEMENT_PANEL_ID = 'aluno-contract-replacement-confirmation';
const CONTRACT_REPLACEMENT_ACTION_LABEL = 'Confirmar preparação da substituição';
const DETAILED_REPLACEMENT_CONFIRMATION_PATTERN =
  /^O contrato (?:assinado|ativo) ".+" será encerrado quando este cadastro for salvo\./u;

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

const findReplacementConfirmationButton = (root: ParentNode) => {
  const panel = root.querySelector<HTMLElement>(`#${CONTRACT_REPLACEMENT_PANEL_ID}`);
  return (
    Array.from(panel?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (button) =>
        !button.disabled &&
        button.textContent?.replace(/\s+/gu, ' ').trim() ===
          CONTRACT_REPLACEMENT_ACTION_LABEL
    ) ?? null
  );
};

export function installContractReplacementPreconfirmation({
  root = document,
  targetWindow = window,
  getActiveContractId,
  isUserInitiated = (event) => event.isTrusted,
}: ContractReplacementPreconfirmationOptions) {
  const originalConfirm = targetWindow.confirm;
  let acceptedReplacementId = '';
  let restoringSelection = false;

  const confirmExistingReplacementPanel = () => {
    const selectedContractId = getContractSelectionControl(root)?.value || '';
    if (!selectedContractId || selectedContractId !== acceptedReplacementId) return;
    findReplacementConfirmationButton(root)?.click();
  };

  const scheduleExistingReplacementConfirmation = () => {
    queueMicrotask(confirmExistingReplacementPanel);
    setTimeout(confirmExistingReplacementPanel, 0);
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(confirmExistingReplacementPanel);
    }
  };

  const confirmReplacementBeforeApplying = (event: Event) => {
    const target = event.target;
    if (
      restoringSelection ||
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
      scheduleExistingReplacementConfirmation();
      return;
    }

    acceptedReplacementId = '';
    restoringSelection = true;
    try {
      target.value = activeContractId;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      restoringSelection = false;
    }
  };

  const confirm: typeof targetWindow.confirm = (message) => {
    const selectedContractId = getContractSelectionControl(root)?.value || '';
    const acceptedSelection =
      Boolean(selectedContractId) && selectedContractId === acceptedReplacementId;

    if (
      acceptedSelection &&
      typeof message === 'string' &&
      DETAILED_REPLACEMENT_CONFIRMATION_PATTERN.test(message)
    ) {
      return true;
    }

    if (acceptedSelection && message === CONTRACT_REPLACEMENT_CONFIRMATION_MESSAGE) {
      acceptedReplacementId = '';
      return true;
    }

    return originalConfirm.call(targetWindow, message);
  };

  root.addEventListener('change', confirmReplacementBeforeApplying, true);
  targetWindow.confirm = confirm;

  return () => {
    root.removeEventListener('change', confirmReplacementBeforeApplying, true);
    acceptedReplacementId = '';
    if (targetWindow.confirm === confirm) {
      targetWindow.confirm = originalConfirm;
    }
  };
}
