import '../bootstrap-env.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_REVIEW_PERIOD_MONTHS = 4;
const DEFAULT_SECTIONS = [
  'personal',
  'contact',
  'address',
  'preferences',
  'health',
  'anamnesis',
];

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const addMonths = (baseDate: Date, months: number) => {
  const nextDate = new Date(baseDate);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
};

const latestDate = (dates: Array<Date | null | undefined>) => {
  const validDates = dates.filter((value): value is Date => value instanceof Date);
  if (validDates.length === 0) {
    return null;
  }

  return validDates.reduce((max, current) => (current > max ? current : max));
};

const run = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const defaultReviewPeriodMonths = parsePositiveInt(
    process.env.PROFILE_REVIEW_DEFAULT_PERIOD_MONTHS,
    DEFAULT_REVIEW_PERIOD_MONTHS
  );

  console.log('[profile-review-backfill] started', {
    dryRun,
    defaultReviewPeriodMonths,
  });

  const contracts = await prisma.companyContract.findMany({
    select: {
      id: true,
      name: true,
      tradeName: true,
    },
  });

  const existingPolicies = await prisma.profileReviewPolicy.findMany({
    where: {
      contractId: {
        in: contracts.map((contract) => contract.id),
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    select: {
      id: true,
      contractId: true,
      defaultReviewPeriodMonths: true,
      isActive: true,
      updatedAt: true,
    },
  });

  const policyByContract = new Map<string, (typeof existingPolicies)[number]>();
  for (const policy of existingPolicies) {
    if (!policyByContract.has(policy.contractId)) {
      policyByContract.set(policy.contractId, policy);
    }
  }

  const contractsWithoutPolicy = contracts.filter((contract) => !policyByContract.has(contract.id));

  if (contractsWithoutPolicy.length > 0) {
    if (dryRun) {
      console.log('[profile-review-backfill] dry-run: policies to create', {
        count: contractsWithoutPolicy.length,
        contractIds: contractsWithoutPolicy.map((contract) => contract.id),
      });
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.profileReviewPolicy.createMany({
          data: contractsWithoutPolicy.map((contract) => ({
            contractId: contract.id,
            defaultReviewPeriodMonths,
            isActive: true,
            sections: DEFAULT_SECTIONS,
            reminderBeforeDays: 7,
            reminderAfterDays: null,
          })),
          skipDuplicates: true,
        });
      });

      console.log('[profile-review-backfill] default policies created', {
        count: contractsWithoutPolicy.length,
      });
    }
  } else {
    console.log('[profile-review-backfill] no missing contract policies');
  }

  const effectivePolicies = await prisma.profileReviewPolicy.findMany({
    where: {
      contractId: {
        in: contracts.map((contract) => contract.id),
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    select: {
      contractId: true,
      defaultReviewPeriodMonths: true,
    },
  });

  const effectivePeriodByContract = new Map<string, number>();
  for (const policy of effectivePolicies) {
    if (effectivePeriodByContract.has(policy.contractId)) {
      continue;
    }

    const period =
      policy.defaultReviewPeriodMonths && policy.defaultReviewPeriodMonths > 0
        ? policy.defaultReviewPeriodMonths
        : defaultReviewPeriodMonths;

    effectivePeriodByContract.set(policy.contractId, period);
  }

  const alunosWithoutSettings = await prisma.aluno.findMany({
    where: {
      profileReviewSettings: null,
    },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      professor: {
        select: {
          contractId: true,
        },
      },
      user: {
        select: {
          profile: {
            select: {
              updatedAt: true,
            },
          },
        },
      },
      intakeForm: {
        select: {
          updatedAt: true,
        },
      },
    },
  });

  const settingsToCreate = alunosWithoutSettings.map((aluno) => {
    const contractId = aluno.professor.contractId;
    const effectivePeriod = effectivePeriodByContract.get(contractId) ?? defaultReviewPeriodMonths;

    const baselineDate =
      latestDate([
        aluno.user.profile?.updatedAt,
        aluno.updatedAt,
        aluno.intakeForm?.updatedAt,
        aluno.createdAt,
      ]) ?? aluno.createdAt;

    return {
      alunoId: aluno.id,
      reviewPeriodMonths: null as number | null,
      isReviewRequired: true,
      nextReviewAt: addMonths(baselineDate, effectivePeriod),
    };
  });

  if (settingsToCreate.length > 0) {
    if (dryRun) {
      console.log('[profile-review-backfill] dry-run: aluno settings to create', {
        count: settingsToCreate.length,
      });
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.alunoProfileReviewSettings.createMany({
          data: settingsToCreate,
          skipDuplicates: true,
        });
      });

      console.log('[profile-review-backfill] aluno settings created', {
        count: settingsToCreate.length,
      });
    }
  } else {
    console.log('[profile-review-backfill] no missing aluno settings');
  }

  console.log('[profile-review-backfill] completed', {
    contractsTotal: contracts.length,
    contractsMissingPolicy: contractsWithoutPolicy.length,
    alunosMissingSettings: alunosWithoutSettings.length,
    note: 'No StudentProfileReview pending records were created by this routine.',
    noAssessmentPlanChanges: true,
  });
};

run()
  .catch((error) => {
    console.error('[profile-review-backfill] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
