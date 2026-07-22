import { Prisma, PrismaClient, type PreRegistrationInvite } from '@prisma/client';
import {
  PRE_REGISTRATION_INVITE_GENERIC_PUBLIC_ERROR,
  type PreRegistrationInviteActorDTO,
  type PreRegistrationInviteCreationResultDTO,
  type PreRegistrationInviteErrorCode,
  type PreRegistrationInvitePublicViewDTO,
  type PreRegistrationInviteSummaryDTO,
} from '@corrida/types';
import {
  computeInviteExpiresAt,
  generateInviteToken,
  hashInviteToken,
  timingSafeEqualHash,
} from './pre-registration-invite-token.js';
import { sanitizePublicInviteAuditActor } from './pre-registration-invite-audit.js';
import { recordStudentInvitationCreatedInTransaction } from '../alunos/student-lifecycle.service.js';

const prisma = new PrismaClient();
type DbClient = PrismaClient | Prisma.TransactionClient;
type AllowedActions = PreRegistrationInviteSummaryDTO['allowedActions'];

const REASON_MAX_LENGTH = 500;
const PUBLIC_ACCESS_AUDIT_THROTTLE_MS = 5 * 60 * 1000;

export class PreRegistrationInviteError extends Error {
  constructor(
    message: string,
    public readonly code: PreRegistrationInviteErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PreRegistrationInviteError';
  }
}

// Erro dedicado (nunca exposto ao publico) para respostas de abertura publica
// invalida. Mantido separado de PreRegistrationInviteError para impedir que
// qualquer rota administrativa acidentalmente reaproveite uma mensagem
// pensada para o fluxo publico.
export class PreRegistrationInvitePublicAccessError extends Error {
  constructor(message: string = PRE_REGISTRATION_INVITE_GENERIC_PUBLIC_ERROR) {
    super(message);
    this.name = 'PreRegistrationInvitePublicAccessError';
  }
}

function buildInviteUrl(token: string): string {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5200').replace(/\/$/, '');
  return `${base}/pre-cadastro/${token}`;
}

function isUniqueConstraintViolation(error: unknown, indexName: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    (Array.isArray(error.meta?.target)
      ? (error.meta?.target as string[]).some((t) => t.includes(indexName))
      : String(error.meta?.target ?? '').includes(indexName))
  );
}

async function expireActiveInviteIfNeeded(
  alunoId: string,
  client: DbClient,
  now: Date = new Date()
): Promise<boolean> {
  const candidate = await client.preRegistrationInvite.findFirst({
    where: {
      alunoId,
      purpose: 'PRE_REGISTRATION',
      status: 'ACTIVE',
      expiresAt: { lte: now },
    },
    select: { id: true },
  });
  if (!candidate) return false;

  const expired = await client.preRegistrationInvite.updateMany({
    where: {
      id: candidate.id,
      status: 'ACTIVE',
      expiresAt: { lte: now },
    },
    data: { status: 'EXPIRED' },
  });

  if (expired.count === 1) {
    await client.preRegistrationInviteEvent.create({
      data: {
        inviteId: candidate.id,
        eventType: 'EXPIRED_ON_READ',
        actorIsPublic: false,
        metadata: { source: 'administrative_access' },
      },
    });
  }

  return expired.count === 1;
}

async function findActiveInvite(
  alunoId: string,
  client: DbClient,
  now: Date = new Date()
): Promise<PreRegistrationInvite | null> {
  await expireActiveInviteIfNeeded(alunoId, client, now);
  return client.preRegistrationInvite.findFirst({
    where: { alunoId, purpose: 'PRE_REGISTRATION', status: 'ACTIVE' },
  });
}

async function findAlunoInContractOrThrow(alunoId: string, contractId: string, client: DbClient) {
  const aluno = await client.aluno.findFirst({ where: { id: alunoId, contractId } });
  if (!aluno) {
    throw new PreRegistrationInviteError('Registro não encontrado.', 'NOT_FOUND');
  }
  return aluno;
}

