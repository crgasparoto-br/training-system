import type { Prisma } from '@prisma/client';
import type { PreRegistrationInvitePublicViewDTO } from '@corrida/types';
import { sanitizePublicInviteAuditActor } from './pre-registration-invite-audit.js';
import { PreRegistrationInvitePublicAccessError } from './pre-registration-invite-errors.js';
import { preRegistrationInvitePrisma } from './pre-registration-invite-store.js';
import { hashInviteToken, timingSafeEqualHash } from './pre-registration-invite-token.js';

const PUBLIC_ACCESS_AUDIT_THROTTLE_MS = 5 * 60 * 1000;

async function lockInviteForAccessAudit(
  tx: Prisma.TransactionClient,
  inviteId: string
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "PreRegistrationInvite"
    WHERE "id" = ${inviteId}
    FOR UPDATE
  `;
  return rows.length === 1;
}

export const preRegistrationInvitePublicService = {
  async openPublicInvite(
    token: string,
    actor: { ipAddress?: string; userAgent?: string } = {},
    now: Date = new Date()
  ): Promise<PreRegistrationInvitePublicViewDTO> {
    if (!token || typeof token !== 'string') {
      throw new PreRegistrationInvitePublicAccessError();
    }

    const tokenHash = hashInviteToken(token);
    const auditActor = sanitizePublicInviteAuditActor(actor, token);

    const invite = await preRegistrationInvitePrisma.$transaction(async (tx) => {
      const candidate = await tx.preRegistrationInvite.findUnique({ where: { tokenHash } });
      if (!candidate || !timingSafeEqualHash(candidate.tokenHash, tokenHash)) return null;
      if (candidate.status !== 'ACTIVE') return { kind: 'unavailable' as const };

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
        const locked = await lockInviteForAccessAudit(tx, candidate.id);
        if (!locked) return { kind: 'unavailable' as const };

        const subsequentAccess = await tx.preRegistrationInvite.updateMany({
          where: {
            id: candidate.id,
            status: 'ACTIVE',
            firstAccessedAt: { not: null },
            expiresAt: { gt: now },
          },
          data: { lastAccessAt: now },
        });
        if (subsequentAccess.count !== 1) return { kind: 'unavailable' as const };

        const recentAccessEvent = await tx.preRegistrationInviteEvent.findFirst({
          where: {
            inviteId: candidate.id,
            eventType: { in: ['FIRST_ACCESSED', 'ACCESSED'] },
            createdAt: { gt: new Date(now.getTime() - PUBLIC_ACCESS_AUDIT_THROTTLE_MS) },
          },
        });
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

    return {
      purpose: invite.purpose,
      expiresAt: invite.expiresAt.toISOString(),
    };
  },
};
