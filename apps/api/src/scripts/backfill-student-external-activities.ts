import '../bootstrap-env.js';
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { studentExternalActivityService } from '../modules/alunos/student-external-activity.service.js';

const prisma = new PrismaClient();

const dryRun = process.argv.includes('--dry-run');

const parseFlagValue = (flag: string): string | undefined => {
  const arg = process.argv.find((item) => item.startsWith(`${flag}=`));
  if (!arg) return undefined;
  return arg.slice(flag.length + 1);
};

type ReportEntry = {
  provider: string;
  externalActivityId: string;
  alunoId: string;
  trainingExecutionId: string;
  externalAccountId: string | null;
  operation: 'create' | 'update' | 'ignore';
  reason?: string;
  dryRun: boolean;
};

type Report = {
  startedAt: string;
  finishedAt?: string;
  dryRun: boolean;
  summary: {
    executionReferencesScanned: number;
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
      executionReferencesScanned: 0,
      created: 0,
      updated: 0,
      ignored: 0,
    },
    entries: [],
  };

  console.log('[student-external-activity-backfill] started', { dryRun });

  const executions = await prisma.trainingExecution.findMany({
    where: {
      OR: [{ garminActivityId: { not: null } }, { stravaActivityId: { not: null } }],
    },
    select: {
      id: true,
      alunoId: true,
      plannedDate: true,
      executedDate: true,
      createdAt: true,
      garminActivityId: true,
      stravaActivityId: true,
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
    orderBy: [{ alunoId: 'asc' }, { createdAt: 'asc' }],
  });

  const references = executions.flatMap((execution) => {
    const items: Array<{
      provider: 'garmin' | 'strava';
      externalActivityId: string;
      execution: (typeof executions)[number];
    }> = [];

    if (execution.garminActivityId) {
      items.push({
        provider: 'garmin',
        externalActivityId: execution.garminActivityId,
        execution,
      });
    }

    if (execution.stravaActivityId) {
      items.push({
        provider: 'strava',
        externalActivityId: execution.stravaActivityId,
        execution,
      });
    }

    return items;
  });

  report.summary.executionReferencesScanned = references.length;

  for (const reference of references) {
    const contractId = reference.execution.aluno.professor?.contractId ?? null;
    const externalAccount = reference.execution.aluno.studentExternalAccounts.find(
      (account) => normalizeProvider(account.provider) === reference.provider
    );

    if (!contractId || !externalAccount) {
      report.summary.ignored += 1;
      report.entries.push({
        provider: reference.provider,
        externalActivityId: reference.externalActivityId,
        alunoId: reference.execution.alunoId,
        trainingExecutionId: reference.execution.id,
        externalAccountId: externalAccount?.id ?? null,
        operation: 'ignore',
        reason: !contractId ? 'missing_contract_scope' : 'missing_external_account',
        dryRun,
      });
      continue;
    }

    const existing = await prisma.studentExternalActivity.findUnique({
      where: {
        externalAccountId_externalActivityId: {
          externalAccountId: externalAccount.id,
          externalActivityId: reference.externalActivityId,
        },
      },
      select: {
        id: true,
      },
    });

    const operation = existing ? 'update' : 'create';

    if (!dryRun) {
      await studentExternalActivityService.upsertFromTrainingExecutionReference(
        {
          externalAccountId: externalAccount.id,
          alunoId: reference.execution.alunoId,
          contractId,
          provider: reference.provider,
          externalActivityId: reference.externalActivityId,
          trainingExecutionId: reference.execution.id,
          executedDate: reference.execution.executedDate,
          plannedDate: reference.execution.plannedDate,
          createdAt: reference.execution.createdAt,
        },
        prisma
      );
    }

    report.summary[operation] += 1;
    report.entries.push({
      provider: reference.provider,
      externalActivityId: reference.externalActivityId,
      alunoId: reference.execution.alunoId,
      trainingExecutionId: reference.execution.id,
      externalAccountId: externalAccount.id,
      operation,
      dryRun,
    });
  }

  report.finishedAt = new Date().toISOString();

  const outputPathArg = parseFlagValue('--output');
  const defaultOutputPath = path.resolve(
    process.cwd(),
    'reports',
    `student-external-activity-backfill-${report.startedAt.replace(/[:.]/g, '-')}.json`
  );
  const outputPath = outputPathArg ? path.resolve(process.cwd(), outputPathArg) : defaultOutputPath;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('[student-external-activity-backfill] completed', {
    dryRun,
    outputPath,
    summary: report.summary,
  });
};

run()
  .catch((error) => {
    console.error('[student-external-activity-backfill] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });