import '../bootstrap-env.js';
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { studentExternalAccountService } from '../modules/alunos/student-external-account.service.js';

const prisma = new PrismaClient();

const dryRun = process.argv.includes('--dry-run');

const parseFlagValue = (flag: string): string | undefined => {
  const arg = process.argv.find((item) => item.startsWith(`${flag}=`));
  if (!arg) return undefined;
  return arg.slice(flag.length + 1);
};

type ReportEntry = {
  integrationId: string;
  alunoId: string;
  provider: string;
  contractId: string | null;
  operation: 'create' | 'update' | 'ignore';
  reason?: string;
  dryRun: boolean;
};

type Report = {
  startedAt: string;
  finishedAt?: string;
  dryRun: boolean;
  summary: {
    integrationsScanned: number;
    created: number;
    updated: number;
    ignored: number;
  };
  entries: ReportEntry[];
};

const normalizeProvider = (provider: string) => provider.trim().toLowerCase();

const run = async () => {
  const report: Report = {
    startedAt: new Date().toISOString(),
    dryRun,
    summary: {
      integrationsScanned: 0,
      created: 0,
      updated: 0,
      ignored: 0,
    },
    entries: [],
  };

  console.log('[student-external-account-backfill] started', { dryRun });

  const integrations = await prisma.integration.findMany({
    select: {
      id: true,
      alunoId: true,
      type: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      lastSync: true,
      createdAt: true,
      aluno: {
        select: {
          professor: {
            select: {
              contractId: true,
            },
          },
          studentExternalAccounts: {
            select: {
              id: true,
              provider: true,
            },
          },
        },
      },
    },
    orderBy: [
      { alunoId: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  report.summary.integrationsScanned = integrations.length;

  for (const integration of integrations) {
    const contractId = integration.aluno.professor?.contractId ?? null;
    const provider = normalizeProvider(String(integration.type));

    if (!contractId) {
      report.summary.ignored += 1;
      report.entries.push({
        integrationId: integration.id,
        alunoId: integration.alunoId,
        provider,
        contractId: null,
        operation: 'ignore',
        reason: 'missing_contract_scope',
        dryRun,
      });
      continue;
    }

    const existingAccount = integration.aluno.studentExternalAccounts.find(
      (account) => normalizeProvider(account.provider) === provider
    );
    const operation = existingAccount ? 'update' : 'create';

    if (!dryRun) {
      await studentExternalAccountService.upsertFromLegacyIntegration(
        {
          integrationId: integration.id,
          alunoId: integration.alunoId,
          contractId,
          provider,
          accessToken: integration.accessToken,
          refreshToken: integration.refreshToken,
          expiresAt: integration.expiresAt,
          lastSync: integration.lastSync,
        },
        prisma
      );
    }

    if (operation === 'create') {
      report.summary.created += 1;
    } else {
      report.summary.updated += 1;
    }
    report.entries.push({
      integrationId: integration.id,
      alunoId: integration.alunoId,
      provider,
      contractId,
      operation,
      dryRun,
    });
  }

  report.finishedAt = new Date().toISOString();

  const outputPathArg = parseFlagValue('--output');
  const defaultOutputPath = path.resolve(
    process.cwd(),
    'reports',
    `student-external-account-backfill-${report.startedAt.replace(/[:.]/g, '-')}.json`
  );
  const outputPath = outputPathArg ? path.resolve(process.cwd(), outputPathArg) : defaultOutputPath;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('[student-external-account-backfill] completed', {
    dryRun,
    outputPath,
    summary: report.summary,
  });
};

run()
  .catch((error) => {
    console.error('[student-external-account-backfill] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
