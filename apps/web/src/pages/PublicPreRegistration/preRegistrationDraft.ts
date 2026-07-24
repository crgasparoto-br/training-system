// Rascunho local do pré-cadastro público (issue #271): preserva o passo atual
// e os campos ainda não salvos no servidor em sessionStorage.
//
// O identificador do processo participa da chave para impedir que uma conta de
// responsável com múltiplos dependentes restaure dados no cadastro incorreto.
// A versão-base impede que um rascunho antigo seja mesclado automaticamente
// sobre dados alterados pela academia.
const DRAFT_STORAGE_KEY = 'pre-registration-draft-v2';

/** Campos sensíveis que nunca são persistidos no rascunho de sessionStorage. */
const SENSITIVE_DRAFT_FIELDS = ['cpf', 'birthDate', 'guardianCpf'] as const;

export type PreRegistrationDraft<TForm> = {
  form: TForm;
  step: string;
  baseVersion: number;
};

function storageKey(scope?: string): string {
  return scope ? `${DRAFT_STORAGE_KEY}:${scope}` : DRAFT_STORAGE_KEY;
}

function omitSensitiveFields<TForm>(form: TForm): TForm {
  const redacted = { ...(form as Record<string, unknown>) };
  for (const field of SENSITIVE_DRAFT_FIELDS) {
    delete redacted[field];
  }
  return redacted as TForm;
}

function isStoredDraft<TForm>(value: unknown): value is PreRegistrationDraft<TForm> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  return (
    draft.form !== null &&
    typeof draft.form === 'object' &&
    !Array.isArray(draft.form) &&
    typeof draft.step === 'string' &&
    Number.isInteger(draft.baseVersion) &&
    Number(draft.baseVersion) > 0
  );
}

export function readDraft<TForm>(scope?: string): PreRegistrationDraft<TForm> | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredDraft<TForm>(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDraft<TForm>(draft: PreRegistrationDraft<TForm>, scope?: string) {
  try {
    const redactedDraft: PreRegistrationDraft<TForm> = {
      ...draft,
      form: omitSensitiveFields(draft.form),
    };
    window.sessionStorage.setItem(storageKey(scope), JSON.stringify(redactedDraft));
  } catch {
    // Armazenamento indisponível: degrada para o comportamento sem rascunho.
  }
}

export function clearDraft(scope?: string) {
  try {
    window.sessionStorage.removeItem(storageKey(scope));
  } catch {
    // ignore
  }
}

export { DRAFT_STORAGE_KEY, SENSITIVE_DRAFT_FIELDS };
