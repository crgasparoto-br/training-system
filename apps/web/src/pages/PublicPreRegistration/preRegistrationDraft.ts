// Rascunho local do pré-cadastro público (issue #271): preserva o passo atual
// e os campos ainda não salvos no servidor em sessionStorage.
//
// O identificador do processo participa da chave para impedir que uma conta de
// responsável com múltiplos dependentes restaure dados no cadastro incorreto.
// Dados já confirmados continuam vindo do servidor; este rascunho cobre apenas
// edições ainda não persistidas na aba atual.
const DRAFT_STORAGE_KEY = 'pre-registration-draft-v1';

/** Campos sensíveis que nunca são persistidos no rascunho de sessionStorage. */
const SENSITIVE_DRAFT_FIELDS = ['cpf', 'birthDate', 'guardianCpf'] as const;

export type PreRegistrationDraft<TForm> = { form: TForm; step: string };

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

export function readDraft<TForm>(scope?: string): PreRegistrationDraft<TForm> | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(scope));
    return raw ? (JSON.parse(raw) as PreRegistrationDraft<TForm>) : null;
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