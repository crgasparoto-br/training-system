import type { PreRegistrationInvite } from '@prisma/client';
import type {
  PreRegistrationInviteActorDTO,
  PreRegistrationInviteSummaryDTO,
} from '@corrida/types';
import { computeAllowedActions } from './pre-registration-invite-admin.helpers.js';
import type {
  PreRegistrationInviteAllowedActions,
  PreRegistrationInviteDbClient,
} from './pre-registration-invite-store.js';

export const DEFAULT_PRE_REGISTRATION_INVITE_HISTORY_LIMIT = 20;
export const MAX_PRE_REGISTRATION_INVITE_HISTORY_LIMIT = 100;

export function normalizePreRegistrationInviteHistoryLimit(value?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PRE_REGISTRATION_INVITE_HISTORY_LIMIT;
  }
  return Math.min(MAX_PRE_REGISTRATION_INVITE_HISTORY_LIMIT, Math.trunc(parsed));
}

/**
 * Serializes a bounded invite page with a constant number of database queries.
 * Replacement relationships are loaded in one batch instead of one query per
 * invite, preventing the administrative detail and history endpoints from
 * degrading as historical versions accumulate.
 */
export async function toInviteSummaries(
  invites: PreRegistrationInvite[],
  client: PreRegistrationInviteDbClient,
  options: {
    allowedActions?: PreRegistrationInviteAllowedActions;
    actor?: PreRegistrationInviteActorDTO;
  } = {}
): Promise<PreRegistrationInviteSummaryDTO[]> {
  if (invites.length === 0) return [];

  const first = invites[0];
  const inviteIds = invites.map((invite) => invite.id);
  const [replacementRows, allowedActions] = await Promise.all([
    client.preRegistrationInvite.findMany({
      where: { replacesInviteId: { in: inviteIds } },
      select: { id: true, replacesInviteId: true },
    }),
    options.allowedActions
      ? Promise.resolve(options.allowedActions)
      : computeAllowedActions(
          first.alunoId,
          first.contractId,
          client,
          new Date(),
          options.actor
        ),
  ]);

  const replacementByOriginal = new Map(
    replacementRows
      .filter(
        (row): row is { id: string; replacesInviteId: string } =>
          typeof row.replacesInviteId === 'string'
      )
      .map((row) => [row.replacesInviteId, row.id])
  );

  return invites.map((invite) => ({
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
    replacedByInviteId: replacementByOriginal.get(invite.id),
    createdByProfessorId: invite.createdByProfessorId ?? undefined,
    createdByUserId: invite.createdByUserId ?? undefined,
    linkRecoverable: false,
    allowedActions,
  }));
}
