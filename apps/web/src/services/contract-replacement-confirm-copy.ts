const LEGACY_REPLACEMENT_PHRASE =
  'será encerrado quando este cadastro for salvo. Confirma a troca pelo novo contrato selecionado?';

const LIFECYCLE_CONFIRMATION_MESSAGE =
  'O contrato atual continuará vigente durante a assinatura do novo documento. ' +
  'Ele somente será encerrado quando o novo contrato estiver assinado e atingir sua data de início. ' +
  'Confirma a preparação da substituição?';

const WINDOW_CONFIRM_MARKER = '__contractLifecycleConfirmCopyInstalled__';

type MarkedWindow = Window & {
  [WINDOW_CONFIRM_MARKER]?: boolean;
};

export const normalizeContractReplacementConfirmation = (message?: string) =>
  typeof message === 'string' && message.includes(LEGACY_REPLACEMENT_PHRASE)
    ? LIFECYCLE_CONFIRMATION_MESSAGE
    : message;

if (typeof window !== 'undefined') {
  const markedWindow = window as MarkedWindow;

  if (!markedWindow[WINDOW_CONFIRM_MARKER]) {
    const previousConfirm = window.confirm.bind(window);

    window.confirm = (message?: string) =>
      previousConfirm(normalizeContractReplacementConfirmation(message));

    markedWindow[WINDOW_CONFIRM_MARKER] = true;
  }
}
