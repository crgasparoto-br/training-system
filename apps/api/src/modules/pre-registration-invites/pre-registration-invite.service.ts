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
import { recordStudentInvitationCreated } from '../alunos/student-lifecycle.service.js';

const prisma = new PrismaClient();
type DbClient = PrismaClient | Prisma.TransactionClient;

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

async function findActiveInvite(
  alunoId: string,
  client: DbClient
): Promise<PreRegistrationInvite | null> {
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

async function toSummary(
  invite: PreRegistrationInvite,
  client: DbClient
): Promise<PreRegistrationInviteSummaryDTO> {
  const replacedBy = await client.preRegistrationInvite.findFirst({
    where: { replacesInviteId: invite.id },
    select: { id: true },
  });

  const allowedActions = {
    canGenerateFirst: false,
    canRegenerate: invite.status === 'ACTIVE',
    canRevoke: invite.status === 'ACTIVE',
  };

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
        await recordStudentInvitationCreated(alunoId, contractId, {
          invitationId: invite.id,
          actor,
        });
      }

      return { invite, token };
    });

    const summary = await toSummary(result.invite, prisma);
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

      const current = await findActiveInvite(alunoId, tx);
      if (!current) {
        throw new PreRegistrationInviteError(
          'Não existe convite ativo para regenerar.',
          'NOT_FOUND'
        );
      }

      const superseded = await tx.preRegistrationInvite.updateMany({
        where: { id: current.id, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED', supersededAt: new Date() },
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

    const summary = await toSummary(result.invite, prisma);
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

      const current = await findActiveInvite(alunoId, tx);
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
        where: { id: current.id, status: 'ACTIVE' },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
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
    await findAlunoInContractOrThrow(alunoId, contractId, prisma);
    const invite = await prisma.preRegistrationInvite.findFirst({
      where: { alunoId, contractId, purpose: 'PRE_REGISTRATION' },
      orderBy: { createdAt: 'desc' },
    });
    if (!invite) return null;
    return toSummary(invite, prisma);
  },

  /** Histórico completo de convites da pessoa, do mais recente ao mais antigo. */
  async getHistory(alunoId: string, contractId: string): Promise<PreRegistrationInviteSummaryDTO[]> {
    await findAlunoInContractOrThrow(alunoId, contractId, prisma);
    const invites = await prisma.preRegistrationInvite.findMany({
      where: { alunoId, contractId, purpose: 'PRE_REGISTRATION' },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(invites.map((invite) => toSummary(invite, prisma)));
  },

  /** Ações administrativas atualmente permitidas para a pessoa. */
  async getAllowedActions(alunoId: string, contractId: string) {
    const aluno = await findAlunoInContractOrThrow(alunoId, contractId, prisma);
    const active = await findActiveInvite(alunoId, prisma);
    return {
      canGenerateFirst:
        !active && INVITE_COMPATIBLE_STATUSES.has(aluno.status) && Boolean(aluno.leadPhone || aluno.leadEmail),
      canRegenerate: Boolean(active),
      canRevoke: Boolean(active),
    };
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

    const invite = await prisma.$transaction(async (tx) => {
      // Busca por igualdade de hash (índice único); a comparação relevante
      // contra manipulação de string acontece no próprio hash - alterar um
      // caractere do token produz um hash completamente diferente, então
      // não há necessidade de escanear e comparar linha a linha. Ainda
      // assim, valida com timingSafeEqualHash para não expor timing entre
      // "não encontrado" e "encontrado, mas divergente".
      const candidate = await tx.preRegistrationInvite.findUnique({ where: { tokenHash } });
      if (!candidate || !timingSafeEqualHash(candidate.tokenHash, tokenHash)) {
        return null;
      }

      if (candidate.status !== 'ACTIVE') {
        return { kind: 'unavailable' as const };
      }

      if (candidate.expiresAt < now) {
        await tx.preRegistrationInvite.updateMany({
          where: { id: candidate.id, status: 'ACTIVE' },
          data: { status: 'EXPIRED' },
        });
        await tx.preRegistrationInviteEvent.create({
          data: { inviteId: candidate.id, eventType: 'EXPIRED_ON_READ', actorIsPublic: true },
        });
        return { kind: 'unavailable' as const };
      }

      const isFirstAccess = !candidate.firstAccessedAt;
      if (isFirstAccess) {
        await tx.preRegistrationInvite.update({
          where: { id: candidate.id },
          data: { firstAccessedAt: now, lastAccessAt: now },
        });
        await tx.preRegistrationInviteEvent.create({
          data: {
            inviteId: candidate.id,
            eventType: 'FIRST_ACCESSED',
            actorIsPublic: true,
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
          },
        });
      } else {
        await tx.preRegistrationInvite.update({
          where: { id: candidate.id },
          data: { lastAccessAt: now },
        });

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
              ipAddress: actor.ipAddress,
              userAgent: actor.userAgent,
            },
          });
        }
      }

      return {
        kind: 'ok' as const,
        alunoId: candidate.alunoId,
        contractId: candidate.contractId,
        purpose: candidate.purpose,
        expiresAt: candidate.expiresAt,
      };
    });

    if (!invite || invite.kind !== 'ok') {
      throw new PreRegistrationInvitePublicAccessError();
    }

    return {
      alunoId: invite.alunoId,
      contractId: invite.contractId,
      purpose: invite.purpose,
      expiresAt: invite.expiresAt.toISOString(),
    };
  },
};
