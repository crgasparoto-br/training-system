const LEGACY_REPLACEMENT_PHRASE =
  'será encerrado quando este cadastro for salvo. Confirma a troca pelo novo contrato selecionado?';

const LEGACY_IMMEDIATE_ACTIVATION_MESSAGE =
  'Este aluno já possui um contrato ativo. Ao ativar um novo contrato, o anterior será encerrado.';

const LEGACY_SAVE_FEEDBACK =
  'O contrato atual será encerrado somente ao salvar o cadastro.';

const LEGACY_PANEL_COPY =
  'Ao salvar, esse vínculo será encerrado e o novo contrato selecionado será ativado.';

const LIFECYCLE_CONFIRMATION_MESSAGE =
  'O contrato atual continuará vigente durante a assinatura do novo documento. ' +
  'Ele somente será encerrado quando o novo contrato estiver assinado e atingir sua data de início. ' +
  'Confirma a preparação da substituição?';

export const LIFECYCLE_PREPARATION_FEEDBACK =
  'Substituição preparada. O contrato atual continuará vigente até o novo documento ser assinado e atingir sua data de início.';

const LIFECYCLE_PANEL_COPY =
  'Ao salvar, a substituição será preparada. O contrato vigente continuará ativo até a assinatura e a data efetiva do novo contrato.';

const WINDOW_COPY_MARKER = '__contractLifecycleCopyNormalizerInstalled__';

type MarkedWindow = Window & {
  [WINDOW_COPY_MARKER]?: boolean;
};

export const isLegacyContractReplacementConfirmation = (message?: string) =>
  typeof message === 'string' &&
  (message.includes(LEGACY_REPLACEMENT_PHRASE) ||
    message === LEGACY_IMMEDIATE_ACTIVATION_MESSAGE);

export const normalizeContractReplacementConfirmation = (message?: string) =>
  isLegacyContractReplacementConfirmation(message)
    ? LIFECYCLE_CONFIRMATION_MESSAGE
    : message;

export const normalizeContractReplacementFeedback = (text?: string | null) => {
  if (!text) return text;

  return text
    .replace(LEGACY_SAVE_FEEDBACK, LIFECYCLE_PREPARATION_FEEDBACK)
    .replace(LEGACY_PANEL_COPY, LIFECYCLE_PANEL_COPY);
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const markedWindow = window as MarkedWindow;

  // Confirmation ownership now belongs exclusively to the replacement
  // component. This module only normalizes legacy explanatory copy and never
  // intercepts window.confirm.
  if (!markedWindow[WINDOW_COPY_MARKER]) {
    const normalizeRenderedCopy = () => {
      document.querySelectorAll<HTMLElement>('p, span, div').forEach((element) => {
        if (element.childElementCount > 0) return;
        const normalized = normalizeContractReplacementFeedback(element.textContent);
        if (normalized && normalized !== element.textContent) {
          element.textContent = normalized;
        }
      });
    };

    normalizeRenderedCopy();
    const observer = new MutationObserver(normalizeRenderedCopy);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    markedWindow[WINDOW_COPY_MARKER] = true;
  }
}
