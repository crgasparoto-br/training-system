import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { hashInviteToken } from './pre-registration-invite-token.js';
import {
  PreRegistrationInvitePublicAccessError,
  preRegistrationInviteService,
} from './pre-registration-invite.service.js';
import { createPreRegistrationInviteRateLimiter } from './pre-registration-invite-rate-limit.middleware.js';
import { createStudentLead } from '../alunos/student-lifecycle.service.js';

// Testes unitários de geração/hash/comparação de token (funções puras, sem
// dependência de banco) vivem em pre-registration-invite-token.test.ts. Este
// arquivo cobre apenas o comportamento do serviço com Postgres real.

const prisma = new PrismaClient();
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const makeRateLimitResponse = () => {
  const res: any = { headers: {} as Record<string, unknown> };
  res.setHeader = (key: string, value: unknown) => {
    res.headers[key] = value;
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res;
};

describe('pre-registration-invite service', () => {
  const createdContractIds: string[] = [];

  const createContract = async () => {
    const suffix = unique();
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `invite-${suffix}`,
        name: `Contrato convite ${suffix}`,
      },
    });
    createdContractIds.push(contract.id);
    return contract.id;
  };

  const createLeadWithContact = async (contractId: string) => {
    return createStudentLead({
      contractId,
      name: `Lead ${unique()}`,
      phone: '11999998888',
      origin: 'test-suite',
    });
  };

  afterAll(async () => {
    for (const id of [...createdContractIds].reverse()) {
      await prisma.companyContract.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('geração nominal: cria convite ativo, retorna token bruto uma única vez e move o lead para INVITED', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);

    const result = await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {
      professorId: undefined,
    });

    expect(result.token).toBeTruthy();
    expect(result.url).toContain(result.token);
    expect(result.summary.status).toBe('ACTIVE');
    expect(result.summary.linkRecoverable).toBe(false);
    expect((result.summary as any).tokenHash).toBeUndefined();
    expect((result.summary as any).hash).toBeUndefined();

    const stored = await prisma.preRegistrationInvite.findUnique({ where: { id: result.summary.id } });
    expect(stored?.tokenHash).not.toBe(result.token);
    expect(stored?.tokenHash).toBe(hashInviteToken(result.token));

    const aluno = await prisma.aluno.findUniqueOrThrow({ where: { id: lead.id } });
    expect(aluno.status).toBe('INVITED');
  });

  it('reverte convite e transição para INVITED quando o commit da geração inicial falha', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    const functionName = 'test_fail_invite_commit_269';
    const triggerName = 'test_fail_invite_commit_269_trigger';
    const escapedLeadId = lead.id.replace(/'/g, "''");

    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON "PreRegistrationInvite"`
    );
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."alunoId" = '${escapedLeadId}' THEN
          RAISE EXCEPTION 'forced deferred invite commit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE CONSTRAINT TRIGGER "${triggerName}"
      AFTER INSERT ON "PreRegistrationInvite"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
    `);

    try {
      await expect(
        preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {})
      ).rejects.toBeTruthy();
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "PreRegistrationInvite"`
      );
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }

    const aluno = await prisma.aluno.findUniqueOrThrow({ where: { id: lead.id } });
    expect(aluno.status).toBe('LEAD');
    expect(aluno.invitedAt).toBeNull();
    expect(await prisma.preRegistrationInvite.count({ where: { alunoId: lead.id } })).toBe(0);
    expect(
      await prisma.studentLifecycleEvent.count({
        where: { alunoId: lead.id, eventType: 'STATUS_CHANGED' },
      })
    ).toBe(0);
  });

  it('recusa gerar primeiro convite quando já existe um ativo (no máximo um por pessoa/finalidade)', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});

    await expect(
      preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {})
    ).rejects.toMatchObject({ code: 'ACTIVE_INVITE_EXISTS' });
  });

  it('regeneração invalida o anterior (SUPERSEDED) atomicamente e o link antigo passa a ser inválido', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    const first = await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});

    const second = await preRegistrationInviteService.regenerateInvite(lead.id, contractId, {});
    expect(second.token).not.toBe(first.token);

    const oldInvite = await prisma.preRegistrationInvite.findUnique({
      where: { id: first.summary.id },
    });
    expect(oldInvite?.status).toBe('SUPERSEDED');
    expect(oldInvite?.supersededAt).toBeTruthy();

    const newInvite = await prisma.preRegistrationInvite.findUnique({
      where: { id: second.summary.id },
    });
    expect(newInvite?.replacesInviteId).toBe(first.summary.id);

    // Link antigo (token anterior) deve se comportar como inválido para o público.
    await expect(preRegistrationInviteService.openPublicInvite(first.token)).rejects.toBeInstanceOf(
      PreRegistrationInvitePublicAccessError
    );

    // Novo link funciona e não vaza IDs internos na resposta pública.
    const view = await preRegistrationInviteService.openPublicInvite(second.token);
    expect(view.purpose).toBe('PRE_REGISTRATION');
    expect(view).not.toHaveProperty('alunoId');
    expect(view).not.toHaveProperty('contractId');
  });

  it('duas regenerações concorrentes não produzem dois convites ativos', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});

    const results = await Promise.allSettled([
      preRegistrationInviteService.regenerateInvite(lead.id, contractId, {}),
      preRegistrationInviteService.regenerateInvite(lead.id, contractId, {}),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    // A garantia real é de banco (updateMany condicional + índice único parcial
    // ACTIVE por pessoa/finalidade): nunca deve haver duas regenerações
    // simultâneas terminando com dois convites ACTIVE. Dependendo do
    // agendamento das duas transações, a segunda pode falhar com
    // CONCURRENT_MODIFICATION (colisão no mesmo convite ACTIVE) ou suceder
    // encadeada sobre o convite recém-criado pela primeira - em ambos os
    // casos o pool serializa as transações e nenhuma condição de corrida
    // deixa dois convites ACTIVE.
    expect(fulfilled.length + rejected.length).toBe(2);
    if (rejected.length > 0) {
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: 'CONCURRENT_MODIFICATION',
      });
    }

    const activeInvites = await prisma.preRegistrationInvite.findMany({
      where: { alunoId: lead.id, purpose: 'PRE_REGISTRATION', status: 'ACTIVE' },
    });
    expect(activeInvites.length).toBe(1);
  });

  it('falha na regeneração preserva o convite anterior utilizável (não existe convite ativo para regenerar)', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);

    await expect(
      preRegistrationInviteService.regenerateInvite(lead.id, contractId, {})
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const invites = await prisma.preRegistrationInvite.findMany({ where: { alunoId: lead.id } });
    expect(invites.length).toBe(0);
  });

  it('falha transacional durante a regeneração (criação do novo convite) preserva o anterior ACTIVE', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    const first = await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});

    // Prepara uma colisão real de tokenHash: insere um convite "decoy" em outro
    // tenant com um tokenHash conhecido e força crypto.randomBytes a produzir,
    // na próxima chamada, exatamente os mesmos bytes usados para gerar aquele
    // token - assim a etapa de INSERT do novo convite (dentro da transação de
    // regeneração) falha por violação de unicidade de tokenHash, depois que o
    // convite antigo já foi marcado SUPERSEDED na mesma transação.
    const decoyContractId = await createContract();
    const decoyLead = await createLeadWithContact(decoyContractId);
    const collidingBytes = crypto.randomBytes(32);
    const collidingToken = collidingBytes.toString('base64url');
    await prisma.preRegistrationInvite.create({
      data: {
        alunoId: decoyLead.id,
        contractId: decoyContractId,
        purpose: 'PRE_REGISTRATION',
        tokenHash: hashInviteToken(collidingToken),
        status: 'SUPERSEDED',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const randomBytesSpy = jest
      .spyOn(crypto, 'randomBytes')
      .mockImplementationOnce(() => collidingBytes as unknown as Buffer);

    try {
      await expect(
        preRegistrationInviteService.regenerateInvite(lead.id, contractId, {})
      ).rejects.toBeTruthy();
    } finally {
      randomBytesSpy.mockRestore();
    }

    // A transação inteira reverteu: o convite original continua ACTIVE e
    // utilizável, e nenhum segundo convite ACTIVE foi criado para o lead.
    const originalAfterFailure = await prisma.preRegistrationInvite.findUniqueOrThrow({
      where: { id: first.summary.id },
    });
    expect(originalAfterFailure.status).toBe('ACTIVE');
    expect(originalAfterFailure.supersededAt).toBeNull();

    const activeInvitesForLead = await prisma.preRegistrationInvite.findMany({
      where: { alunoId: lead.id, purpose: 'PRE_REGISTRATION', status: 'ACTIVE' },
    });
    expect(activeInvitesForLead).toHaveLength(1);
    expect(activeInvitesForLead[0].id).toBe(first.summary.id);

    // O link original continua funcionando normalmente após a falha, sem
    // vazar IDs internos na resposta pública.
    const view = await preRegistrationInviteService.openPublicInvite(first.token);
    expect(view.purpose).toBe('PRE_REGISTRATION');
    expect(view).not.toHaveProperty('alunoId');
    expect(view).not.toHaveProperty('contractId');
  });

  it('revogação exige motivo, é imediata e idempotente', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    const invite = await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});

    await expect(
      preRegistrationInviteService.revokeInvite(lead.id, contractId, '', {})
    ).rejects.toMatchObject({ code: 'INVALID_REASON' });

    const revoked = await preRegistrationInviteService.revokeInvite(
      lead.id,
      contractId,
      'Solicitado pelo aluno',
      {}
    );
    expect(revoked.status).toBe('REVOKED');

    // Idempotência: revogar novamente não é erro.
    const revokedAgain = await preRegistrationInviteService.revokeInvite(
      lead.id,
      contractId,
      'Solicitado pelo aluno novamente',
      {}
    );
    expect(revokedAgain.status).toBe('REVOKED');
    expect(revokedAgain.id).toBe(revoked.id);

    await expect(preRegistrationInviteService.openPublicInvite(invite.token)).rejects.toBeInstanceOf(
      PreRegistrationInvitePublicAccessError
    );
  });

  it('expiração pública é aplicada no instante exato de expiresAt, sem depender de scheduler', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    const invite = await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});

    const stored = await prisma.preRegistrationInvite.findUniqueOrThrow({
      where: { id: invite.summary.id },
    });

    await expect(
      preRegistrationInviteService.openPublicInvite(invite.token, {}, stored.expiresAt)
    ).rejects.toBeInstanceOf(PreRegistrationInvitePublicAccessError);

    const afterRead = await prisma.preRegistrationInvite.findUniqueOrThrow({
      where: { id: invite.summary.id },
    });
    expect(afterRead.status).toBe('EXPIRED');
  });

  it('consolida expiração também nas leituras administrativas e permite novo convite', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    const first = await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});

    await prisma.preRegistrationInvite.update({
      where: { id: first.summary.id },
      data: { expiresAt: new Date(Date.now() - 1_000), status: 'ACTIVE' },
    });

    const summary = await preRegistrationInviteService.getSummary(lead.id, contractId);
    expect(summary?.status).toBe('EXPIRED');
    expect(summary?.allowedActions).toEqual({
      canGenerateFirst: true,
      canRegenerate: false,
      canRevoke: false,
    });

    const history = await preRegistrationInviteService.getHistory(lead.id, contractId);
    expect(history[0].status).toBe('EXPIRED');
    expect(await preRegistrationInviteService.getAllowedActions(lead.id, contractId)).toEqual(
      summary?.allowedActions
    );

    const expirationEvents = await prisma.preRegistrationInviteEvent.findMany({
      where: { inviteId: first.summary.id, eventType: 'EXPIRED_ON_READ' },
    });
    expect(expirationEvents).toHaveLength(1);
    expect(expirationEvents[0].actorIsPublic).toBe(false);
    expect(expirationEvents[0].metadata).toEqual({ source: 'administrative_access' });

    const replacement = await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});
    expect(replacement.summary.status).toBe('ACTIVE');
    await expect(preRegistrationInviteService.openPublicInvite(first.token)).rejects.toBeInstanceOf(
      PreRegistrationInvitePublicAccessError
    );
  });

  it('token inválido e inexistente resultam no mesmo erro público genérico', async () => {
    await expect(preRegistrationInviteService.openPublicInvite('nao-existe')).rejects.toBeInstanceOf(
      PreRegistrationInvitePublicAccessError
    );
    await expect(preRegistrationInviteService.openPublicInvite('')).rejects.toBeInstanceOf(
      PreRegistrationInvitePublicAccessError
    );
  });

  it('convite de outro tenant não é acessível pela consulta administrativa (cross-tenant)', async () => {
    const contractA = await createContract();
    const contractB = await createContract();
    const leadA = await createLeadWithContact(contractA);
    await preRegistrationInviteService.generateFirstInvite(leadA.id, contractA, {});

    await expect(preRegistrationInviteService.getSummary(leadA.id, contractB)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      preRegistrationInviteService.revokeInvite(leadA.id, contractB, 'motivo', {})
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      preRegistrationInviteService.regenerateInvite(leadA.id, contractB, {})
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('primeiro e segundo acesso público são auditados sem token bruto e sem spam de auditoria', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    const invite = await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});

    await preRegistrationInviteService.openPublicInvite(invite.token, {
      ipAddress: '  1.2.3.4  ',
      userAgent: `jest\u0000agent\n${'x'.repeat(400)}`,
    });
    await preRegistrationInviteService.openPublicInvite(invite.token, {
      ipAddress: '1.2.3.4',
      userAgent: 'jest',
    });

    const events = await prisma.preRegistrationInviteEvent.findMany({
      where: { inviteId: invite.summary.id },
      orderBy: { createdAt: 'asc' },
    });

    const firstAccessEvents = events.filter((e) => e.eventType === 'FIRST_ACCESSED');
    expect(firstAccessEvents).toHaveLength(1);
    expect(firstAccessEvents[0].ipAddress).toBe('1.2.3.4');
    expect(firstAccessEvents[0].userAgent).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(firstAccessEvents[0].userAgent?.length).toBeLessThanOrEqual(256);

    // Segundo acesso dentro da janela de throttle não deve gerar novo evento ACCESSED.
    const accessedEvents = events.filter((e) => e.eventType === 'ACCESSED');
    expect(accessedEvents).toHaveLength(0);

    for (const event of events) {
      expect(JSON.stringify(event)).not.toContain(invite.token);
    }
    expect(JSON.stringify(invite.summary)).not.toContain(invite.token);
  });

  it('dois acessos públicos concorrentes registram FIRST_ACCESSED uma única vez', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    const invite = await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});
    const now = new Date();

    const views = await Promise.all([
      preRegistrationInviteService.openPublicInvite(invite.token, { ipAddress: '10.0.0.1' }, now),
      preRegistrationInviteService.openPublicInvite(invite.token, { ipAddress: '10.0.0.2' }, now),
    ]);
    expect(views).toHaveLength(2);
    expect(views.every((view) => view.purpose === 'PRE_REGISTRATION')).toBe(true);

    const firstAccessEvents = await prisma.preRegistrationInviteEvent.findMany({
      where: { inviteId: invite.summary.id, eventType: 'FIRST_ACCESSED' },
    });
    expect(firstAccessEvents).toHaveLength(1);

    const stored = await prisma.preRegistrationInvite.findUniqueOrThrow({
      where: { id: invite.summary.id },
    });
    expect(stored.firstAccessedAt?.toISOString()).toBe(now.toISOString());
    expect(stored.lastAccessAt?.toISOString()).toBe(now.toISOString());
  });

  it('não retorna hash do token na resposta administrativa (resumo/histórico)', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    const invite = await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});
    const summary = await preRegistrationInviteService.getSummary(lead.id, contractId);
    const history = await preRegistrationInviteService.getHistory(lead.id, contractId);

    expect(JSON.stringify(summary)).not.toContain(invite.token);
    expect(JSON.stringify(summary)).not.toMatch(/tokenHash/i);
    expect(JSON.stringify(history)).not.toMatch(/tokenHash/i);
  });

  it('allowedActions do resumo reflete o estado real, inclusive canGenerateFirst quando não há convite ativo', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    const invite = await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});

    const activeSummary = await preRegistrationInviteService.getSummary(lead.id, contractId);
    expect(activeSummary?.allowedActions).toEqual({
      canGenerateFirst: false,
      canRegenerate: true,
      canRevoke: true,
    });

    await preRegistrationInviteService.revokeInvite(lead.id, contractId, 'motivo', {});

    // Sem convite ativo, mas com lead ainda em ciclo compatível e canal de
    // contato: o resumo deve refletir que um novo convite pode ser gerado -
    // e não mais hardcoded como false independentemente do estado real.
    const revokedSummary = await preRegistrationInviteService.getSummary(lead.id, contractId);
    expect(revokedSummary?.allowedActions).toEqual({
      canGenerateFirst: true,
      canRegenerate: false,
      canRevoke: false,
    });

    // Consistente com o endpoint dedicado de ações permitidas.
    const dedicated = await preRegistrationInviteService.getAllowedActions(lead.id, contractId);
    expect(dedicated).toEqual(revokedSummary?.allowedActions);
    void invite;
  });

  it('rate limit bloqueia após o limite e libera quando a janela expira', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const limiter = createPreRegistrationInviteRateLimiter({ windowMs: 1_000, maxRequests: 2 });
    const req = { ip: '9.9.9.9' } as any;
    const next = jest.fn();

    try {
      limiter(req, makeRateLimitResponse(), next);
      limiter(req, makeRateLimitResponse(), next);
      expect(next).toHaveBeenCalledTimes(2);

      const blockedRes = makeRateLimitResponse();
      limiter(req, blockedRes, next);
      expect(next).toHaveBeenCalledTimes(2);
      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.headers['Retry-After']).toBeDefined();

      nowSpy.mockReturnValue(2_001);
      limiter(req, makeRateLimitResponse(), next);
      expect(next).toHaveBeenCalledTimes(3);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('rate limiter limita chaves distintas e remove janelas expiradas', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(5_000);
    const limiter = createPreRegistrationInviteRateLimiter({
      windowMs: 1_000,
      maxRequests: 10,
      maxTrackedKeys: 1,
    });
    const next = jest.fn();

    try {
      limiter({ ip: '192.0.2.1' } as any, makeRateLimitResponse(), next);
      expect(next).toHaveBeenCalledTimes(1);

      const capacityRes = makeRateLimitResponse();
      limiter({ ip: '192.0.2.2' } as any, capacityRes, next);
      expect(capacityRes.statusCode).toBe(429);
      expect(next).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(6_001);
      limiter({ ip: '192.0.2.2' } as any, makeRateLimitResponse(), next);
      expect(next).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
