import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { contractPublicAccessService } from '../contracts/contract-public-access.service.js';
import { contractPartyLinkService } from '../contracts/contract-party-link.service.js';
import { contractRecordRepository } from '../contracts/contract-record.repository.js';
import {
  prepareOrActivateCollaboratorContractInTransaction,
  prepareOrActivateStudentContractInTransaction,
} from './student-contract-lifecycle-transaction.js';

const prisma = new PrismaClient();
const STUDENT_SCHEDULER_LOCK_ID = 742703001;

/**
 * Executa `fn` sob um SAVEPOINT proprio dentro da transacao externa `tx`.
 *
 * Necessario quando varios itens independentes precisam rodar na MESMA
 * transacao (ex.: para preservar um advisory lock via
 * pg_try_advisory_xact_lock que so vale para a transacao corrente): em
 * Postgres, um erro real de SQL aborta a transacao inteira ate um
 * ROLLBACK/ROLLBACK TO SAVEPOINT. Sem savepoint por item, a falha de um item
 * derrubaria silenciosamente os demais itens ja processados com sucesso no
 * mesmo lote.
 *
 * Em caso de falha, reverte apenas ate o savepoint (preservando o trabalho
 * anterior da mesma transacao) e retorna o resultado de falha construido por
 * `onError`, em vez de propagar a excecao.
 */
async function withSavepoint<TSuccess, TFailure>(
  tx: Prisma.TransactionClient,
  savepointName: string,
  fn: () => Promise<TSuccess>,
  onError: (error: unknown) => TFailure
): Promise<{ ok: true; value: TSuccess } | { ok: false; value: TFailure }> {
  const quotedName = `"${savepointName}"`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${quotedName}`);
  try {
    const value = await fn();
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${quotedName}`);
    return { ok: true, value };
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${quotedName}`);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${quotedName}`);
    return { ok: false, value: onError(error) };
  }
}

type ContractActor = {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
};

type PublicSignatureInput = {
  signerName: string;
  signerCpf: string;
  signerEmail?: string;
};

const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');
const normalizeDocument = (value?: string | null) => value?.replace(/\D/gu, '') || '';
const hashDocument = (html: string) =>
  crypto.createHash('sha256').update(html).digest('hex');

