import { Router, Request, Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  blockAccessMiddleware,
  screenAccessMiddleware,
} from '../access-control/access-control.middleware.js';
import { studentDomainService } from '../alunos/student-domain.service.js';
import { stripLegacyParqFields } from '../alunos/student-parq-boundary.service.js';

const router: Router = Router();

type JsonRecord = Record<string, unknown>;
type AlunoDomainSnapshot = Awaited<ReturnType<typeof studentDomainService.loadAlunoDomainSnapshot>>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

export function sanitizeInitialAnamnesisForProntuario(intake: unknown) {
  const sanitized = asRecord(stripLegacyParqFields(intake));
  if (!sanitized) return intake;

  const questionnaires = asRecord(sanitized.questionnaires);
  if (!questionnaires) return sanitized;

  const { parq: _parq, ...questionnairesWithoutParq } = questionnaires;
  return {
    ...sanitized,
    questionnaires: questionnairesWithoutParq,
  };
}

function toClinicalIdentity(profile: unknown, alunoId: string) {
  const profileRecord = asRecord(profile);
  const identification = asRecord(profileRecord?.identification);

  return {
    alunoId,
    name: typeof identification?.name === 'string' ? identification.name : null,
    email: typeof identification?.email === 'string' ? identification.email : null,
  };
}

function buildCanonicalInitialAnamnesis(aluno: NonNullable<AlunoDomainSnapshot>) {
  const intake = aluno.studentHealthIntake;
  if (!intake) return null;

  return {
    alunoId: aluno.id,
    source: {
      type: intake.sourceType ?? 'student',
      reference: intake.sourceReference ?? aluno.id,
      recordedByUserId: intake.recordedByUserId ?? null,
    },
    assessmentDate: intake.assessmentDate ?? null,
    status: intake.status ?? 'IN_PROGRESS',
    version: intake.version ?? 1,
    currentStep: intake.currentStep ?? null,
    questionnaires: {
      american: intake.questionnaireAha ?? null,
    },
    clinicalHistory: intake.clinicalHistoryData ?? null,
    medications: intake.medicationData ?? null,
    injuries: intake.injuryData ?? null,
    allergies: intake.allergyData ?? null,
    rawFormResponses: intake.rawFormResponses ?? null,
    observations: intake.observations ?? null,
    updatedAt: intake.updatedAt,
    createdAt: intake.createdAt,
    legacyIntakeId: intake.legacyIntakeId ?? null,
    migratedFromLegacy: Boolean(intake.legacyIntakeId),
    migrationReviewRequired: intake.migrationReviewRequired ?? false,
    migrationStatus: intake.migrationStatus ?? null,
  };
}

function requestContractId(req: Request) {
  return (req as any).user.contractId as string | undefined;
}

router.get(
  '/alunos/:alunoId/clinical-identity',
  authMiddleware,
  professorMiddleware,
  screenAccessMiddleware('physicalAssessment.protocol'),
  blockAccessMiddleware('physicalAssessment.prnt.summary'),
  async (req: Request, res: Response) => {
    try {
      const contractId = requestContractId(req);
      if (!contractId) return sendError(res, 'Contrato não encontrado', 404);

      const profile = await studentDomainService.getProfile(req.params.alunoId, {
        companyContractId: contractId,
      });
      if (!profile) return sendError(res, 'Aluno não encontrado no contrato', 404);

      return sendSuccess(
        res,
        toClinicalIdentity(profile, req.params.alunoId),
        'Identificação clínica carregada'
      );
    } catch (error) {
      console.error('Erro ao carregar identificação clínica do PRNT:', error);
      return sendError(res, 'Erro ao carregar identificação clínica', 500);
    }
  }
);

router.get(
  '/alunos/:alunoId/initial-anamnesis',
  authMiddleware,
  professorMiddleware,
  screenAccessMiddleware('physicalAssessment.protocol'),
  blockAccessMiddleware('physicalAssessment.prnt.anamnesisFollowUp'),
  async (req: Request, res: Response) => {
    try {
      const contractId = requestContractId(req);
      if (!contractId) return sendError(res, 'Contrato não encontrado', 404);

      const snapshot = await studentDomainService.loadAlunoDomainSnapshot(req.params.alunoId, {
        companyContractId: contractId,
      });
      if (!snapshot) return sendError(res, 'Aluno não encontrado no contrato', 404);

      // Quando a fonte canônica existe, não completar campos nulos com AlunoIntakeForm.
      // O fallback legado fica restrito ao cenário em que ainda não há StudentHealthIntake.
      const intake =
        buildCanonicalInitialAnamnesis(snapshot) ??
        (await studentDomainService.getHealthIntake(req.params.alunoId, {
          companyContractId: contractId,
        }));

      if (!intake) return sendError(res, 'Aluno não encontrado no contrato', 404);

      return sendSuccess(
        res,
        sanitizeInitialAnamnesisForProntuario(intake),
        'Anamnese Inicial carregada'
      );
    } catch (error) {
      console.error('Erro ao carregar Anamnese Inicial do PRNT:', error);
      return sendError(res, 'Erro ao carregar Anamnese Inicial', 500);
    }
  }
);

export default router;