async function computeAllowedActions(
  alunoId: string,
  contractId: string,
  client: DbClient,
  now: Date = new Date()
): Promise<AllowedActions> {
  const aluno = await client.aluno.findFirst({ where: { id: alunoId, contractId } });
  if (!aluno) {
    return { canGenerateFirst: false, canRegenerate: false, canRevoke: false };
  }
  const active = await findActiveInvite(alunoId, client, now);
  return {
    canGenerateFirst:
      !active && INVITE_COMPATIBLE_STATUSES.has(aluno.status) && Boolean(aluno.leadPhone || aluno.leadEmail),
    canRegenerate: Boolean(active),
    canRevoke: Boolean(active),
  };
}

async function toSummary(
  invite: PreRegistrationInvite,
  client: DbClient,
  allowedActionsOverride?: AllowedActions
): Promise<PreRegistrationInviteSummaryDTO> {
  const [replacedBy, allowedActions] = await Promise.all([
    client.preRegistrationInvite.findFirst({
      where: { replacesInviteId: invite.id },
      select: { id: true },
    }),
    allowedActionsOverride
      ? Promise.resolve(allowedActionsOverride)
      : computeAllowedActions(invite.alunoId, invite.contractId, client),
  ]);

  return {
    id: invite.id,
    alunoId: invite.alunoId,
    purpose: invite.purpose,
    status: invite.status,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    firstAccessedAt: invite.firstAccessedAt?.toISOString(),
    lastAccessAt: invite.lastAccessAt?.toISOString(),
    completedAt: invite.completedAt?.toISOString(),
    revokedAt: invite.revokedAt?.toISOString(),
    revokedByProfessorId: invite.revokedByProfessorId ?? undefined,
    revocationReason: invite.revocationReason ?? undefined,
    supersededAt: invite.supersededAt?.toISOString(),
    replacesInviteId: invite.replacesInviteId ?? undefined,
    replacedByInviteId: replacedBy?.id,
    createdByProfessorId: invite.createdByProfessorId ?? undefined,
    createdByUserId: invite.createdByUserId ?? undefined,
    linkRecoverable: false,
    allowedActions,
  };
}

async function loadCommittedInviteOrThrow(
  inviteId: string,
  token: string
): Promise<PreRegistrationInvite> {
  const persisted = await prisma.preRegistrationInvite.findUnique({ where: { id: inviteId } });
  const expectedHash = hashInviteToken(token);

  if (
    !persisted ||
    persisted.status !== 'ACTIVE' ||
    !timingSafeEqualHash(persisted.tokenHash, expectedHash)
  ) {
    throw new PreRegistrationInviteError(
      'Não foi possível confirmar a persistência do convite. Tente novamente.',
      'CONCURRENT_MODIFICATION'
    );
  }

  return persisted;
}

/**
 * Ciclo compatível com geração de convite: apenas leads que ainda não
 * concluíram/foram descartados fazem sentido para pré-cadastro.
 */
const INVITE_COMPATIBLE_STATUSES = new Set(['LEAD', 'INVITED', 'PRE_REGISTRATION_IN_PROGRESS']);

function assertHasContactChannel(aluno: { leadPhone: string | null; leadEmail: string | null }) {
  if (!aluno.leadPhone && !aluno.leadEmail) {
    throw new PreRegistrationInviteError(
      'É necessário existir ao menos um canal de contato no cadastro.',
      'PRECONDITION_FAILED'
    );
  }
}

async function createInviteRow(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  actor: PreRegistrationInviteActorDTO,
  replacesInviteId?: string
): Promise<{ invite: PreRegistrationInvite; token: string }> {
  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = computeInviteExpiresAt();

  try {
    const invite = await tx.preRegistrationInvite.create({
      data: {
        alunoId,
        contractId,
        purpose: 'PRE_REGISTRATION',
        tokenHash,
        status: 'ACTIVE',
        expiresAt,
        createdByProfessorId: actor.professorId,
        createdByUserId: actor.userId,
        replacesInviteId,
      },
    });

    await tx.preRegistrationInviteEvent.create({
      data: {
        inviteId: invite.id,
        eventType: 'CREATED',
        actorUserId: actor.userId,
        actorProfessorId: actor.professorId,
        metadata: replacesInviteId ? { replacesInviteId } : undefined,
      },
    });

    return { invite, token };
  } catch (error) {
    if (isUniqueConstraintViolation(error, 'active_person_purpose')) {
      throw new PreRegistrationInviteError(
        'Já existe um convite ativo para esta pessoa e finalidade.',
        'ACTIVE_INVITE_EXISTS'
      );
    }
    throw error;
  }
}

