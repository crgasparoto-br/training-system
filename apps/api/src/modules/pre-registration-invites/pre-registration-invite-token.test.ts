import {
  computeInviteExpiresAt,
  generateInviteToken,
  getInviteTtlDays,
  hashInviteToken,
  timingSafeEqualHash,
} from './pre-registration-invite-token.js';

describe('geração do token', () => {
  it('gera tokens URL-safe (base64url) e não vazios', () => {
    const token = generateInviteToken();
    expect(token.length).toBeGreaterThan(30);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('gera tokens distintos a cada chamada (entropia)', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateInviteToken()));
    expect(tokens.size).toBe(50);
  });
});

describe('hash do token', () => {
  it('o hash é diferente do token bruto', () => {
    const token = generateInviteToken();
    const hash = hashInviteToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('é determinístico para o mesmo token', () => {
    const token = generateInviteToken();
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
  });

  it('produz hash completamente diferente quando um único caractere muda', () => {
    const token = generateInviteToken();
    const tampered = token[0] === 'a' ? `b${token.slice(1)}` : `a${token.slice(1)}`;
    expect(hashInviteToken(tampered)).not.toBe(hashInviteToken(token));
  });
});

describe('comparação em tempo constante', () => {
  it('reconhece hashes iguais', () => {
    const token = generateInviteToken();
    const hash = hashInviteToken(token);
    expect(timingSafeEqualHash(hash, hash)).toBe(true);
  });

  it('rejeita hashes diferentes', () => {
    const hashA = hashInviteToken(generateInviteToken());
    const hashB = hashInviteToken(generateInviteToken());
    expect(timingSafeEqualHash(hashA, hashB)).toBe(false);
  });

  it('rejeita entradas de tamanho diferente sem lançar exceção', () => {
    expect(timingSafeEqualHash('abcd', hashInviteToken(generateInviteToken()))).toBe(false);
  });
});

describe('validade configurável', () => {
  it('usa 30 dias por padrão quando a env não define TTL', () => {
    expect(getInviteTtlDays({} as NodeJS.ProcessEnv)).toBe(30);
  });

  it('usa o valor configurado quando válido', () => {
    expect(getInviteTtlDays({ PRE_REGISTRATION_INVITE_TTL_DAYS: '15' } as NodeJS.ProcessEnv)).toBe(15);
  });

  it('ignora valores inválidos e usa o padrão', () => {
    expect(getInviteTtlDays({ PRE_REGISTRATION_INVITE_TTL_DAYS: '-5' } as NodeJS.ProcessEnv)).toBe(30);
    expect(getInviteTtlDays({ PRE_REGISTRATION_INVITE_TTL_DAYS: 'abc' } as NodeJS.ProcessEnv)).toBe(30);
  });

  it('calcula a expiração no backend a partir de "agora" + TTL', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const expiresAt = computeInviteExpiresAt(now, {
      PRE_REGISTRATION_INVITE_TTL_DAYS: '10',
    } as NodeJS.ProcessEnv);
    expect(expiresAt.toISOString()).toBe('2026-01-11T00:00:00.000Z');
  });
});
