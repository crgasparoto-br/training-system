import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';
import { preRegistrationInviteAdminService } from '../src/modules/pre-registration-invites/pre-registration-invite-admin.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const jwtSecret = 'issue-275-performance-rollout-secret';
const createdContractIds: string[] = [];
const createdUserIds: string[] = [];
let apiProcess: ChildProcess | undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stopProcess(child?: ChildProcess) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

async function waitForUrl(url: string, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`API não respondeu em ${url}`);
}

async function startApi(port: number, enabled: boolean) {
  stopProcess(apiProcess);
  await new Promise((resolve) => setTimeout(resolve, 300));
  apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      API_PORT: String(port),
      NODE_ENV: 'production',
      JWT_SECRET: jwtSecret,
      FRONTEND_URL: 'http://127.0.0.1:4173',
      CORS_ORIGINS: 'http://127.0.0.1:4173',
      PRE_REGISTRATION_ENABLED: enabled ? 'true' : 'false',
      PRE_REGISTRATION_TELEMETRY_ENABLED: 'false',
      PRIVACY_NOTICE_URL: 'https://example.test/privacidade',
      PRIVACY_NOTICE_VERSION: '2026-07',
    },
    stdio: 'inherit',
  });
  await waitForUrl(`http://127.0.0.1:${port}/health`);
}

async function jsonRequest(
  port: number,
  pathname: string,
  options: { token?: string; method?: 'GET' | 'POST'; origin?: string } = {}
) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.origin ? { Origin: options.origin } : {}),
    },
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { response, body };
}

function planRoot(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || !value[0] || typeof value[0] !== 'object') {
    throw new Error('Plano PostgreSQL inválido');
  }
  const plan = (value[0] as Record<string, unknown>).Plan;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('Plano PostgreSQL sem raiz');
  }
  return plan as Record<string, unknown>;
}

function planNodes(root: Record<string, unknown>): Record<string, unknown>[] {
  const result = [root];
  const children = root.Plans;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        result.push(...planNodes(child as Record<string, unknown>));
      }
    }
  }
  return result;
}

function planSummary(value: unknown) {
  const root = planRoot(value);
  const nodes = planNodes(root);
  return {
    rootNode: root['Node Type'],
    actualRows: Number(root['Actual Rows'] ?? 0),
    executionTimeMs: Number((Array.isArray(value) && value[0] && typeof value[0] === 'object'
      ? (value[0] as Record<string, unknown>)['Execution Time']
      : 0) ?? 0),
    nodes: nodes.map((node) => ({
      nodeType: node['Node Type'],
      relationName: node['Relation Name'],
      indexName: node['Index Name'],
      actualRows: Number(node['Actual Rows'] ?? 0),
      rowsRemovedByFilter: Number(node['Rows Removed by Filter'] ?? 0),
    })),
  };
}

async function explain(sql: string, parameters: unknown[]) {
  const rows = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': unknown }>>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
    ...parameters
  );
  return rows[0]?.['QUERY PLAN'];
}

async function cleanup() {
  stopProcess(apiProcess);
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
    createdContractIds.push(contract.id);
    contracts.push(contract);
  }
  const targetContract = contracts[0];

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

  const rowsPerTenant = 300;
  for (let contractIndex = 0; contractIndex < contracts.length; contractIndex += 1) {
    const contract = contracts[contractIndex];
    const data = Array.from({ length: rowsPerTenant }, (_, index) => {
      const serial = String(contractIndex * rowsPerTenant + index).padStart(6, '0');
      const phone = `55159${serial.padStart(8, '0')}`.slice(0, 13);
      return {
        contractId: contract.id,
        status: index % 3 === 0 ? ('INVITED' as const) : ('LEAD' as const),
        leadName: `Lead Performance ${contractIndex}-${index}`,
        leadPhone: phone,
        leadPhoneNormalized: phone,
        leadEmail: `perf-${contractIndex}-${index}-${suffix}@example.test`,
        leadEmailNormalized: `perf-${contractIndex}-${index}-${suffix}@example.test`,
        leadOrigin: 'issue-275-performance',
        lastActivityAt: new Date(Date.now() - index * 1000),
      };
    });
    await prisma.aluno.createMany({ data });
  }

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

  const targetPhone = `55159${String(42).padStart(8, '0')}`.slice(0, 13);
  const [listPlan, phonePlan, tokenPlan, indexes, totalRows] = await Promise.all([
    explain(
      'SELECT "id", "status" FROM "Aluno" WHERE "contractId" = $1 AND "status" IN (\'LEAD\', \'INVITED\') ORDER BY "lastActivityAt" DESC LIMIT 20',
      [targetContract.id]
    ),
    explain(
      'SELECT "id" FROM "Aluno" WHERE "contractId" = $1 AND "leadPhoneNormalized" = $2 LIMIT 20',
      [targetContract.id, targetPhone]
    ),
    explain(
      'SELECT "id" FROM "PreRegistrationInvite" WHERE "tokenHash" = $1 LIMIT 1',
      [await (async () => {
        const row = await prisma.preRegistrationInvite.findUniqueOrThrow({ where: { id: invitation.summary.id } });
        return row.tokenHash;
      })()]
    ),
    prisma.$queryRaw<Array<{ tableName: string; indexName: string; indexDefinition: string }>>`
      SELECT tablename AS "tableName", indexname AS "indexName", indexdef AS "indexDefinition"
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('Aluno', 'PreRegistrationInvite')
        AND (
          indexdef ILIKE '%contractId%status%'
          OR indexdef ILIKE '%contractId%leadPhoneNormalized%'
          OR indexdef ILIKE '%contractId%leadEmailNormalized%'
          OR indexdef ILIKE '%contractId%leadCpfNormalized%'
          OR indexdef ILIKE '%tokenHash%'
        )
      ORDER BY tablename, indexname
    `,
    prisma.aluno.count(),
  ]);

  const listSummary = planSummary(listPlan);
  const phoneSummary = planSummary(phonePlan);
  const tokenSummary = planSummary(tokenPlan);
  assert(listSummary.rootNode === 'Limit', 'Listagem não possui limite no plano');
  assert(listSummary.actualRows <= 20, 'Listagem retornou mais que uma página');
  const listScanned = Math.max(...listSummary.nodes.map((node) => node.actualRows));
  assert(listScanned < totalRows, `Listagem varreu todos os ${totalRows} alunos`);
  assert(
    phoneSummary.nodes.some((node) => String(node.indexName || '').includes('leadPhoneNormalized')),
    'Filtro normalizado de telefone não utilizou índice compatível'
  );
  assert(
    indexes.some((index) => index.indexDefinition.includes('tokenHash')),
    'Índice de lookup do token por hash ausente'
  );
  assert(indexes.some((index) => index.indexDefinition.includes('leadEmailNormalized')), 'Índice de e-mail normalizado ausente');
  assert(indexes.some((index) => index.indexDefinition.includes('leadCpfNormalized')), 'Índice/unique de CPF normalizado ausente');

  const token = jwt.sign(
    { userId: masterUser.id, email: masterUser.email, type: 'professor' },
    jwtSecret,
    { expiresIn: '1h' }
  );
  async function coreSnapshot() {
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
  }
  const snapshotBefore = await coreSnapshot();
  const eventCountBefore = await prisma.studentLifecycleEvent.count({ where: { alunoId: rolloutLeadId } });

  await startApi(3006, false);
  const [disabledPublic, disabledAdmin, oldWebApiRoot] = await Promise.all([
    jsonRequest(3006, `/api/v1/pre-cadastro/${invitation.token}`, {
      origin: 'http://127.0.0.1:4173',
    }),
    jsonRequest(3006, '/api/v1/pre-registration-admin/leads', {
      token,
      origin: 'http://127.0.0.1:4173',
    }),
    jsonRequest(3006, '/api/v1'),
  ]);
  assert(disabledPublic.response.status === 503, 'Rota pública não falhou fechada');
  assert(disabledAdmin.response.status === 503, 'Rota administrativa não falhou fechada');
  assert(oldWebApiRoot.response.status === 200, 'API geral deixou de ser compatível com web anterior');
  for (const result of [disabledPublic, disabledAdmin]) {
    assert(result.response.headers.get('cache-control')?.includes('no-store'), 'Resposta desabilitada sem no-store');
    assert(result.response.headers.get('referrer-policy') === 'no-referrer', 'Resposta desabilitada sem no-referrer');
    assert(result.body.error === 'PRE_REGISTRATION_DISABLED', 'Resposta desabilitada sem código estável');
  }

  const snapshotDisabled = await coreSnapshot();
  const eventCountDisabled = await prisma.studentLifecycleEvent.count({ where: { alunoId: rolloutLeadId } });
  assert(JSON.stringify(snapshotDisabled) === JSON.stringify(snapshotBefore), 'Desligamento alterou dados persistidos');
  assert(eventCountDisabled === eventCountBefore, 'Desligamento produziu evento de domínio');

  await startApi(3007, true);
  const [enabledPublic, enabledAdmin] = await Promise.all([
    jsonRequest(3007, `/api/v1/pre-cadastro/${invitation.token}`),
    jsonRequest(3007, '/api/v1/pre-registration-admin/leads?page=1&pageSize=20', { token }),
  ]);
  assert(enabledPublic.response.status === 200, 'Convite não voltou após reabilitação');
  assert(enabledAdmin.response.status === 200, 'Listagem não voltou após reabilitação');

  const snapshotEnabled = await coreSnapshot();
  assert(JSON.stringify(snapshotEnabled) === JSON.stringify(snapshotBefore), 'Reabilitação alterou dados canônicos persistidos');

  const report = {
    schemaVersion: 1,
    kind: 'issue-275-performance-rollout',
    cardinality: {
      tenants: contracts.length,
      rowsPerTenant,
      totalAlunoRows: totalRows,
      pageSize: 20,
      maxRowsObservedInListPlan: listScanned,
    },
    plans: {
      administrativeList: listSummary,
      normalizedPhoneLookup: phoneSummary,
      tokenHashLookup: tokenSummary,
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
      publicInviteRestored: enabledPublic.response.status === 200,
      administrativeListRestored: enabledAdmin.response.status === 200,
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
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(1);
  });
