import crypto from 'crypto';


// Geracao e verificacao de token do convite de pre-cadastro (issue #269).
//
// Regras obrigatorias da issue:
// - gerador criptograficamente seguro, com entropia suficiente contra
//   enumeracao/adivinhacao;
// - codificacao URL-safe;
// - persistir SOMENTE o hash (SHA-256) - nunca o token bruto;
// - comparacao de hash em tempo constante.

const TOKEN_BYTES = 32; // 256 bits de entropia, suficiente contra enumeracao.

/** Gera um token aleatorio, criptograficamente seguro e URL-safe (base64url). */
export function generateInviteToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Hash unidirecional do token para persistencia. Nunca reversivel. */
export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Compara dois hashes em tempo constante. Hashes SHA-256 em hex tem tamanho
 * fixo (64 chars); tamanhos diferentes indicam entrada invalida e retornam
 * false sem comparar byte a byte (nao ha segredo a proteger nesse caso, pois
 * o hash em si nao e o segredo).
 */
export function timingSafeEqualHash(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const DEFAULT_TTL_DAYS = 30;

/** Validade padrao do convite (dias), configuravel por variavel de ambiente. */
export function getInviteTtlDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PRE_REGISTRATION_INVITE_TTL_DAYS?.trim();
  if (!raw) return DEFAULT_TTL_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_DAYS;
  return parsed;
}

export function computeInviteExpiresAt(now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Date {
  const ttlDays = getInviteTtlDays(env);
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}