export const studentContractLifecycleService = {
  async signPublicContract(
    token: string,
    data: PublicSignatureInput,
    actor: ContractActor = {}
  ) {
    const signerName = String(data?.signerName || '').trim();
    const signerCpf = normalizeDocument(data?.signerCpf);
    const signerEmail = String(data?.signerEmail || '').trim() || null;

    if (!signerName) throw new Error('Informe o nome completo para assinar');
    if (signerCpf.length !== 11) throw new Error('Informe um CPF válido para assinar');

    const tokenDigest = hashToken(token);
    const contract = await contractRecordRepository.findByPublicTokenHash(tokenDigest, prisma);
    if (!contract) throw new Error('Link inválido ou já utilizado');

    if (contract.publicTokenExpiresAt && contract.publicTokenExpiresAt < new Date()) {
      await contractPublicAccessService.open(token, actor, prisma, new Date());
      throw new Error('Link expirado');
    }
    if (contract.status === 'SIGNED') throw new Error('Contrato já assinado');
    if (contract.status === 'CANCELLED' || contract.status === 'EXPIRED') {
      throw new Error('Contrato não está disponível para assinatura');
    }

    const link = await contractPartyLinkService.resolveByGeneratedContractId(contract.id, prisma);
    if (!link) throw new Error('Vínculo do documento contratual não encontrado');

    const signedAt = new Date();
    const documentHash = contract.documentHash || hashDocument(contract.renderedHtml);

    const result = await prisma.$transaction(async (tx) => {
      const freshContract = await contractRecordRepository.findById(contract.id, tx);

      if (!freshContract || freshContract.publicTokenHash !== tokenDigest) {
        throw new Error('Link inválido ou já utilizado');
      }
      if (freshContract.publicTokenExpiresAt && freshContract.publicTokenExpiresAt < signedAt) {
        return { kind: 'expired' as const };
      }
      if (freshContract.status === 'SIGNED') throw new Error('Contrato já assinado');
      if (freshContract.status === 'CANCELLED' || freshContract.status === 'EXPIRED') {
        throw new Error('Contrato não está disponível para assinatura');
      }

      const claimed = await tx.contract.updateMany({
        where: {
          id: contract.id,
          publicTokenHash: tokenDigest,
          status: { notIn: ['SIGNED', 'CANCELLED', 'EXPIRED'] },
        },
        data: {
          status: 'SIGNED',
          signedAt,
          documentHash,
          publicTokenHash: null,
          publicTokenExpiresAt: null,
        },
      });
      if (claimed.count !== 1) throw new Error('Link inválido ou já utilizado');

      const signature = await tx.contractSignature.create({
        data: {
          contractId: contract.id,
          signerName,
          signerCpf,
          signerEmail,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          documentHash,
          acceptedAt: signedAt,
        },
      });

      let effectiveAt: Date;
      let scheduled: boolean;
      let linkStatus: string;

      if (link.partyType === 'STUDENT') {
        const lifecycle = await prepareOrActivateStudentContractInTransaction(
          tx,
          link.linkId,
          signedAt
        );
        effectiveAt = lifecycle.effectiveAt ?? signedAt;
        scheduled = lifecycle.reason === 'scheduled_start';
        linkStatus = lifecycle.studentContract.status;
      } else {
        const lifecycle = await prepareOrActivateCollaboratorContractInTransaction(
          tx,
          link.linkId,
          signedAt
        );
        effectiveAt = lifecycle.effectiveAt ?? signedAt;
        scheduled = lifecycle.reason === 'scheduled_start';
        linkStatus = lifecycle.collaboratorContract.status;
      }

      await tx.contractAuditLog.create({
        data: {
          contractId: contract.id,
          actorUserId: actor.userId,
          action: 'SIGNED',
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          details: {
            signatureId: signature.id,
            partyType: link.partyType,
            partyId: link.partyId,
            effectiveAt: effectiveAt.toISOString(),
            scheduled,
          },
        },
      });

      return {
        kind: 'signed' as const,
        value: {
          signature,
          activation: {
            effectiveAt: effectiveAt.toISOString(),
            scheduled,
            partyType: link.partyType,
            linkStatus,
            ...(link.partyType === 'STUDENT' ? { studentContractStatus: linkStatus } : {}),
          },
        },
      };
    });

    if (result.kind === 'expired') {
      await contractPublicAccessService.open(token, actor, prisma, signedAt);
      throw new Error('Link expirado');
    }
    return result.value;
  },

  async prepareOrActivateStudentContract(studentContractId: string, now = new Date()) {
    return prisma.$transaction((tx) =>
      prepareOrActivateStudentContractInTransaction(tx, studentContractId, now)
    );
  },

  async prepareOrActivateCollaboratorContract(collaboratorContractId: string, now = new Date()) {
    return prisma.$transaction((tx) =>
      prepareOrActivateCollaboratorContractInTransaction(tx, collaboratorContractId, now)
    );
  },

  async activateDueSignedContracts(now = new Date()) {
    const studentCycle = await prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>(Prisma.sql`
          SELECT pg_try_advisory_xact_lock(
            CAST(${STUDENT_SCHEDULER_LOCK_ID} AS bigint)
          ) AS "acquired"
        `);
        if (!lock?.acquired) {
          return {
            checked: 0,
            activated: 0,
            failures: [] as Array<{
              partyType: 'STUDENT';
              linkId: string;
              error: string;
            }>,
          };
        }

        const studentCandidates = await tx.studentContract.findMany({
          where: {
            status: 'pending_signature',
            signedAt: { not: null },
            startDate: { lte: now },
            contract: { status: 'SIGNED' },
          },
          select: { id: true },
          orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
        });
        let activated = 0;
        const failures: Array<{
          partyType: 'STUDENT';
          linkId: string;
          error: string;
        }> = [];

        // Todos os candidatos do lote rodam dentro desta unica transacao externa
        // (necessaria para manter o advisory lock via pg_try_advisory_xact_lock,
        // que serializa execucoes concorrentes do scheduler) -- por isso cada
        // candidato roda sob um SAVEPOINT proprio via withSavepoint, isolando a
        // falha de um candidato dos demais candidatos validos do mesmo lote.
        let savepointSequence = 0;
        for (const candidate of studentCandidates) {
          savepointSequence += 1;
          const outcome = await withSavepoint(
            tx,
            `sp_student_activation_${savepointSequence}`,
            () => prepareOrActivateStudentContractInTransaction(tx, candidate.id, now),
            (error) => ({
              partyType: 'STUDENT' as const,
              linkId: candidate.id,
              error: error instanceof Error ? error.message : 'Erro desconhecido',
            })
          );
          if (outcome.ok) {
            if (outcome.value.reason === 'activated') activated += 1;
          } else {
            failures.push(outcome.value);
          }
        }

        return {
          checked: studentCandidates.length,
          activated,
          failures,
        };
      },
      { timeout: 30_000 }
    );

    const collaboratorCandidates = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT cc."id"
      FROM "CollaboratorContract" cc
      JOIN "GeneratedContract" gc ON gc."id" = cc."contractId"
      WHERE cc."status" = 'pending_signature'::"CollaboratorContractStatus"
        AND cc."signedAt" IS NOT NULL
        AND cc."startDate" <= ${now}
        AND gc."status" = 'SIGNED'::"ContractStatus"
      ORDER BY cc."startDate" ASC, cc."createdAt" ASC
    `);

    let activated = studentCycle.activated;
    const failures: Array<{
      partyType: 'STUDENT' | 'COLLABORATOR';
      linkId: string;
      error: string;
    }> = [...studentCycle.failures];

    for (const candidate of collaboratorCandidates) {
      try {
        const result = await prisma.$transaction((tx) =>
          prepareOrActivateCollaboratorContractInTransaction(tx, candidate.id, now)
        );
        if (result.reason === 'activated') activated += 1;
      } catch (error) {
        failures.push({
          partyType: 'COLLABORATOR',
          linkId: candidate.id,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    return {
      checked: studentCycle.checked + collaboratorCandidates.length,
      activated,
      failures,
    };
  },
};
