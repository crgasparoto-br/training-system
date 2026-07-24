// Rascunho local do pré-cadastro público (issue #271): preserva o passo atual
// e os campos ainda não salvos no servidor em sessionStorage.
//
// A chave combina conta autenticada e processo para impedir que um responsável
// substituto ou outra conta no mesmo navegador restaure dados do usuário anterior.
// A versão-base impede mescla automática sobre dados alterados pela academia.
const DRAFT_STORAGE_KEY = 'pre-registration-draft-v3';
const LEGACY_DRAFT_STORAGE_KEYS = ['pre-registration-draft-v2', 'pre-registration-draft-v1'];

/** Campos sensíveis que nunca são persistidos no rascunho de sessionStorage. */
const SENSITIVE_DRAFT_FIELDS = ['cpf', 'birthDate', 'guardianCpf'] as const;

export type PreRegistrationDraft<TForm> = {
  form: TForm;
  step: string;
  baseVersion: number;
};

type StoredAuthUser = { id?: unknown };

function currentUserId(): string | null {
  try {
    const raw = window.localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuthUser | null;
    return typeof parsed?.id === 'string' && parsed.id ? parsed.id : null;
  } catch {
    return null;
  }
}

function storageKey(scope?: string): string | null {
  const userId = currentUserId();
  if (!userId) return null;
  return scope ? `${DRAFT_STORAGE_KEY}:${userId}:${scope}` : `${DRAFT_STORAGE_KEY}:${userId}`;
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
    const key = storageKey(scope);
    if (!key) return null;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredDraft<TForm>(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDraft<TForm>(draft: PreRegistrationDraft<TForm>, scope?: string) {
  try {
    const key = storageKey(scope);
    if (!key) return;
    const redactedDraft: PreRegistrationDraft<TForm> = {
      ...draft,
      form: omitSensitiveFields(draft.form),
    };
    window.sessionStorage.setItem(key, JSON.stringify(redactedDraft));
  } catch {
    // Armazenamento indisponível: degrada para o comportamento sem rascunho.
  }
}

export function clearDraft(scope?: string) {
  try {
    const key = storageKey(scope);
    if (key) window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function clearAllPreRegistrationDrafts() {
  try {
    const prefixes = [DRAFT_STORAGE_KEY, ...LEGACY_DRAFT_STORAGE_KEYS];
    const keys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key && prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}:`))) {
        keys.push(key);
      }
    }
    for (const key of keys) window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export { DRAFT_STORAGE_KEY, SENSITIVE_DRAFT_FIELDS };
