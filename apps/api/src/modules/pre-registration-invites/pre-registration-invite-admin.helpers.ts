import { Prisma, type PreRegistrationInvite } from '@prisma/client';
import {
  type PreRegistrationInviteActorDTO,
  type PreRegistrationInviteRevocationDTO,
  type PreRegistrationInviteSummaryDTO,
} from '@corrida/types';
import {
  computeInviteExpiresAt,
  generateInviteToken,
  hashInviteToken,
  timingSafeEqualHash,
} from './pre-registration-invite-token.js';
import { sanitizePreRegistrationInviteRevocationReason } from './pre-registration-invite-audit.js';
import { PreRegistrationInviteError } from './pre-registration-invite-errors.js';
import {
  preRegistrationInvitePrisma,
  type PreRegistrationInviteAllowedActions,
  type PreRegistrationInviteDbClient,
} from './pre-registration-invite-store.js';

export type RevocationInput = PreRegistrationInviteRevocationDTO | string;
export const INVITE_COMPATIBLE_STATUSES = new Set([
  'LEAD',
  'INVITED',
  'PRE_REGISTRATION_IN_PROGRESS',
]);
const REASON_MAX_LENGTH = 500;

export function buildInviteUrl(token: string): string {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5200').replace(/\/$/, '');
  return `${base}/pre-cadastro/${token}`;
}

function isUniqueConstraintViolation(error: unknown, indexName: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    (Array.isArray(error.meta?.target)
      ? (error.meta?.target as string[]).some((target) => target.includes(indexName))
      : String(error.meta?.target ?? '').includes(indexName))
  );
}

export function administrativeAuditData(
  actor: PreRegistrationInviteActorDTO | undefined,
  source: string
) {
  return {
    actorUserId: actor?.userId,
    actorProfessorId: actor?.professorId,
    actorIsPublic: false,
    metadata: {
      source,
      actorType: actor?.userId || actor?.professorId ? 'authenticated' : 'system',
    },
  } as const;
}

export async function expireActiveInviteIfNeeded(
  alunoId: string,
  contractId: string,
  client: PreRegistrationInviteDbClient,
  now: Date = new Date(),
  actor?: PreRegistrationInviteActorDTO
): Promise<boolean> {
  const candidate = await client.preRegistrationInvite.findFirst({
    where: {
      alunoId,
      contractId,
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
      alunoId,
      contractId,
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
        ...administrativeAuditData(actor, 'administrative_access'),
      },
    });
  }

  return expired.count === 1;
}

export async function findActiveInvite(
  alunoId: string,
  contractId: string,
  client: PreRegistrationInviteDbClient,
  now: Date = new Date(),
  actor?: PreRegistrationInviteActorDTO
): Promise<PreRegistrationInvite | null> {
  await expireActiveInviteIfNeeded(alunoId, contractId, client, now, actor);
  return client.preRegistrationInvite.findFirst({
    where: { alunoId, contractId, purpose: 'PRE_REGISTRATION', status: 'ACTIVE' },
  });
}

export async function findAlunoInContractOrThrow(
  alunoId: string,
  contractId: string,
  client: PreRegistrationInviteDbClient
) {
  const aluno = await client.aluno.findFirst({ where: { id: alunoId, contractId } });
  if (!aluno) {
    throw new PreRegistrationInviteError('Registro não encontrado.', 'NOT_FOUND');
  }
  return aluno;
}

export async function computeAllowedActions(
  alunoId: string,
  contractId: string,
  client: PreRegistrationInviteDbClient,
  now: Date = new Date(),
  actor?: PreRegistrationInviteActorDTO
): Promise<PreRegistrationInviteAllowedActions> {
  const aluno = await client.aluno.findFirst({ where: { id: alunoId, contractId } });
  if (!aluno) {
    return { canGenerateFirst: false, canRegenerate: false, canRevoke: false };
  }

  const active = await findActiveInvite(alunoId, contractId, client, now, actor);
  return {
    canGenerateFirst:
      !active &&
      INVITE_COMPATIBLE_STATUSES.has(aluno.status) &&
      Boolean(aluno.leadPhone || aluno.leadEmail),
    canRegenerate: Boolean(active),
    canRevoke: Boolean(active),
  };
}

export async function toSummary(
  invite: PreRegistrationInvite,
  client: PreRegistrationInviteDbClient,
  options: {
    allowedActions?: PreRegistrationInviteAllowedActions;
    actor?: PreRegistrationInviteActorDTO;
  } = {}
): Promise<PreRegistrationInviteSummaryDTO> {
  const [replacedBy, allowedActions] = await Promise.all([
    client.preRegistrationInvite.findFirst({
      where: { replacesInviteId: invite.id },
      select: { id: true },
    }),
    options.allowedActions
      ? Promise.resolve(options.allowedActions)
      : computeAllowedActions(
          invite.alunoId,
          invite.contractId,
          client,
          new Date(),
          options.actor
        ),
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

export async function loadCommittedInviteOrThrow(
  inviteId: string,
  token: string
): Promise<PreRegistrationInvite> {
  const persisted = await preRegistrationInvitePrisma.preRegistrationInvite.findUnique({
    where: { id: inviteId },
  });
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

export function assertHasContactChannel(aluno: {
  leadPhone: string | null;
  leadEmail: string | null;
}) {
  if (!aluno.leadPhone && !aluno.leadEmail) {
    throw new PreRegistrationInviteError(
      'É necessário existir ao menos um canal de contato no cadastro.',
      'PRECONDITION_FAILED'
    );
  }
}

export async function createInviteRow(
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

export function normalizeRevocationInput(input: RevocationInput): {
  inviteId?: string;
  reason: string;
} {
  const isLegacyInput = typeof input === 'string';
  const inviteId = isLegacyInput ? undefined : input.inviteId?.trim();
  const reason = sanitizePreRegistrationInviteRevocationReason(
    isLegacyInput ? input : input.reason
  );

  if (!isLegacyInput && !inviteId) {
    throw new PreRegistrationInviteError(
      'O identificador do convite a revogar é obrigatório.',
      'MISSING_REQUIRED_FIELDS'
    );
  }
  if (!reason) {
    throw new PreRegistrationInviteError(
      'O motivo da revogação é obrigatório.',
      'INVALID_REASON'
    );
  }
  if (reason.length > REASON_MAX_LENGTH) {
    throw new PreRegistrationInviteError(
      `O motivo da revogação deve ter no máximo ${REASON_MAX_LENGTH} caracteres.`,
      'INVALID_REASON'
    );
  }

  return { inviteId, reason };
}

export async function findRevocationTarget(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  input: ReturnType<typeof normalizeRevocationInput>
): Promise<PreRegistrationInvite | null> {
  if (input.inviteId) {
    return tx.preRegistrationInvite.findFirst({
      where: {
        id: input.inviteId,
        alunoId,
        contractId,
        purpose: 'PRE_REGISTRATION',
      },
    });
  }

  const recent = await tx.preRegistrationInvite.findMany({
    where: { alunoId, contractId, purpose: 'PRE_REGISTRATION' },
    orderBy: { createdAt: 'desc' },
    take: 2,
  });

  if (recent.length > 1) {
    throw new PreRegistrationInviteError(
      'Identifique o convite alvo antes de revogar quando houver mais de uma versão.',
      'CONCURRENT_MODIFICATION'
    );
  }
  return recent[0] ?? null;
}