export const preRegistrationInviteService = {
  /** Gera o primeiro convite ativo para a pessoa (lead), na finalidade PRE_REGISTRATION. */
  async generateFirstInvite(
    alunoId: string,
    contractId: string,
    actor: PreRegistrationInviteActorDTO
  ): Promise<PreRegistrationInviteCreationResultDTO> {
    const result = await prisma.$transaction(async (tx) => {
      const aluno = await findAlunoInContractOrThrow(alunoId, contractId, tx);

      if (!INVITE_COMPATIBLE_STATUSES.has(aluno.status)) {
        throw new PreRegistrationInviteError(
          'O ciclo atual não permite gerar convite de pré-cadastro.',
          'PRECONDITION_FAILED',
          { status: aluno.status }
        );
      }
      assertHasContactChannel(aluno);

      const existingActive = await findActiveInvite(alunoId, tx);
      if (existingActive) {
        throw new PreRegistrationInviteError(
          'Já existe um convite ativo para esta pessoa.',
          'ACTIVE_INVITE_EXISTS'
        );
      }

      const { invite, token } = await createInviteRow(tx, alunoId, contractId, actor);

      if (aluno.status === 'LEAD') {
        await recordStudentInvitationCreatedInTransaction(tx, alunoId, contractId, {
          invitationId: invite.id,
          actor,
        });
      }

      return { invite, token };
    });

    const committedInvite = await loadCommittedInviteOrThrow(result.invite.id, result.token);
    const summary = await toSummary(committedInvite, prisma);
    return { summary, token: result.token, url: buildInviteUrl(result.token) };
  },

  /** Regenera o convite: invalida (SUPERSEDED) o anterior e cria o novo, atomicamente. */
  async regenerateInvite(
    alunoId: string,
    contractId: string,
    actor: PreRegistrationInviteActorDTO
  ): Promise<PreRegistrationInviteCreationResultDTO> {
    const result = await prisma.$transaction(async (tx) => {
      await findAlunoInContractOrThrow(alunoId, contractId, tx);
      const now = new Date();

      const current = await findActiveInvite(alunoId, tx, now);
      if (!current) {
        throw new PreRegistrationInviteError(
          'Não existe convite ativo para regenerar.',
          'NOT_FOUND'
        );
      }

      const superseded = await tx.preRegistrationInvite.updateMany({
        where: { id: current.id, status: 'ACTIVE', expiresAt: { gt: now } },
        data: { status: 'SUPERSEDED', supersededAt: now },
      });

      if (superseded.count !== 1) {
        // Outra regeneração/revogação concorrente já alterou este convite.
        throw new PreRegistrationInviteError(
          'O convite foi alterado por outra operação. Recarregue antes de continuar.',
          'CONCURRENT_MODIFICATION'
        );
      }

      await tx.preRegistrationInviteEvent.create({
        data: {
          inviteId: current.id,
          eventType: 'SUPERSEDED',
          actorUserId: actor.userId,
          actorProfessorId: actor.professorId,
        },
      });

      const { invite, token } = await createInviteRow(tx, alunoId, contractId, actor, current.id);
      return { invite, token };
    });

    const committedInvite = await loadCommittedInviteOrThrow(result.invite.id, result.token);
    const summary = await toSummary(committedInvite, prisma);
    return { summary, token: result.token, url: buildInviteUrl(result.token) };
  },

  /** Revoga o convite ativo. Idempotente: revogar novamente não é erro. */
  async revokeInvite(
    alunoId: string,
    contractId: string,
    reason: string,
    actor: PreRegistrationInviteActorDTO
  ): Promise<PreRegistrationInviteSummaryDTO> {
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new PreRegistrationInviteError('O motivo da revogação é obrigatório.', 'INVALID_REASON');
    }
    if (trimmedReason.length > REASON_MAX_LENGTH) {
      throw new PreRegistrationInviteError(
        `O motivo da revogação deve ter no máximo ${REASON_MAX_LENGTH} caracteres.`,
        'INVALID_REASON'
      );
    }

    const invite = await prisma.$transaction(async (tx) => {
      await findAlunoInContractOrThrow(alunoId, contractId, tx);
      const now = new Date();

      const current = await findActiveInvite(alunoId, tx, now);
      if (!current) {
        // Idempotência: se já não há convite ativo, considere a operação
        // bem-sucedida e devolva o estado mais recente (revogado ou não).
        const mostRecent = await tx.preRegistrationInvite.findFirst({
          where: { alunoId, purpose: 'PRE_REGISTRATION' },
          orderBy: { createdAt: 'desc' },
        });
        if (!mostRecent) {
          throw new PreRegistrationInviteError('Não existe convite para revogar.', 'NOT_FOUND');
        }
        return mostRecent;
      }

      const revoked = await tx.preRegistrationInvite.updateMany({
        where: { id: current.id, status: 'ACTIVE', expiresAt: { gt: now } },
        data: {
          status: 'REVOKED',
          revokedAt: now,
          revokedByProfessorId: actor.professorId,
          revocationReason: trimmedReason,
        },
      });

      if (revoked.count === 1) {
        await tx.preRegistrationInviteEvent.create({
          data: {
            inviteId: current.id,
            eventType: 'REVOKED',
            actorUserId: actor.userId,
            actorProfessorId: actor.professorId,
            metadata: { reason: trimmedReason },
          },
        });
      }

      return tx.preRegistrationInvite.findUniqueOrThrow({ where: { id: current.id } });
    });

    return toSummary(invite, prisma);
  },

  /** Resumo do convite mais recente da pessoa (histórico completo via getHistory). */
  async getSummary(alunoId: string, contractId: string): Promise<PreRegistrationInviteSummaryDTO | null> {
    return prisma.$transaction(async (tx) => {
      await findAlunoInContractOrThrow(alunoId, contractId, tx);
      await expireActiveInviteIfNeeded(alunoId, tx);
      const invite = await tx.preRegistrationInvite.findFirst({
        where: { alunoId, contractId, purpose: 'PRE_REGISTRATION' },
        orderBy: { createdAt: 'desc' },
      });
      if (!invite) return null;
      return toSummary(invite, tx);
    });
  },

  /** Histórico completo de convites da pessoa, do mais recente ao mais antigo. */
  async getHistory(alunoId: string, contractId: string): Promise<PreRegistrationInviteSummaryDTO[]> {
    return prisma.$transaction(async (tx) => {
      await findAlunoInContractOrThrow(alunoId, contractId, tx);
      const now = new Date();
      await expireActiveInviteIfNeeded(alunoId, tx, now);
      const [invites, allowedActions] = await Promise.all([
        tx.preRegistrationInvite.findMany({
          where: { alunoId, contractId, purpose: 'PRE_REGISTRATION' },
          orderBy: { createdAt: 'desc' },
        }),
        computeAllowedActions(alunoId, contractId, tx, now),
      ]);
      return Promise.all(invites.map((invite) => toSummary(invite, tx, allowedActions)));
    });
  },

  /** Ações administrativas atualmente permitidas para a pessoa. */
  async getAllowedActions(alunoId: string, contractId: string) {
    return prisma.$transaction(async (tx) => {
      await findAlunoInContractOrThrow(alunoId, contractId, tx);
      return computeAllowedActions(alunoId, contractId, tx);
    });
  },

  /**
   * Abertura pública do convite. Toda falha (token inexistente, hash
   * diferente, expirado, revogado, substituído ou de outro escopo) resulta
   * na MESMA PreRegistrationInvitePublicAccessError, para que a resposta seja
   * indistinguível publicamente.
   */
  async openPublicInvite(
    token: string,
    actor: { ipAddress?: string; userAgent?: string } = {},
    now: Date = new Date()
  ): Promise<PreRegistrationInvitePublicViewDTO> {
    if (!token || typeof token !== 'string') {
      throw new PreRegistrationInvitePublicAccessError();
    }
    const tokenHash = hashInviteToken(token);
    const auditActor = sanitizePublicInviteAuditActor(actor);

    const invite = await prisma.$transaction(async (tx) => {
      // Busca por igualdade de hash (índice único); alterar um caractere do
      // token produz um hash diferente. A comparação em tempo constante evita
      // diferenças de timing após localizar um candidato.
      const candidate = await tx.preRegistrationInvite.findUnique({ where: { tokenHash } });
      if (!candidate || !timingSafeEqualHash(candidate.tokenHash, tokenHash)) {
        return null;
      }

      if (candidate.status !== 'ACTIVE') {
        return { kind: 'unavailable' as const };
      }

      if (candidate.expiresAt <= now) {
        const expired = await tx.preRegistrationInvite.updateMany({
          where: { id: candidate.id, status: 'ACTIVE', expiresAt: { lte: now } },
          data: { status: 'EXPIRED' },
        });
        if (expired.count === 1) {
          await tx.preRegistrationInviteEvent.create({
            data: {
              inviteId: candidate.id,
              eventType: 'EXPIRED_ON_READ',
              actorIsPublic: true,
              metadata: { source: 'public_resolution' },
            },
          });
        }
        return { kind: 'unavailable' as const };
      }

      const firstAccess = await tx.preRegistrationInvite.updateMany({
        where: {
          id: candidate.id,
          status: 'ACTIVE',
          firstAccessedAt: null,
          expiresAt: { gt: now },
        },
        data: { firstAccessedAt: now, lastAccessAt: now },
      });

      if (firstAccess.count === 1) {
        await tx.preRegistrationInviteEvent.create({
          data: {
            inviteId: candidate.id,
            eventType: 'FIRST_ACCESSED',
            actorIsPublic: true,
            ipAddress: auditActor.ipAddress,
            userAgent: auditActor.userAgent,
          },
        });
      } else {
        // A atualização condicional acima é a arbitragem do primeiro acesso:
        // somente uma transação consegue trocar NULL por timestamp. As demais
        // seguem como acessos posteriores, desde que o convite ainda esteja
        // ativo e dentro da validade.
        const subsequentAccess = await tx.preRegistrationInvite.updateMany({
          where: {
            id: candidate.id,
            status: 'ACTIVE',
            firstAccessedAt: { not: null },
            expiresAt: { gt: now },
          },
          data: { lastAccessAt: now },
        });
        if (subsequentAccess.count !== 1) {
          return { kind: 'unavailable' as const };
        }

        const recentAccessEvent = await tx.preRegistrationInviteEvent.findFirst({
          where: {
            inviteId: candidate.id,
            eventType: { in: ['FIRST_ACCESSED', 'ACCESSED'] },
            createdAt: { gt: new Date(now.getTime() - PUBLIC_ACCESS_AUDIT_THROTTLE_MS) },
          },
        });
        // Acessos subsequentes são registrados de forma limitada: sem spam
        // de auditoria dentro da janela de throttle.
        if (!recentAccessEvent) {
          await tx.preRegistrationInviteEvent.create({
            data: {
              inviteId: candidate.id,
              eventType: 'ACCESSED',
              actorIsPublic: true,
              ipAddress: auditActor.ipAddress,
              userAgent: auditActor.userAgent,
            },
          });
        }
      }

      return {
        kind: 'ok' as const,
        purpose: candidate.purpose,
        expiresAt: candidate.expiresAt,
      };
    });

    if (!invite || invite.kind !== 'ok') {
      throw new PreRegistrationInvitePublicAccessError();
    }

    // NUNCA incluir alunoId/contractId (ou qualquer outro identificador
    // interno) na resposta pública - critério de aceite da issue #269.
    return {
      purpose: invite.purpose,
      expiresAt: invite.expiresAt.toISOString(),
    };
  },
};
