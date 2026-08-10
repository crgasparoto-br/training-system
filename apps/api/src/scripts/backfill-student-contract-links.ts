import '../bootstrap-env.js';
import { PrismaClient, type ContractStatus, type StudentContractStatus } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

type LegacyFinancialData = {
  currentService?: string;
  contract?: string;
  contractStartDate?: string;
  contractDueDate?: string;
  paymentDay?: string;
  monthlyValue?: string;
  specialCondition?: string;
  otherObservations?: string;
};

type MappingMethod = 'serviceId' | 'text' | 'serviceId+text';

type ManualReviewReason =
  | 'no_generated_contract'
  | 'service_match_ambiguous'
  | 'text_match_ambiguous'
  | 'service_text_conflict'
  | 'candidate_already_linked'
  | 'candidate_not_found';

type Report = {
  startedAt: string;
  finishedAt?: string;
  dryRun: boolean;
  summary: {
    alunosScanned: number;
    alunosWithLegacyData: number;
    migrated: number;
    ignored: number;
    manualReview: number;
  };
  migrated: Array<{
    alunoId: string;
    contractId: string;
    contractTitle: string;
    method: MappingMethod;
    status: StudentContractStatus;
    dryRun: boolean;
  }>;
  ignored: Array<{
    alunoId: string;
    reason: string;
  }>;
  manualReview: Array<{
    alunoId: string;
    reason: ManualReviewReason;
    details?: Record<string, unknown>;
  }>;
};

const parseFlagValue = (flag: string): string | undefined => {
  const arg = process.argv.find((item) => item.startsWith(`${flag}=`));
  if (!arg) return undefined;
  return arg.slice(flag.length + 1);
};

const dryRun = process.argv.includes('--dry-run');

const toNormalizedText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseOptionalDate = (value: string | undefined): Date | null => {
  if (!value) return null;

  const isoCandidate = new Date(value);
  if (!Number.isNaN(isoCandidate.getTime())) {
    return isoCandidate;
  }

  const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!brMatch) return null;

  const [, day, month, year] = brMatch;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseOptionalPaymentDay = (value: string | undefined): number | null => {
  if (!value) return null;

  const parsed = Number(value.replace(/\D/g, ''));
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
    return null;
  }

  return parsed;
};

