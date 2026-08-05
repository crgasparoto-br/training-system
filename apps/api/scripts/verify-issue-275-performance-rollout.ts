import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const prisma = new PrismaClient();
const TOKEN_LOOKUP_NOISE_ROWS = 5_000;
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
let noiseContractId = '';

function runLegacyVerifier(): void {
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@corrida/api',
      'exec',
      'tsx',
      'scripts/verify-issue-275-performance-rollout-legacy.ts',
    ],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
    }
  );

  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`Verificador legado terminou pelo sinal ${result.signal}.`);
  }
  if (result.status !== 0) {
    throw new Error(`Verificador legado terminou com status ${result.status ?? 'desconhecido'}.`);
  }
}

async function seedRepresentativeTokenCardinality(): Promise<void> {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275-token-plan-${suffix}`,
      name: 'Cardinalidade de controle do lookup de token',
    },
  });
  noiseContractId = contract.id;

  const aluno = await prisma.aluno.create({
    data: {
      contractId: contract.id,
      status: 'LEAD',
      leadName: 'Controle de cardinalidade de convite',
      leadOrigin: 'issue-275-token-plan-control',
    },
  });

  await prisma.preRegistrationInvite.createMany({
    data: Array.from({ length: TOKEN_LOOKUP_NOISE_ROWS }, (_, index) => ({
      alunoId: aluno.id,
      contractId: contract.id,
      tokenHash: crypto
        .createHash('sha256')
        .update(`issue-275-token-plan-noise:${suffix}:${index}`)
        .digest('hex'),
      status: 'REVOKED',
      expiresAt: new Date(Date.now() + 86_400_000 + index),
      revokedAt: new Date(),
      revocationReason: 'Linha sintética para cardinalidade representativa do plano de consulta.',
    })),
  });

  await prisma.$executeRawUnsafe('ANALYZE "PreRegistrationInvite"');

  const seededRows = await prisma.preRegistrationInvite.count({
    where: { contractId: contract.id },
  });
  if (seededRows !== TOKEN_LOOKUP_NOISE_ROWS) {
    throw new Error(
      `Cardinalidade de controle incompleta: ${seededRows}/${TOKEN_LOOKUP_NOISE_ROWS}.`
    );
  }

  console.log(
    JSON.stringify(
      {
        kind: 'issue-275-token-lookup-cardinality-control',
        rows: seededRows,
        plannerControl: 'representative-cardinality-with-analyze',
        plannerOverrides: false,
      },
      null,
      2
    )
  );
}

async function cleanup(): Promise<void> {
  if (noiseContractId) {
    await prisma.companyContract
      .delete({ where: { id: noiseContractId } })
      .catch(() => undefined);
  }
  await prisma.$disconnect();
}

async function main(): Promise<void> {
  await seedRepresentativeTokenCardinality();
  runLegacyVerifier();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
