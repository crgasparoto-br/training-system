import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';
import { preRegistrationInviteAdminService } from '../src/modules/pre-registration-invites/pre-registration-invite-admin.service.js';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const apiUrl = 'http://127.0.0.1:3012';
const jwtSecret = 'issue-275-endpoint-performance-secret';
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
let contractId = '';
let adminUserId = '';
let studentUserId = '';
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

async function waitForApi(timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if ((await fetch(`${apiUrl}/health`)).ok) return;
    } catch {
      // API ainda iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('API de desempenho não iniciou');
}

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Number((sorted[index] ?? 0).toFixed(3));
}

async function timedRequest(input: {
  pathname: string;
  token?: string;
  method?: 'GET' | 'POST';
  body?: unknown;
}) {
  const startedAt = performance.now();
  const response = await fetch(`${apiUrl}/api/v1${input.pathname}`, {
    method: input.method ?? 'GET',
    headers: {
      ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
      ...(input.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  await response.arrayBuffer();
  return {
    status: response.status,
    durationMs: performance.now() - startedAt,
  };
}

async function sampleEndpoint(input: {
  name: string;
  expectedStatuses: number[];
  repetitions?: number;
  pathname: string;
  token?: string;
  method?: 'GET' | 'POST';
  body?: unknown;
}) {
  const repetitions = input.repetitions ?? 15;
  const samples = [];
  for (let index = 0; index < repetitions; index += 1) {
    samples.push(await timedRequest(input));
  }
  const unexpected = samples.filter((sample) => !input.expectedStatuses.includes(sample.status));
  assert(unexpected.length === 0, `${input.name}: respostas inesperadas ${unexpected.map((item) => item.status).join(',')}`);
  const durations = samples.map((sample) => sample.durationMs);
  const statuses = Object.fromEntries(
    [...new Set(samples.map((sample) => sample.status))].map((status) => [
      String(status),
      samples.filter((sample) => sample.status === status).length,
    ])
  );
  return {
    requests: repetitions,
    expectedStatuses: input.expectedStatuses,
    statuses,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    minMs: Number(Math.min(...durations).toFixed(3)),
    maxMs: Number(Math.max(...durations).toFixed(3)),
    errorRate: unexpected.length / repetitions,
  };
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
  if (Array.isArray(root.Plans)) {
    for (const child of root.Plans) {
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        result.push(...planNodes(child as Record<string, unknown>));
      }
    }
  }
  return result;
}

async function explain(sql: string, parameters: unknown[]) {
  const rows = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': unknown }>>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
    ...parameters
  );
  const raw = rows[0]?.['QUERY PLAN'];
  const root = planRoot(raw);
  return {
    rootNode: root['Node Type'],
    actualRows: Number(root['Actual Rows'] ?? 0),
    executionTimeMs: Number(
      (Array.isArray(raw) && raw[0] && typeof raw[0] === 'object'
        ? (raw[0] as Record<string, unknown>)['Execution Time']
        : 0) ?? 0
    ),
    nodes: planNodes(root).map((node) => ({
      nodeType: node['Node Type'],
      relationName: node['Relation Name'],
      indexName: node['Index Name'],
      actualRows: Number(node['Actual Rows'] ?? 0),
      rowsRemovedByFilter: Number(node['Rows Removed by Filter'] ?? 0),
    })),
  };
}

async function cleanup() {
  stopProcess(apiProcess);
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (contractId) {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
  }
  for (const userId of [studentUserId, adminUserId]) {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

async function main() {
  await mkdir(artifactDir, { recursive: true });
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275-endpoint-performance-${suffix}`,
      name: 'Academia Endpoint Performance',
    },
  });
  contractId = contract.id;
  const functionOption = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Administrador Performance Endpoint',
      code: `issue-275-endpoint-performance-${suffix}`,
      isActive: true,
    },
  });
  const adminUser = await prisma.user.create({
    data: {
      email: `admin-performance-${suffix}@example.test`,
      passwordHash: 'not-used',
      type: 'professor',
      profile: { create: { name: 'Administrador Performance Endpoint' } },
    },
  });
  adminUserId = adminUser.id;
  const professor = await prisma.professor.create({
    data: {
      userId: adminUser.id,
      contractId,
      collaboratorFunctionId: functionOption.id,
      role: 'master',
    },
  });
  const actor = { userId: adminUser.id, professorId: professor.id, contractId };
  const adminToken = jwt.sign(
    { userId: adminUser.id, email: adminUser.email, type: adminUser.type },
    jwtSecret,
    { expiresIn: '1h' }
  );

  const targetId = await preRegistrationEnrollmentCreateService.create(actor, {
    name: 'Lead Endpoint Performance',
    phone: '15981000001',
    email: `lead-performance-${suffix}@example.test`,
    origin: 'issue-275-endpoint-performance',
    responsibleProfessorId: professor.id,
  });
  const invite = await preRegistrationInviteAdminService.generateFirstInvite(
    targetId,
    contractId,
    actor
  );

  const studentUser = await prisma.user.create({
    data: {
      email: `student-performance-${suffix}@example.test`,
      passwordHash: 'not-used',
      type: 'aluno',
      profile: { create: { name: 'Aluno Endpoint Performance' } },
    },
  });
  studentUserId = studentUser.id;
  const healthAluno = await prisma.aluno.create({
    data: {
      contractId,
      userId: studentUser.id,
      status: 'PRE_REGISTRATION_COMPLETED',
      leadName: 'Aluno Endpoint Performance',
      birthDate: new Date('1990-05-10T00:00:00.000Z'),
      onboarding: {
        create: {
          contractId,
          claimedByUserId: studentUser.id,
          claimedAt: new Date(),
          claimRole: 'STUDENT',
          currentStep: 'PRIVACY',
          privacyNoticeVersion: '2026-07',
          privacyAcceptedAt: new Date(),
          completedAt: new Date(),
        },
      },
    },
  });
  await upsertStudentIdentity(
    healthAluno.id,
    contractId,
    {
      name: 'Aluno Endpoint Performance',
      birthDate: '1990-05-10',
      cpf: '52998224725',
      phone: '15981000002',
    },
    { sourceType: 'student', sourceReference: 'issue_275_endpoint_performance' }
  );
  const studentToken = jwt.sign(
    { userId: studentUser.id, email: studentUser.email, type: studentUser.type },
    jwtSecret,
    { expiresIn: '1h' }
  );

  for (let index = 0; index < 500; index += 1) {
    await prisma.aluno.create({
      data: {
        contractId,
        status: index % 2 === 0 ? 'LEAD' : 'INVITED',
        leadName: `Lead Cardinalidade ${index}`,
        leadPhone: `15982${String(index).padStart(6, '0')}`,
        leadPhoneNormalized: `15982${String(index).padStart(6, '0')}`,
        leadEmail: `cardinality-${index}-${suffix}@example.test`,
        leadEmailNormalized: `cardinality-${index}-${suffix}@example.test`,
        leadOrigin: 'issue-275-cardinality',
        lastActivityAt: new Date(Date.now() - index * 1000),
      },
    });
  }

  apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      PORT: '3012',
      API_PORT: '3012',
      NODE_ENV: 'test',
      JWT_SECRET: jwtSecret,
      FRONTEND_URL: 'http://127.0.0.1:4173',
      CORS_ORIGINS: 'http://127.0.0.1:4173',
      PRE_REGISTRATION_ENABLED: 'true',
      PRE_REGISTRATION_TELEMETRY_ENABLED: 'false',
      PRIVACY_NOTICE_URL: 'https://example.test/privacidade',
      PRIVACY_NOTICE_VERSION: '2026-07',
      HEALTH_PRIVACY_NOTICE_VERSION: '2026-07',
    },
    stdio: 'inherit',
  });
  await waitForApi();

  const endpoints = {
    administrativeList: await sampleEndpoint({
      name: 'administrativeList',
      pathname: '/pre-registration-admin/leads?page=1&pageSize=20&status=LEAD,INVITED',
      token: adminToken,
      expectedStatuses: [200],
    }),
    validInvite: await sampleEndpoint({
      name: 'validInvite',
      pathname: `/pre-cadastro/${invite.token}`,
      expectedStatuses: [200],
    }),
    invalidInvite: await sampleEndpoint({
      name: 'invalidInvite',
      pathname: `/pre-cadastro/invalid-${suffix}`,
      expectedStatuses: [404],
    }),
    studentSession: await sampleEndpoint({
      name: 'studentSession',
      pathname: `/pre-registration/processes/${healthAluno.id}/session`,
      token: studentToken,
      expectedStatuses: [200],
    }),
    healthIntake: await sampleEndpoint({
      name: 'healthIntake',
      pathname: `/pre-registration/processes/${healthAluno.id}/health-intake`,
      token: studentToken,
      expectedStatuses: [200],
    }),
    parq: await sampleEndpoint({
      name: 'parq',
      pathname: `/pre-registration/processes/${healthAluno.id}/parq`,
      token: studentToken,
      expectedStatuses: [200],
    }),
    enrollmentReview: await sampleEndpoint({
      name: 'enrollmentReview',
      pathname: `/pre-registration-admin/leads/${targetId}/enrollment-review`,
      token: adminToken,
      expectedStatuses: [200],
    }),
    duplicateDetector: await sampleEndpoint({
      name: 'duplicateDetector',
      pathname: '/pre-registration-admin/leads/duplicates',
      token: adminToken,
      method: 'POST',
      body: { name: 'Busca Performance', phone: '15981000001' },
      expectedStatuses: [200],
    }),
  };

  const contentionStartedAt = performance.now();
  const contentionResults = await Promise.all(
    Array.from({ length: 12 }, () =>
      timedRequest({
        pathname: '/pre-registration-admin/leads?page=1&pageSize=20',
        token: adminToken,
      })
    )
  );
  const contentionDurationMs = performance.now() - contentionStartedAt;
  assert(
    contentionResults.every((result) => result.status === 200),
    'Contenção da listagem produziu falha'
  );

  const [inviteHistoryPlan, lifecycleAuditPlan, totalRows] = await Promise.all([
    explain(
      'SELECT "id", "status" FROM "PreRegistrationInvite" WHERE "contractId" = $1 AND "alunoId" = $2 ORDER BY "createdAt" DESC LIMIT 20',
      [contractId, targetId]
    ),
    explain(
      'SELECT "id", "eventType" FROM "StudentLifecycleEvent" WHERE "contractId" = $1 AND "alunoId" = $2 ORDER BY "createdAt" DESC LIMIT 100',
      [contractId, targetId]
    ),
    prisma.aluno.count({ where: { contractId } }),
  ]);
  assert(inviteHistoryPlan.actualRows <= 20, 'Histórico de convites não respeitou limite');
  assert(lifecycleAuditPlan.actualRows <= 100, 'Auditoria de ciclo não respeitou limite');

  const report = {
    schemaVersion: 1,
    kind: 'issue-275-endpoint-performance',
    environment: {
      runtime: 'GitHub Actions ubuntu-latest',
      database: 'PostgreSQL 16 synthetic',
      tenantRows: totalRows,
      repetitionsPerEndpoint: 15,
      contentionRequests: contentionResults.length,
    },
    endpoints,
    contention: {
      requests: contentionResults.length,
      durationMs: Number(contentionDurationMs.toFixed(3)),
      p50Ms: percentile(contentionResults.map((result) => result.durationMs), 0.5),
      p95Ms: percentile(contentionResults.map((result) => result.durationMs), 0.95),
      errorRate: 0,
    },
    boundedHistories: {
      inviteHistory: inviteHistoryPlan,
      lifecycleAudit: lifecycleAuditPlan,
    },
  };
  assert(
    Object.values(endpoints).every((endpoint) => endpoint.errorRate === 0),
    'Amostra de endpoint contém erro'
  );
  await writeFile(
    path.join(artifactDir, 'endpoint-performance.json'),
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