const parseOptionalAmount = (value: string | undefined): number | null => {
  if (!value) return null;

  const normalized = value
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');

  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractLegacyFinancial = (formResponses: unknown): LegacyFinancialData => {
  const root = asObject(formResponses);
  const financial = asObject(root.financial);

  return {
    currentService: asString(financial.currentService),
    contract: asString(financial.contract),
    contractStartDate: asString(financial.contractStartDate),
    contractDueDate: asString(financial.contractDueDate),
    paymentDay: asString(financial.paymentDay),
    monthlyValue: asString(financial.monthlyValue),
    specialCondition: asString(financial.specialCondition),
    otherObservations: asString(financial.otherObservations),
  };
};

const hasLegacyData = (serviceId: string | null, legacy: LegacyFinancialData): boolean => {
  return Boolean(
    serviceId ||
      legacy.currentService ||
      legacy.contract ||
      legacy.contractStartDate ||
      legacy.contractDueDate ||
      legacy.monthlyValue ||
      legacy.paymentDay
  );
};

const toStudentContractStatus = (status: ContractStatus): StudentContractStatus => {
  if (status === 'SIGNED') return 'active';
  if (status === 'SENT' || status === 'VIEWED') return 'pending_signature';
  if (status === 'EXPIRED') return 'expired';
  if (status === 'CANCELLED') return 'canceled';
  return 'draft';
};

const run = async () => {
  const startedAt = new Date();

  const report: Report = {
    startedAt: startedAt.toISOString(),
    dryRun,
    summary: {
      alunosScanned: 0,
      alunosWithLegacyData: 0,
      migrated: 0,
      ignored: 0,
      manualReview: 0,
    },
    migrated: [],
    ignored: [],
    manualReview: [],
  };

  console.log('[student-contract-backfill] started', {
    dryRun,
  });

  const alunos = await prisma.aluno.findMany({
    select: {
      id: true,
      serviceId: true,
      contractId: true,
      currentStudentContractId: true,
      professor: {
        select: {
          contractId: true,
        },
      },
      intakeForm: {
        select: {
          formResponses: true,
        },
      },
      contracts: {
        select: {
          id: true,
          title: true,
          status: true,
          serviceId: true,
          signedAt: true,
          cancelledAt: true,
          companyContractId: true,
          service: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          studentContracts: {
            select: {
              id: true,
            },
          },
        },
      },
      studentContracts: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  report.summary.alunosScanned = alunos.length;

  for (const aluno of alunos) {
    const legacy = extractLegacyFinancial(aluno.intakeForm?.formResponses);

    if (!hasLegacyData(aluno.serviceId, legacy)) {
      continue;
    }

    report.summary.alunosWithLegacyData += 1;

    if (aluno.studentContracts.length > 0) {
      report.summary.ignored += 1;
      report.ignored.push({
        alunoId: aluno.id,
        reason: 'already_has_student_contract_link',
      });
      continue;
    }

    const alunoContractId = aluno.contractId;
    const generatedContracts = aluno.contracts.filter(
      (contract) =>
        contract.companyContractId === alunoContractId &&
        contract.studentContracts === null
    );

    if (generatedContracts.length === 0) {
      report.summary.manualReview += 1;
      report.manualReview.push({
        alunoId: aluno.id,
        reason: 'no_generated_contract',
      });
      continue;
    }

    const serviceMatches = aluno.serviceId
      ? generatedContracts.filter((contract) => contract.serviceId === aluno.serviceId)
      : [];

    const normalizedSearchTerms = [legacy.contract, legacy.currentService]
      .filter((item): item is string => Boolean(item && item.trim().length > 0))
      .map((item) => toNormalizedText(item))
      .filter((item) => item.length > 0);

    const textMatches = generatedContracts.filter((contract) => {
      const normalizedTitle = toNormalizedText(contract.title);
      const normalizedServiceName = toNormalizedText(contract.service?.name);
      const normalizedServiceCode = toNormalizedText(contract.service?.code);

      return normalizedSearchTerms.some(
        (term) =>
          term === normalizedTitle ||
          term === normalizedServiceName ||
          term === normalizedServiceCode
      );
    });

    let selectedContract: (typeof generatedContracts)[number] | null = null;
    let method: MappingMethod | null = null;

    if (serviceMatches.length === 1 && textMatches.length === 1) {
      if (serviceMatches[0].id === textMatches[0].id) {
        selectedContract = serviceMatches[0];
        method = 'serviceId+text';
      } else {
        report.summary.manualReview += 1;
        report.manualReview.push({
          alunoId: aluno.id,
          reason: 'service_text_conflict',
          details: {
            serviceMatchContractId: serviceMatches[0].id,
            textMatchContractId: textMatches[0].id,
          },
        });
        continue;
      }
    } else if (serviceMatches.length === 1 && textMatches.length === 0) {
      selectedContract = serviceMatches[0];
      method = 'serviceId';
    } else if (textMatches.length === 1 && serviceMatches.length === 0) {
      selectedContract = textMatches[0];
      method = 'text';
    } else if (serviceMatches.length > 1) {
      report.summary.manualReview += 1;
      report.manualReview.push({
        alunoId: aluno.id,
        reason: 'service_match_ambiguous',
        details: {
          candidateContractIds: serviceMatches.map((item) => item.id),
        },
      });
      continue;
    } else if (textMatches.length > 1) {
      report.summary.manualReview += 1;
      report.manualReview.push({
        alunoId: aluno.id,
        reason: 'text_match_ambiguous',
        details: {
          searchTerms: normalizedSearchTerms,
          candidateContractIds: textMatches.map((item) => item.id),
        },
      });
      continue;
    } else {
      report.summary.manualReview += 1;
      report.manualReview.push({
        alunoId: aluno.id,
        reason: 'candidate_not_found',
        details: {
          legacyServiceId: aluno.serviceId,
          legacyContractText: legacy.contract ?? null,
          legacyCurrentServiceText: legacy.currentService ?? null,
        },
      });
      continue;
    }

    if (!selectedContract || !method) {
      report.summary.manualReview += 1;
      report.manualReview.push({
        alunoId: aluno.id,
        reason: 'candidate_not_found',
      });
      continue;
    }

    if (selectedContract.studentContracts !== null) {
      report.summary.manualReview += 1;
      report.manualReview.push({
        alunoId: aluno.id,
        reason: 'candidate_already_linked',
        details: {
          contractId: selectedContract.id,
        },
      });
      continue;
    }

    const targetStatus = toStudentContractStatus(selectedContract.status);
    const startDate =
      parseOptionalDate(legacy.contractStartDate) ??
      (targetStatus === 'active' ? selectedContract.signedAt ?? null : null);
    const endDate =
      parseOptionalDate(legacy.contractDueDate) ??
      (targetStatus === 'canceled' || targetStatus === 'expired'
        ? selectedContract.cancelledAt ?? new Date()
        : null);
    const paymentDay = parseOptionalPaymentDay(legacy.paymentDay);
    const amount = parseOptionalAmount(legacy.monthlyValue);
    const notes = [
      legacy.specialCondition ? `Condição especial legado: ${legacy.specialCondition}` : null,
      legacy.otherObservations ? `Observação legado: ${legacy.otherObservations}` : null,
      legacy.contract ? `Contrato legado: ${legacy.contract}` : null,
      legacy.currentService ? `Serviço legado: ${legacy.currentService}` : null,
    ]
      .filter((item): item is string => Boolean(item && item.trim().length > 0))
      .join(' | ');

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        const created = await tx.studentContract.create({
          data: {
            alunoId: aluno.id,
            contractId: selectedContract.id,
            serviceId: selectedContract.serviceId ?? aluno.serviceId ?? null,
            status: targetStatus,
            startDate,
            endDate,
            signedAt: targetStatus === 'active' ? selectedContract.signedAt ?? null : null,
            canceledAt: targetStatus === 'canceled' ? selectedContract.cancelledAt ?? new Date() : null,
            cancellationReason:
              targetStatus === 'canceled'
                ? 'Migrado de campo legado de contrato/serviço'
                : null,
            amount,
            paymentDay,
            notes: notes || null,
          },
        });

        if (targetStatus === 'active') {
          await tx.aluno.update({
            where: { id: aluno.id },
            data: {
              currentStudentContractId: created.id,
            },
          });
        }
      });
    }

    report.summary.migrated += 1;
    report.migrated.push({
      alunoId: aluno.id,
      contractId: selectedContract.id,
      contractTitle: selectedContract.title,
      method,
      status: targetStatus,
      dryRun,
    });
  }

  report.finishedAt = new Date().toISOString();

  const outputPathArg = parseFlagValue('--output');
  const defaultOutputPath = path.resolve(
    process.cwd(),
    'reports',
    `student-contract-backfill-${report.startedAt.replace(/[:.]/g, '-')}.json`
  );
  const outputPath = outputPathArg ? path.resolve(process.cwd(), outputPathArg) : defaultOutputPath;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('[student-contract-backfill] completed', {
    dryRun,
    outputPath,
    summary: report.summary,
  });
};

run()
  .catch((error) => {
    console.error('[student-contract-backfill] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
