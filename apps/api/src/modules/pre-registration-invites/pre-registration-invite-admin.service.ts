import type {
  PreRegistrationInviteActorDTO,
  PreRegistrationInviteCreationResultDTO,
  PreRegistrationInviteSummaryDTO,
} from '@corrida/types';
import { recordStudentInvitationCreatedInTransaction } from '../alunos/student-lifecycle.service.js';
import { PreRegistrationInviteError } from './pre-registration-invite-errors.js';
import {
  INVITE_COMPATIBLE_STATUSES,
  administrativeAuditData,
  assertHasContactChannel,
  buildInviteUrl,
  computeAllowedActions,
  createInviteRow,
  expireActiveInviteIfNeeded,
  findActiveInvite,
  findAlunoInContractOrThrow,
  findRevocationTarget,
  loadCommittedInviteOrThrow,
  normalizeRevocationInput,
  toSummary,
  type RevocationInput,
} from './pre-registration-invite-admin.helpers.js';
import {
  preRegistrationInvitePrisma,
  type PreRegistrationInviteAllowedActions,
} from './pre-registration-invite-store.js';
import {
  normalizePreRegistrationInviteHistoryLimit,
  toInviteSummaries,
} from './pre-registration-invite-summary.js';

export const preRegistrationInviteAdminService = {
  async generateFirstInvite(
    alunoId: string,
    contractId: string,
    actor: PreRegistrationInviteActorDTO
  ): Promise<PreRegistrationInviteCreationResultDTO> {
    const result = await preRegistrationInvitePrisma.$transaction(async (tx) => {
      const aluno = await findAlunoInContractOrThrow(alunoId, contractId, tx);

      if (!INVITE_COMPATIBLE_STATUSES.has(aluno.status)) {
        throw new PreRegistrationInviteError(
          'O ciclo atual não permite gerar convite de pré-cadastro.',
          'PRECONDITION_FAILED',
          { status: aluno.status }
        );
      }
      assertHasContactChannel(aluno);

      const existingActive = await findActiveInvite(alunoId, contractId, tx, new Date(), actor);
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
    const summary = await toSummary(committedInvite, preRegistrationInvitePrisma, { actor });
    return { summary, token: result.token, url: buildInviteUrl(result.token) };
  },

  async regenerateInvite(
    alunoId: string,
    contractId: string,
    actor: PreRegistrationInviteActorDTO
  ): Promise<PreRegistrationInviteCreationResultDTO> {
    const result = await preRegistrationInvitePrisma.$transaction(async (tx) => {
      await findAlunoInContractOrThrow(alunoId, contractId, tx);
      const now = new Date();

      const current = await findActiveInvite(alunoId, contractId, tx, now, actor);
      if (!current) {
        throw new PreRegistrationInviteError(
          'Não existe convite ativo para regenerar.',
          'NOT_FOUND'
        );
      }

      const superseded = await tx.preRegistrationInvite.updateMany({
        where: {
          id: current.id,
          alunoId,
          contractId,
          status: 'ACTIVE',
          expiresAt: { gt: now },
        },
        data: { status: 'SUPERSEDED', supersededAt: now },
      });

      if (superseded.count !== 1) {
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
    const summary = await toSummary(committedInvite, preRegistrationInvitePrisma, { actor });
    return { summary, token: result.token, url: buildInviteUrl(result.token) };
  },

  async revokeInvite(
    alunoId: string,
    contractId: string,
    input: RevocationInput,
    actor: PreRegistrationInviteActorDTO
  ): Promise<PreRegistrationInviteSummaryDTO> {
    const normalized = normalizeRevocationInput(input);

    const result = await preRegistrationInvitePrisma.$transaction(async (tx) => {
      await findAlunoInContractOrThrow(alunoId, contractId, tx);
      const now = new Date();
      const target = await findRevocationTarget(tx, alunoId, contractId, normalized);

      if (!target) {
        return { kind: 'not-found' as const };
      }
      if (target.status === 'REVOKED') {
        return { kind: 'ok' as const, invite: target };
      }
      if (target.status === 'ACTIVE' && target.expiresAt <= now) {
        const expired = await tx.preRegistrationInvite.updateMany({
          where: {
            id: target.id,
            alunoId,
            contractId,
            status: 'ACTIVE',
            expiresAt: { lte: now },
          },
          data: { status: 'EXPIRED' },
        });
        if (expired.count === 1) {
          await tx.preRegistrationInviteEvent.create({
            data: {
              inviteId: target.id,
              eventType: 'EXPIRED_ON_READ',
              ...administrativeAuditData(actor, 'administrative_revocation'),
            },
          });
        }
        return { kind: 'conflict' as const };
      }
      if (target.status !== 'ACTIVE') {
        return { kind: 'conflict' as const };
      }

      const revoked = await tx.preRegistrationInvite.updateMany({
        where: {
          id: target.id,
          alunoId,
          contractId,
          status: 'ACTIVE',
          expiresAt: { gt: now },
        },
        data: {
          status: 'REVOKED',
          revokedAt: now,
          revokedByProfessorId: actor.professorId,
          revocationReason: normalized.reason,
        },
      });

      if (revoked.count !== 1) {
        const concurrentlyChanged = await tx.preRegistrationInvite.findUnique({
          where: { id: target.id },
        });
        if (concurrentlyChanged?.status === 'REVOKED') {
          return { kind: 'ok' as const, invite: concurrentlyChanged };
        }
        return { kind: 'conflict' as const };
      }

      await tx.preRegistrationInviteEvent.create({
        data: {
          inviteId: target.id,
          eventType: 'REVOKED',
          actorUserId: actor.userId,
          actorProfessorId: actor.professorId,
          metadata: { source: 'administrative_revocation' },
        },
      });

      const invite = await tx.preRegistrationInvite.findUniqueOrThrow({
        where: { id: target.id },
      });
      return { kind: 'ok' as const, invite };
    });

    if (result.kind === 'not-found') {
      throw new PreRegistrationInviteError('Não existe convite para revogar.', 'NOT_FOUND');
    }
    if (result.kind === 'conflict') {
      throw new PreRegistrationInviteError(
        'O convite alvo não está mais ativo. Recarregue antes de continuar.',
        'CONCURRENT_MODIFICATION'
      );
    }

    return toSummary(result.invite, preRegistrationInvitePrisma, { actor });
  },

  async getSummary(
    alunoId: string,
    contractId: string,
    actor?: PreRegistrationInviteActorDTO,
    now: Date = new Date()
  ): Promise<PreRegistrationInviteSummaryDTO | null> {
    return preRegistrationInvitePrisma.$transaction(async (tx) => {
      await findAlunoInContractOrThrow(alunoId, contractId, tx);
      await expireActiveInviteIfNeeded(alunoId, contractId, tx, now, actor);

      const [invite, allowedActions] = await Promise.all([
        tx.preRegistrationInvite.findFirst({
          where: { alunoId, contractId, purpose: 'PRE_REGISTRATION' },
          orderBy: { createdAt: 'desc' },
        }),
        computeAllowedActions(alunoId, contractId, tx, now, actor),
      ]);

      if (!invite) return null;
      return toSummary(invite, tx, { allowedActions, actor });
    });
  },

  async getHistory(
    alunoId: string,
    contractId: string,
    actor?: PreRegistrationInviteActorDTO,
    limit?: number
  ): Promise<PreRegistrationInviteSummaryDTO[]> {
    const boundedLimit = normalizePreRegistrationInviteHistoryLimit(limit);
    return preRegistrationInvitePrisma.$transaction(async (tx) => {
      await findAlunoInContractOrThrow(alunoId, contractId, tx);
      const now = new Date();
      await expireActiveInviteIfNeeded(alunoId, contractId, tx, now, actor);
      const [invites, allowedActions] = await Promise.all([
        tx.preRegistrationInvite.findMany({
          where: { alunoId, contractId, purpose: 'PRE_REGISTRATION' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: boundedLimit,
        }),
        computeAllowedActions(alunoId, contractId, tx, now, actor),
      ]);
      return toInviteSummaries(invites, tx, { allowedActions, actor });
    });
  },

  async getAllowedActions(
    alunoId: string,
    contractId: string,
    actor?: PreRegistrationInviteActorDTO
  ): Promise<PreRegistrationInviteAllowedActions> {
    return preRegistrationInvitePrisma.$transaction(async (tx) => {
      await findAlunoInContractOrThrow(alunoId, contractId, tx);
      return computeAllowedActions(alunoId, contractId, tx, new Date(), actor);
    });
  },
};
