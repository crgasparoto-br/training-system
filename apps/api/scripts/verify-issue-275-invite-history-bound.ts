import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';
import { preRegistrationInviteAdminService } from '../src/modules/pre-registration-invites/pre-registration-invite-admin.service.js';
import {
  DEFAULT_PRE_REGISTRATION_INVITE_HISTORY_LIMIT,
  MAX_PRE_REGISTRATION_INVITE_HISTORY_LIMIT,
} from '../src/modules/pre-registration-invites/pre-registration-invite-summary.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
let contractId = '';
let userId = '';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function cleanup() {
  if (contractId) {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
  }
  if (userId) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

async function main() {
  await mkdir(artifactDir, { recursive: true });
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275-history-bound-${suffix}`,
      name: 'Academia Histórico Limitado',
    },
  });
  contractId = contract.id;
  const functionOption = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Administrador Histórico',
      code: `issue-275-history-${suffix}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `history-${suffix}@example.test`,
      passwordHash: 'not-used',
      type: 'professor',
      profile: { create: { name: 'Administrador Histórico' } },
    },
  });
  userId = user.id;
  const professor = await prisma.professor.create({
    data: {
      userId,
      contractId,
      collaboratorFunctionId: functionOption.id,
      role: 'master',
    },
  });
  const actor = { userId, professorId: professor.id, contractId };
  const alunoId = await preRegistrationEnrollmentCreateService.create(actor, {
    name: 'Lead Histórico Limitado',
    phone: '15979000001',
    origin: 'issue-275-history-bound',
    responsibleProfessorId: professor.id,
  });

  const totalRows = 120;
  const baseTime = Date.now() - totalRows * 1_000;
  let previousId: string | undefined;
  for (let index = 0; index < totalRows; index += 1) {
    const active = index === totalRows - 1;
    const createdAt = new Date(baseTime + index * 1_000);
    const invite = await prisma.preRegistrationInvite.create({
      data: {
        alunoId,
        contractId,
        purpose: 'PRE_REGISTRATION',
        tokenHash: crypto
          .createHash('sha256')
          .update(`issue-275-history-${suffix}-${index}`)
          .digest('hex'),
        status: active ? 'ACTIVE' : 'SUPERSEDED',
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1_000),
        supersededAt: active ? undefined : new Date(createdAt.getTime() + 500),
        replacesInviteId: previousId,
        createdByProfessorId: professor.id,
        createdByUserId: userId,
      },
    });
    previousId = invite.id;
  }

  const [defaultHistory, fiveRows, cappedHistory, persistedRows] = await Promise.all([
    preRegistrationInviteAdminService.getHistory(alunoId, contractId, actor),
    preRegistrationInviteAdminService.getHistory(alunoId, contractId, actor, 5),
    preRegistrationInviteAdminService.getHistory(alunoId, contractId, actor, 500),
    prisma.preRegistrationInvite.count({ where: { alunoId, contractId } }),
  ]);

  assert(persistedRows === totalRows, 'Dataset de histórico não atingiu a cardinalidade esperada');
  assert(
    defaultHistory.length === DEFAULT_PRE_REGISTRATION_INVITE_HISTORY_LIMIT,
    'Histórico padrão não respeitou o limite de produção'
  );
  assert(fiveRows.length === 5, 'Histórico não respeitou limite explícito menor');
  assert(
    cappedHistory.length === MAX_PRE_REGISTRATION_INVITE_HISTORY_LIMIT,
    'Histórico não aplicou o teto máximo'
  );
  assert(
    defaultHistory.every(
      (item, index) => index === 0 || item.createdAt <= defaultHistory[index - 1].createdAt
    ),
    'Histórico não manteve ordenação determinística decrescente'
  );
  assert(
    defaultHistory[1]?.replacedByInviteId === defaultHistory[0]?.id,
    'Relacionamento de substituição não foi hidratado no lote limitado'
  );

  const report = {
    schemaVersion: 1,
    kind: 'issue-275-invite-history-bound',
    evidenceSource: 'production-service',
    persistedRows,
    defaultLimit: DEFAULT_PRE_REGISTRATION_INVITE_HISTORY_LIMIT,
    defaultRows: defaultHistory.length,
    requestedLimit: 5,
    requestedRows: fiveRows.length,
    requestedAboveMaximum: 500,
    maximumLimit: MAX_PRE_REGISTRATION_INVITE_HISTORY_LIMIT,
    maximumRows: cappedHistory.length,
    deterministicOrder: true,
    replacementRelationshipHydrated: true,
    fullHistoryReturned: defaultHistory.length === persistedRows,
  };
  await writeFile(
    path.join(artifactDir, 'invite-history-bound.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(1);
  });
