import type {
  ParqAdministrativeSummaryDTO,
  ParqSubmissionDTO,
} from '@corrida/types';
import { alunoService } from './aluno.service.js';
import { studentDomainService } from './student-domain.service.js';
import { preRegistrationParqService } from '../pre-registration-public/pre-registration-parq.service.js';

type JsonRecord = Record<string, unknown>;

const LEGACY_PARQ_KEYS = new Set(['parqResponses', 'questionnaireParq']);

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

export function stripLegacyParqFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripLegacyParqFields);
  }

  const source = record(value);
  if (!source) return value;

  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !LEGACY_PARQ_KEYS.has(key))
      .map(([key, entry]) => [key, stripLegacyParqFields(entry)])
  );
}

function removeQuestionnaireParq(intake: unknown): unknown {
  const intakeRecord = record(stripLegacyParqFields(intake));
  if (!intakeRecord) return intake;

  const questionnaires = record(intakeRecord.questionnaires);
  if (!questionnaires) return intakeRecord;

  const { parq: _parq, ...questionnairesWithoutParq } = questionnaires;
  return {
    ...intakeRecord,
    questionnaires: questionnairesWithoutParq,
  };
}

export function sanitizeAdministrativeAlunoPayload<T>(
  aluno: T,
  parq: ParqAdministrativeSummaryDTO
): T & { parq: ParqAdministrativeSummaryDTO } {
  const sanitized = record(stripLegacyParqFields(aluno)) ?? {};
  return {
    ...sanitized,
    parq,
  } as T & { parq: ParqAdministrativeSummaryDTO };
}

export function sanitizeAdministrativeStudentSummary<T>(
  summary: T,
  parq: ParqAdministrativeSummaryDTO
): T & { parq: ParqAdministrativeSummaryDTO } {
  const sanitized = record(stripLegacyParqFields(summary)) ?? {};
  return {
    ...sanitized,
    ...(Object.prototype.hasOwnProperty.call(sanitized, 'intake')
      ? { intake: removeQuestionnaireParq(sanitized.intake) }
      : {}),
    parq,
  } as T & { parq: ParqAdministrativeSummaryDTO };
}

export function attachCanonicalParqToHealthIntake<T>(
  intake: T,
  latestSubmission: ParqSubmissionDTO | null
): T {
  const sanitized = record(stripLegacyParqFields(intake));
  if (!sanitized) return intake;

  const questionnaires = record(sanitized.questionnaires) ?? {};
  return {
    ...sanitized,
    questionnaires: {
      ...questionnaires,
      parq: latestSubmission?.responses ?? null,
    },
  } as T;
}

export const studentParqBoundaryService = {
  async getAdministrativeAluno(contractId: string, alunoId: string) {
    const aluno = await alunoService.findById(alunoId);
    if (!aluno || aluno.contractId !== contractId) return null;

    return sanitizeAdministrativeAlunoPayload(aluno, aluno.parq);
  },

  async getAdministrativeSummary(contractId: string, alunoId: string) {
    const [summary, parq] = await Promise.all([
      studentDomainService.getSummary(alunoId, { companyContractId: contractId }),
      preRegistrationParqService.summary(contractId, alunoId),
    ]);
    if (!summary) return null;

    return sanitizeAdministrativeStudentSummary(summary, parq);
  },

  async getClinicalIntake(contractId: string, alunoId: string) {
    const [intake, parq] = await Promise.all([
      studentDomainService.getHealthIntake(alunoId, { companyContractId: contractId }),
      preRegistrationParqService.overview(contractId, alunoId),
    ]);
    if (!intake) return null;

    return attachCanonicalParqToHealthIntake(intake, parq.latestSubmission);
  },
};
