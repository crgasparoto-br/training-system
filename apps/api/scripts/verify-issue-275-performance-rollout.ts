import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';
import { preRegistrationInviteAdminService } from '../src/modules/pre-registration-invites/pre-registration-invite-admin.service.js';
import { assertTenantPageScanIsProportional } from './issue-275-performance-proportionality.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const createdContractIds: string[] = [];
const createdUserIds: string[] = [];
const pageSize = 20;
let apiProcess: ChildProcess | undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stopApi() {
  if (!apiProcess?.pid) return;
  try {
    process.kill(-apiProcess.pid, 'SIGTERM');
  } catch {
    apiProcess.kill('SIGTERM');
  }
}

async function waitForHealth(port: number) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return;
    } catch {
      // API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`API não respondeu na porta ${port}`);
}

async function startApi(port: number, enabled: boolean) {
  stopApi();
  await new Promise((resolve) => setTimeout(resolve, 300));
  apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      API_PORT: String(port),
      NODE_ENV: 'production',
      JWT_SECRET: 'issue-275-performance-rollout-secret',
      FRONTEND_URL: 'http://127.0.0.1:4173',
      CORS_ORIGINS: 'http://127.0.0.1:4173',
      PRE_REGISTRATION_ENABLED: enabled ? 'true' : 'false',
      PRE_REGISTRATION_TELEMETRY_ENABLED: 'false',
      PRIVACY_NOTICE_URL: 'https://example.test/privacidade',
      PRIVACY_NOTICE_VERSION: '2026-07',
    },
    stdio: 'inherit',
  });
  await waitForHealth(port);
}

async function requestJson(port: number, pathname: string, token?: string) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return { response, body: (await response.json()) as Record<string, unknown> };
}

function flattenPlan(root: Record<string, unknown>): Record<string, unknown>[] {
  const children = Array.isArray(root.Plans) ? root.Plans : [];
  return [
    root,
    ...children.flatMap((child) =>
      child && typeof child === 'object' && !Array.isArray(child)
        ? flattenPlan(child as Record<string, unknown>)
        : []
    ),
  ];
}

async function explain(sql: string, ...parameters: unknown[]) {
  const rows = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': unknown }>>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
    ...parameters
  );
  const value = rows[0]?.['QUERY PLAN'];
  assert(Array.isArray(value) && value[0] && typeof value[0] === 'object', 'Plano inválido');
  const root = (value[0] as Record<string, unknown>).Plan;
  assert(root && typeof root === 'object' && !Array.isArray(root), 'Plano sem raiz');
  const nodes = flattenPlan(root as Record<string, unknown>);
  return {
    rootNode: (root as Record<string, unknown>)['Node Type'],
    actualRows: Number((root as Record<string, unknown>)['Actual Rows'] ?? 0),
    executionTimeMs: Number((value[0] as Record<string, unknown>)['Execution Time'] ?? 0),
    nodes: nodes.map((node) => ({
      nodeType: node['Node Type'],
      relationName: node['Relation Name'],
      indexName: node['Index Name'],
      actualRows: Number(node['Actual Rows'] ?? 0),
      rowsRemovedByFilter: Number(node['Rows Removed by Filter'] ?? 0),
    })),
  };
}

