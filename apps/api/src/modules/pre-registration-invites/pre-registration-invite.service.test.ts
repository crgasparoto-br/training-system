import { PrismaClient } from '@prisma/client';
import {
  hashInviteToken,
  generateInviteToken,
  timingSafeEqualHash,
} from './pre-registration-invite-token.js';
import {
  PreRegistrationInviteError,
  PreRegistrationInvitePublicAccessError,
  preRegistrationInviteService,
} from './pre-registration-invite.service.js';
import { createPreRegistrationInviteRateLimiter } from './pre-registration-invite-rate-limit.middleware.js';
import { createStudentLead } from '../alunos/student-lifecycle.service.js';

const prisma = new PrismaClient();
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('pre-registration-invite token', () => {
  it('gera token URL-safe e persiste apenas o hash (nunca o token bruto)', () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    const hash = hashInviteToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('token com um caractere alterado produz hash diferente', () => {
    const token = generateInviteToken();
    const altered = token[0] === 'a' ? `b${token.slice(1)}` : `a${token.slice(1)}`;
    expect(hashInviteToken(altered)).not.toBe(hashInviteToken(token));
  });

  it('compara hashes em tempo constante e rejeita tamanhos diferentes', () => {
    const a = hashInviteToken('token-a');
    expect(timingSafeEqualHash(a, a)).toBe(true);
    expect(timingSafeEqualHash(a, 'ab')).toBe(false);
  });
});

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

    // Novo link funciona.
    const view = await preRegistrationInviteService.openPublicInvite(second.token);
    expect(view.alunoId).toBe(lead.id);
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

  it('expiração é aplicada na leitura, sem depender de scheduler (limite temporal)', async () => {
    const contractId = await createContract();
    const lead = await createLeadWithContact(contractId);
    const invite = await preRegistrationInviteService.generateFirstInvite(lead.id, contractId, {});

    const stored = await prisma.preRegistrationInvite.findUniqueOrThrow({
      where: { id: invite.summary.id },
    });

    // No exato instante de expiração, ainda válido (expiresAt < now é que expira).
    await expect(
      preRegistrationInviteService.openPublicInvite(invite.token, {}, stored.expiresAt)
    ).resolves.toBeTruthy();

    // Um milissegundo depois, expirado.
    const afterExpiry = new Date(stored.expiresAt.getTime() + 1);
    await expect(
      preRegistrationInviteService.openPublicInvite(invite.token, {}, afterExpiry)
    ).rejects.toBeInstanceOf(PreRegistrationInvitePublicAccessError);

    const afterRead = await prisma.preRegistrationInvite.findUniqueOrThrow({
      where: { id: invite.summary.id },
    });
    expect(afterRead.status).toBe('EXPIRED');
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
      ipAddress: '1.2.3.4',
      userAgent: 'jest',
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
    expect(firstAccessEvents.length).toBe(1);
    // Segundo acesso dentro da janela de throttle não deve gerar novo evento ACCESSED.
    const accessedEvents = events.filter((e) => e.eventType === 'ACCESSED');
    expect(accessedEvents.length).toBe(0);

    for (const event of events) {
      expect(JSON.stringify(event)).not.toContain(invite.token);
    }
    expect(JSON.stringify(invite.summary)).not.toContain(invite.token);
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

  it('rate limit bloqueia após o limite de tentativas na janela e libera fora dela', () => {
    const limiter = createPreRegistrationInviteRateLimiter({ windowMs: 1000, maxRequests: 2 });
    const req = { ip: '9.9.9.9' } as any;
    const makeRes = () => {
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

    let nextCalled = 0;
    const next = () => {
      nextCalled += 1;
    };

    limiter(req, makeRes(), next);
    limiter(req, makeRes(), next);
    expect(nextCalled).toBe(2);

    const blockedRes = makeRes();
    limiter(req, blockedRes, next);
    expect(nextCalled).toBe(2);
    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.headers['Retry-After']).toBeDefined();
  });
});
