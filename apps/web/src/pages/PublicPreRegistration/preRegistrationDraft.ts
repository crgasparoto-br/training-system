// Rascunho local do pré-cadastro público (issue #271): preserva o passo atual
// e os campos ainda não salvos no servidor em sessionStorage.
//
// Isso evita perda de digitação quando a sessão expira -- o interceptor
// global de 401 (apps/web/src/services/api.ts) redireciona a página inteira
// para /login via window.location.href, o que descarta qualquer estado React
// em memória. sessionStorage sobrevive a esse redirecionamento (ao contrário
// do estado do componente), mas é limpo ao fechar a aba, diferente de
// localStorage.
//
// Dados já confirmados via "Salvar" continuam vindo do servidor
// normalmente; este rascunho cobre apenas edições ainda não persistidas.
//
// Redução de exposição de dados sensíveis: sessionStorage é acessível via
// devtools/extensões do navegador na mesma aba, então os campos mais
// sensíveis (CPF do aluno, CPF do responsável legal, data de nascimento
// completa) nunca são gravados no rascunho -- permanecem apenas em memória
// (estado React) durante a vida da aba. Caso a sessão expire com esses
// campos ainda não salvos no servidor, a pessoa usuária precisa digitá-los
// novamente; os demais campos (incluindo qual etapa estava em andamento)
// continuam sendo restaurados normalmente.
const DRAFT_STORAGE_KEY = 'pre-registration-draft-v1';

/** Campos sensíveis que nunca são persistidos no rascunho de sessionStorage. */
const SENSITIVE_DRAFT_FIELDS = ['cpf', 'birthDate', 'guardianCpf'] as const;

export type PreRegistrationDraft<TForm> = { form: TForm; step: string };

function omitSensitiveFields<TForm>(form: TForm): TForm {
  const redacted = { ...(form as Record<string, unknown>) };
  for (const field of SENSITIVE_DRAFT_FIELDS) {
    delete redacted[field];
  }
  return redacted as TForm;
}

export function readDraft<TForm>(): PreRegistrationDraft<TForm> | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PreRegistrationDraft<TForm>) : null;
  } catch {
    return null;
  }
}

export function writeDraft<TForm>(draft: PreRegistrationDraft<TForm>) {
  try {
    const redactedDraft: PreRegistrationDraft<TForm> = {
      ...draft,
      form: omitSensitiveFields(draft.form),
    };
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(redactedDraft));
  } catch {
    // Armazenamento indisponível (modo privado, quota etc.): degrada
    // silenciosamente para o comportamento sem rascunho persistido.
  }
}

export function clearDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export { DRAFT_STORAGE_KEY, SENSITIVE_DRAFT_FIELDS };