async function cleanup() {
  stopApi();
  await new Promise((resolve) => setTimeout(resolve, 300));
  for (const contractId of [...createdContractIds].reverse()) {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
  }
  for (const userId of [...createdUserIds].reverse()) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

async function main() {
  await mkdir(artifactDir, { recursive: true });
  const contracts = [];
  for (let index = 0; index < 6; index += 1) {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `275-perf-${index}-${suffix}`,
        name: `Academia Performance ${index}`,
      },
    });
    contracts.push(contract);
    createdContractIds.push(contract.id);
  }
  const targetContract = contracts[0];
  assert(targetContract, 'Tenant alvo não criado');

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: targetContract.id,
      name: 'Administrador Performance',
      code: `issue-275-performance-${suffix}`,
      isActive: true,
    },
  });
  const masterUser = await prisma.user.create({
    data: {
      email: `issue-275-performance-${suffix}@example.test`,
      passwordHash: 'not-used',
      type: 'professor',
      profile: { create: { name: 'Administrador Performance' } },
    },
  });
  createdUserIds.push(masterUser.id);
  const masterProfessor = await prisma.professor.create({
    data: {
      userId: masterUser.id,
      contractId: targetContract.id,
      collaboratorFunctionId: collaboratorFunction.id,
      role: 'master',
    },
  });
  const actor = {
    userId: masterUser.id,
    professorId: masterProfessor.id,
    contractId: targetContract.id,
  };

  const candidateRowsPerTenant = 2_000;
  const activeNoiseRows = 2_000;
  const now = Date.now();
  for (let contractIndex = 0; contractIndex < contracts.length; contractIndex += 1) {
    const contract = contracts[contractIndex]!;
    await prisma.aluno.createMany({
      data: Array.from({ length: candidateRowsPerTenant }, (_, index) => {
        const serial = String(contractIndex * candidateRowsPerTenant + index).padStart(8, '0');
        const phone = `55159${serial}`.slice(0, 13);
        return {
          contractId: contract.id,
          status: index % 3 === 0 ? ('INVITED' as const) : ('LEAD' as const),
          leadName: `Lead Performance ${contractIndex}-${index}`,
          leadPhone: phone,
          leadPhoneNormalized: phone,
          leadEmail: `perf-${contractIndex}-${index}-${suffix}@example.test`,
          leadEmailNormalized: `perf-${contractIndex}-${index}-${suffix}@example.test`,
          leadOrigin: 'issue-275-performance',
          lastActivityAt: new Date(now - (activeNoiseRows + index) * 1000),
        };
      }),
    });
  }
  await prisma.aluno.createMany({
    data: Array.from({ length: activeNoiseRows }, (_, index) => ({
      contractId: targetContract.id,
      status: 'ACTIVE_STUDENT' as const,
      leadName: `Aluno ativo de ruído ${index}`,
      lastActivityAt: new Date(now - index * 1000),
    })),
  });
  await prisma.$executeRawUnsafe('ANALYZE "Aluno"');

  const rolloutLeadId = await preRegistrationEnrollmentCreateService.create(actor, {
    name: 'Lead Rollout Preservado',
    phone: '15930000001',
    email: `issue-275-rollout-${suffix}@example.test`,
    origin: 'issue-275-rollout',
    responsibleProfessorId: masterProfessor.id,
  });
  const invitation = await preRegistrationInviteAdminService.generateFirstInvite(
    rolloutLeadId,
    targetContract.id,
    actor
  );
  const inviteRow = await prisma.preRegistrationInvite.findUniqueOrThrow({
    where: { id: invitation.summary.id },
  });
  const targetPhone = `55159${String(42).padStart(8, '0')}`.slice(0, 13);

  const [listPlan, phonePlan, tokenPlan, indexes, totalRows, candidates, targetTotal] =
    await Promise.all([
      explain(
        `SELECT "id", "status" FROM "Aluno"
         WHERE "contractId" = $1 AND "status" <> 'ACTIVE_STUDENT'
         ORDER BY "lastActivityAt" DESC, "id" DESC LIMIT 20`,
        targetContract.id
      ),
      explain(
        'SELECT "id" FROM "Aluno" WHERE "contractId" = $1 AND "leadPhoneNormalized" = $2 LIMIT 20',
        targetContract.id,
        targetPhone
      ),
      explain(
        'SELECT "id" FROM "PreRegistrationInvite" WHERE "tokenHash" = $1 LIMIT 1',
        inviteRow.tokenHash
      ),
      prisma.$queryRaw<
        Array<{ tableName: string; indexName: string; indexDefinition: string }>
      >`
        SELECT tablename AS "tableName", indexname AS "indexName", indexdef AS "indexDefinition"
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('Aluno', 'PreRegistrationInvite')
          AND (
            indexname = 'Aluno_pre_registration_list_idx'
            OR indexdef ILIKE '%contractId%leadPhoneNormalized%'
            OR indexdef ILIKE '%contractId%leadEmailNormalized%'
            OR indexdef ILIKE '%contractId%leadCpfNormalized%'
            OR indexdef ILIKE '%tokenHash%'
          )
        ORDER BY tablename, indexname
      `,
      prisma.aluno.count(),
      prisma.aluno.count({
        where: { contractId: targetContract.id, status: { not: 'ACTIVE_STUDENT' } },
      }),
      prisma.aluno.count({ where: { contractId: targetContract.id } }),
    ]);

  assert(listPlan.rootNode === 'Limit' && listPlan.actualRows <= pageSize, 'Página sem limite');
  assert(
    listPlan.nodes.some((node) => node.indexName === 'Aluno_pre_registration_list_idx'),
    'Plano não utilizou o índice parcial da listagem'
  );
  const alunoNodes = listPlan.nodes.filter((node) => node.relationName === 'Aluno');
  assert(alunoNodes.length > 0, 'Plano não acessou Aluno');
  const scannedRows = Math.max(
    ...alunoNodes.map((node) => node.actualRows + node.rowsRemovedByFilter)
  );
  assert(targetTotal - candidates === activeNoiseRows, 'Ruído ativo do tenant não foi preservado');
  const proportionality = assertTenantPageScanIsProportional({
    pageSize,
    scannedRows,
    tenantCandidateRows: candidates,
  });
  assert(
    phonePlan.nodes.some((node) => String(node.indexName || '').includes('leadPhoneNormalized')),
    'Busca por telefone não utilizou índice'
  );
  assert(
    tokenPlan.nodes.some((node) => String(node.indexName || '').includes('tokenHash')),
    'Lookup de token não utilizou índice'
  );
  assert(
    indexes.some((index) => index.indexName === 'Aluno_pre_registration_list_idx'),
    'Índice parcial da listagem ausente'
  );
  assert(
    indexes.some((index) => index.indexDefinition.includes('leadEmailNormalized')),
    'Índice de e-mail normalizado ausente'
  );
  assert(
    indexes.some((index) => index.indexDefinition.includes('leadCpfNormalized')),
    'Índice de CPF normalizado ausente'
  );
  assert(
    indexes.some((index) => index.indexDefinition.includes('tokenHash')),
    'Índice de token por hash ausente'
  );

  const jwtToken = jwt.sign(
    { userId: masterUser.id, email: masterUser.email, type: 'professor' },
    'issue-275-performance-rollout-secret',
    { expiresIn: '1h' }
  );
  const snapshot = async () => {
    const [aluno, onboardingCount, invite] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: rolloutLeadId } }),
      prisma.studentOnboardingProcess.count({ where: { alunoId: rolloutLeadId } }),
      prisma.preRegistrationInvite.findUniqueOrThrow({ where: { id: invitation.summary.id } }),
    ]);
    return {
      aluno: {
        id: aluno.id,
        status: aluno.status,
        userId: aluno.userId,
        currentPreRegistrationInviteStatus: aluno.currentPreRegistrationInviteStatus,
      },
      onboardingCount,
      invite: {
        id: invite.id,
        alunoId: invite.alunoId,
        contractId: invite.contractId,
        tokenHash: invite.tokenHash,
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString(),
      },
    };
  };
  const before = await snapshot();
  const eventsBefore = await prisma.studentLifecycleEvent.count({ where: { alunoId: rolloutLeadId } });

  await startApi(3006, false);
  const disabledPublic = await requestJson(3006, `/api/v1/pre-cadastro/${invitation.token}`);
  const disabledAdmin = await requestJson(3006, '/api/v1/pre-registration-admin/leads', jwtToken);
  const oldWebApiRoot = await requestJson(3006, '/api/v1');
  for (const result of [disabledPublic, disabledAdmin]) {
    assert(result.response.status === 503, 'Rota não falhou fechada');
    assert(result.response.headers.get('cache-control')?.includes('no-store'), 'Sem no-store');
    assert(result.response.headers.get('referrer-policy') === 'no-referrer', 'Sem no-referrer');
    assert(result.body.error === 'PRE_REGISTRATION_DISABLED', 'Código de rollout instável');
  }
  assert(oldWebApiRoot.response.status === 200, 'API geral incompatível com web anterior');
  assert(JSON.stringify(await snapshot()) === JSON.stringify(before), 'Desligamento alterou dados');
  assert(
    (await prisma.studentLifecycleEvent.count({ where: { alunoId: rolloutLeadId } })) === eventsBefore,
    'Desligamento produziu evento'
  );

  await startApi(3007, true);
  const enabledPublic = await requestJson(3007, `/api/v1/pre-cadastro/${invitation.token}`);
  const enabledAdmin = await requestJson(
    3007,
    `/api/v1/pre-registration-admin/leads?page=1&pageSize=${pageSize}`,
    jwtToken
  );
  assert(enabledPublic.response.status === 200, 'Convite não voltou após reabilitação');
  assert(enabledAdmin.response.status === 200, 'Listagem não voltou após reabilitação');
  assert(JSON.stringify(await snapshot()) === JSON.stringify(before), 'Reabilitação alterou dados');

  const report = {
    schemaVersion: 3,
    kind: 'issue-275-performance-rollout',
    cardinality: {
      tenants: contracts.length,
      candidateRowsPerTenant,
      activeNoiseRows,
      targetTenantTotalRows: targetTotal,
      targetTenantCandidateRows: candidates,
      unrelatedTenantRows: totalRows - targetTotal,
      totalAlunoRows: totalRows,
      pageSize,
      maximumAllowedRowsInListPlan: proportionality.maximumAllowedRows,
      maxRowsObservedInListPlan: scannedRows,
      targetTenantScanRatio: proportionality.scanRatio,
    },
    plans: {
      administrativeList: listPlan,
      normalizedPhoneLookup: phonePlan,
      tokenHashLookup: tokenPlan,
    },
    indexes,
    compatibility: {
      apiNewWithPreviousWebEntryPoint: oldWebApiRoot.response.status,
      webNewAgainstDisabledApiPublic: disabledPublic.response.status,
      webNewAgainstDisabledApiAdmin: disabledAdmin.response.status,
    },
    rollback: {
      disabledWithoutMutation: true,
      reenabledWithoutMutation: true,
      publicInviteRestored: true,
      administrativeListRestored: true,
    },
  };
  await writeFile(
    path.join(artifactDir, 'performance-rollout.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(async () => {
    await cleanup();
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
