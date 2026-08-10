export interface PreviousWebCompatibilityEvidence {
  previousWebSha: string;
  expectedPreviousWebSha: string;
  currentHeadSha: string;
  previousWebDistDigest: string;
  publicInviteRendered: boolean;
  authenticatedResumeRendered: boolean;
  administrativeListRendered: boolean;
}

export interface ReauthenticationEvidence {
  secondContextStartedWithoutSession: boolean;
  authLoginRequestCount: number;
  authLoginStatus: number;
  resumedStep: string;
  expectedResumedStep: string;
  inviteTokenAbsentFromUrl: boolean;
  inviteTokenAbsentFromStorage: boolean;
  authenticatedSessionPresent: boolean;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function validatePreviousWebCompatibilityEvidence(
  evidence: PreviousWebCompatibilityEvidence
): PreviousWebCompatibilityEvidence {
  assert(Boolean(evidence.previousWebSha.trim()), 'SHA da web anterior ausente');
  assert(Boolean(evidence.expectedPreviousWebSha.trim()), 'SHA esperado da web anterior ausente');
  assert(Boolean(evidence.currentHeadSha.trim()), 'SHA atual ausente');
  assert(
    evidence.previousWebSha === evidence.expectedPreviousWebSha,
    `Checkout da web anterior divergente: esperado ${evidence.expectedPreviousWebSha}, recebido ${evidence.previousWebSha}`
  );
  assert(
    evidence.previousWebSha !== evidence.currentHeadSha,
    'Compatibilidade não pode ser comprovada executando o mesmo SHA da implementação atual'
  );
  assert(
    /^[a-f0-9]{64}$/i.test(evidence.previousWebDistDigest),
    'Digest SHA-256 do bundle anterior ausente ou inválido'
  );
  assert(evidence.publicInviteRendered, 'Consumidor público da web anterior não foi exercitado');
  assert(
    evidence.authenticatedResumeRendered,
    'Consumidor autenticado da web anterior não foi exercitado'
  );
  assert(
    evidence.administrativeListRendered,
    'Consumidor administrativo da web anterior não foi exercitado'
  );
  return evidence;
}

export function validateReauthenticationEvidence(
  evidence: ReauthenticationEvidence
): ReauthenticationEvidence {
  assert(
    evidence.secondContextStartedWithoutSession,
    'O segundo contexto deve iniciar sem token nem usuário persistidos'
  );
  assert(
    evidence.authLoginRequestCount === 1,
    `A retomada deve executar exatamente uma autenticação real; observado ${evidence.authLoginRequestCount}`
  );
  assert(
    evidence.authLoginStatus === 200,
    `A autenticação real falhou com HTTP ${evidence.authLoginStatus}`
  );
  assert(
    evidence.resumedStep === evidence.expectedResumedStep,
    `Etapa retomada divergente: esperado ${evidence.expectedResumedStep}, recebido ${evidence.resumedStep}`
  );
  assert(
    evidence.inviteTokenAbsentFromUrl,
    'A retomada autenticada não pode depender do token de convite na URL'
  );
  assert(
    evidence.inviteTokenAbsentFromStorage,
    'A retomada autenticada não pode persistir o token de convite no navegador'
  );
  assert(
    evidence.authenticatedSessionPresent,
    'A nova autenticação não produziu uma sessão autenticada utilizável'
  );
  return evidence;
}
