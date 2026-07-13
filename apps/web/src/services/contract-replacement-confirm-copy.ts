const LEGACY_REPLACEMENT_PHRASE =
  'será encerrado quando este cadastro for salvo. Confirma a troca pelo novo contrato selecionado?';

const LEGACY_IMMEDIATE_ACTIVATION_MESSAGE =
  'Este aluno já possui um contrato ativo. Ao ativar um novo contrato, o anterior será encerrado.';

const LIFECYCLE_CONFIRMATION_MESSAGE =
  'O contrato atual continuará vigente durante a assinatura do novo documento. ' +
  'Ele somente será encerrado quando o novo contrato estiver assinado e atingir sua data de início. ' +
  'Confirma a preparação da substituição?';

const WINDOW_CONFIRM_MARKER = '__contractLifecycleConfirmCopyInstalled__';
const SELECTED_CONTRACT_FIELD = 'intakeForm.financialInfo.selectedContractId';

type MarkedWindow = Window & {
  [WINDOW_CONFIRM_MARKER]?: boolean;
};

export const isLegacyContractReplacementConfirmation = (message?: string) =>
  typeof message === 'string' &&
  (message.includes(LEGACY_REPLACEMENT_PHRASE) ||
    message === LEGACY_IMMEDIATE_ACTIVATION_MESSAGE);

export const normalizeContractReplacementConfirmation = (message?: string) =>
  isLegacyContractReplacementConfirmation(message)
    ? LIFECYCLE_CONFIRMATION_MESSAGE
    : message;

if (typeof window !== 'undefined') {
  const markedWindow = window as MarkedWindow;

  if (!markedWindow[WINDOW_CONFIRM_MARKER]) {
    const previousConfirm = window.confirm.bind(window);
    let confirmedReplacementPendingActivation = false;

    window.confirm = (message?: string) => {
      if (
        message === LEGACY_IMMEDIATE_ACTIVATION_MESSAGE &&
        confirmedReplacementPendingActivation
      ) {
        confirmedReplacementPendingActivation = false;
        return true;
      }

      const confirmed = previousConfirm(normalizeContractReplacementConfirmation(message));

      if (typeof message === 'string' && message.includes(LEGACY_REPLACEMENT_PHRASE)) {
        confirmedReplacementPendingActivation = confirmed;
      } else if (message === LEGACY_IMMEDIATE_ACTIVATION_MESSAGE) {
        confirmedReplacementPendingActivation = false;
      }

      return confirmed;
    };

    document.addEventListener('change', (event) => {
      const target = event.target;
      if (
        target instanceof HTMLSelectElement &&
        target.name === SELECTED_CONTRACT_FIELD
      ) {
        confirmedReplacementPendingActivation = false;
      }
    });

    markedWindow[WINDOW_CONFIRM_MARKER] = true;
  }
}
