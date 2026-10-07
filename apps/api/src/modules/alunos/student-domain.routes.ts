import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { Router, Request, Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { blockAccessMiddleware } from '../access-control/access-control.middleware.js';
import { alunoService } from './aluno.service.js';
import { studentDomainService } from './student-domain.service.js';
import { studentParqBoundaryService } from './student-parq-boundary.service.js';
import {
  trainingRoutineService,
  TrainingRoutineInputError,
} from '../workout/training-routine.service.js';
import { postWorkoutFeedbackPersistenceService, PostWorkoutFeedbackConflictError, PostWorkoutFeedbackInputError, PostWorkoutFeedbackNotFoundError } from '../post-workout-feedback/post-workout-feedback-persistence.service.js';
import {
  DATABASE_CONNECTION_UNAVAILABLE_MESSAGE,
  isDatabaseConnectionUnavailable,
} from '../../common/database-runtime.js';

const router: Router = Router();
const prisma = new PrismaClient();

const sendStudentDomainLoadError = (res: Response, error: unknown, fallbackMessage: string) =>
  isDatabaseConnectionUnavailable(error)
    ? sendError(res, DATABASE_CONNECTION_UNAVAILABLE_MESSAGE, 503)
    : sendError(res, fallbackMessage, 500);

router.use(authMiddleware);
router.use(professorMiddleware);

const getProfessorContext = (req: Request) => ({
  professorId: (req as any).user.professorId as string | undefined,
  professorRole: (req as any).user.professorRole as 'master' | 'professor' | undefined,
  collaboratorFunctionId: (req as any).user.collaboratorFunctionId as string | undefined,
  contractId: (req as any).user.contractId as string | undefined,
});

const canViewSensitivePreWorkoutCheckIn = async (req: Request) => {
  const { collaboratorFunctionId } = getProfessorContext(req);
  if (!collaboratorFunctionId) return false;

  const permission = await prisma.accessPermission.findFirst({
    where: {
      collaboratorFunctionId,
      screenKey: 'students.details',
      blockKey: 'students.details.preWorkoutCheckIn',
      canView: true,
    },
    select: { id: true },
  });

  return Boolean(permission);
};

const canViewSensitivePostWorkoutFeedback=async(req:Request)=>{const {collaboratorFunctionId}=getProfessorContext(req);if(!collaboratorFunctionId)return false;return Boolean(await prisma.accessPermission.findFirst({where:{collaboratorFunctionId,screenKey:'students.details',blockKey:'students.details.postWorkoutFeedback',canView:true},select:{id:true}}));};

const ensureAlunoAccess = async (req: Request, res: Response, alunoId: string) => {
  const { professorId, professorRole, contractId } = getProfessorContext(req);

  if (!professorId) {
    sendError(res, 'Professor não encontrado', 404);
    return false;
  }

  const belongs =
    professorRole === 'master' && contractId
      ? await alunoService.belongsToContract(alunoId, contractId)
      : await alunoService.belongsToProfessor(alunoId, professorId);

  if (!belongs) {
    sendError(res, 'Aluno não encontrado ou não pertence ao seu acesso', 404);
    return false;
  }

  return true;
};

router.get(
  '/:id/summary',
  blockAccessMiddleware('students.details.summary'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { contractId } = getProfessorContext(req);
      if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
      if (!(await ensureAlunoAccess(req, res, id))) return;

      const summary = await studentParqBoundaryService.getAdministrativeSummary(contractId, id);
      if (!summary) {
        return sendError(res, 'Aluno não encontrado', 404);
      }

      return sendSuccess(res, summary, 'Resumo consolidado do aluno carregado com sucesso');
    } catch (error) {
      console.error('Erro ao carregar resumo segmentado do aluno:', error);
      return sendStudentDomainLoadError(res, error, 'Erro ao carregar resumo segmentado do aluno');
    }
  }
);

// Rotina semanal e Treino de hoje do aluno selecionado na Central, somente leitura (#387).
router.get(
  '/:id/training-routine',
  blockAccessMiddleware('students.details.trainingPlans'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { contractId } = getProfessorContext(req);
      if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
      if (!(await ensureAlunoAccess(req, res, id))) return;
      // A responsabilidade do professor não substitui o isolamento por contrato.
      if (!(await alunoService.belongsToContract(id, contractId))) {
        return sendError(res, 'Aluno não encontrado ou não pertence ao seu acesso', 404);
      }

      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const includePreWorkoutCheckIn = await canViewSensitivePreWorkoutCheckIn(req);
      const includePostWorkoutFeedback = await canViewSensitivePostWorkoutFeedback(req);
      const routine = await trainingRoutineService.getRoutine({
        alunoId: id,
        contractId,
        audience: 'professor',
        date,
        includePreWorkoutCheckIn,
        includePostWorkoutFeedback,
      });

      return sendSuccess(res, routine, 'Rotina de treino carregada com sucesso');
    } catch (error) {
      if (error instanceof TrainingRoutineInputError) {
        return sendError(res, error.message, 400);
      }
      console.error('Erro ao carregar rotina de treino do aluno:', error);
      return sendStudentDomainLoadError(res, error, 'Erro ao carregar rotina de treino do aluno');
    }
  }
);



router.get(
  '/:id/training-sessions/:sessionId/feedback/revisions',
  blockAccessMiddleware('students.details.postWorkoutFeedback'),
  async (req: Request, res: Response) => {
    try {
      const { id, sessionId } = req.params;
      const { contractId } = getProfessorContext(req);
      if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
      if (!(await ensureAlunoAccess(req, res, id))) return;
      if (!(await alunoService.belongsToContract(id, contractId))) {
        return sendError(res, 'Aluno não encontrado ou não pertence ao seu acesso', 404);
      }
      const revisions = await postWorkoutFeedbackPersistenceService.getForSession({
        sessionId,
        alunoId: id,
        contractId,
        audience: 'professor',
        includeHistory: true,
      });
      return sendSuccess(res, revisions, 'Histórico do feedback pós-treino carregado com sucesso');
    } catch (error: any) {
      if (error instanceof PostWorkoutFeedbackNotFoundError) return sendError(res, error.message, 404);
      if (error instanceof PostWorkoutFeedbackConflictError) return sendError(res, error.message, 409, { code: error.code });
      console.error('Erro ao carregar histórico do feedback pós-treino:', error);
      return sendStudentDomainLoadError(res, error, 'Erro ao carregar histórico do feedback pós-treino');
    }
  }
);

const postWorkoutCorrectionSchema=z.object({operationKey:z.string().trim().min(8).max(128),baseRevisionId:z.string().trim().min(1),reason:z.string().trim().min(1).max(500),values:z.object({pse:z.number().int().min(0).max(10).nullable().optional(),psr:z.number().int().min(0).max(10).nullable().optional(),painBefore:z.number().int().min(0).max(10).nullable().optional(),painDuring:z.number().int().min(0).max(10).nullable().optional(),painAfter:z.number().int().min(0).max(10).nullable().optional(),painLocation:z.string().trim().max(160).nullable().optional(),difficulty:z.number().int().min(0).max(10).nullable().optional(),fatigueLevel:z.enum(['low','medium','high']).nullable().optional(),energyLevel:z.enum(['good','medium','poor']).nullable().optional(),sleepQuality:z.enum(['good','medium','poor']).nullable().optional(),dizziness:z.boolean().nullable().optional(),observations:z.string().trim().max(1000).nullable().optional(),professorTechnicalNotes:z.string().trim().max(1000).nullable().optional()}).strict()}).strict();
router.post('/:id/training-sessions/:sessionId/feedback/corrections',blockAccessMiddleware('students.details.postWorkoutFeedback'),async(req:Request,res:Response)=>{try{const {id,sessionId}=req.params;const {contractId}=getProfessorContext(req);const actorUserId=(req as any).user.userId as string|undefined;if(!contractId||!actorUserId)return sendError(res,'Contexto do professor não encontrado',404);if(!(await ensureAlunoAccess(req,res,id)))return;if(!(await alunoService.belongsToContract(id,contractId)))return sendError(res,'Aluno não encontrado ou não pertence ao seu acesso',404);const payload=postWorkoutCorrectionSchema.parse(req.body);return sendSuccess(res,await postWorkoutFeedbackPersistenceService.correctForProfessor({sessionId,alunoId:id,contractId,actorUserId,payload}),'Correção do feedback registrada como nova revisão');}catch(error:any){if(error instanceof z.ZodError||error instanceof PostWorkoutFeedbackInputError)return sendError(res,error instanceof z.ZodError?'Dados inválidos':error.message,400,error instanceof z.ZodError?error.errors:{code:error.code});if(error instanceof PostWorkoutFeedbackNotFoundError)return sendError(res,error.message,404);if(error instanceof PostWorkoutFeedbackConflictError)return sendError(res,error.message,409,{code:error.code});console.error('Erro ao corrigir feedback pós-treino:',error);return sendStudentDomainLoadError(res,error,'Erro ao corrigir feedback pós-treino');}});

router.get(
  '/:id/profile',
  blockAccessMiddleware('students.details.profile'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { contractId } = getProfessorContext(req);
      if (!(await ensureAlunoAccess(req, res, id))) {
        return;
      }

      const [profile, profileRecord] = await Promise.all([
        studentDomainService.getProfile(id, {
          companyContractId: contractId,
        }),
        contractId
          ? prisma.studentProfile.findFirst({
              where: { alunoId: id, contractId },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);
      if (!profile) {
        return sendError(res, 'Aluno não encontrado', 404);
      }

      return sendSuccess(
        res,
        { ...profile, recordId: profileRecord?.id ?? null },
        'Perfil segmentado do aluno carregado com sucesso'
      );
    } catch (error) {
      console.error('Erro ao carregar perfil segmentado do aluno:', error);
      return sendStudentDomainLoadError(res, error, 'Erro ao carregar perfil segmentado do aluno');
    }
  }
);

router.get(
  '/:id/intake',
  blockAccessMiddleware('students.details.health'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { contractId } = getProfessorContext(req);
      if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
      if (!(await ensureAlunoAccess(req, res, id))) return;

      const intake = await studentParqBoundaryService.getClinicalIntake(contractId, id);
      if (!intake) {
        return sendError(res, 'Aluno não encontrado', 404);
      }

      return sendSuccess(res, intake, 'Anamnese segmentada do aluno carregada com sucesso');
    } catch (error) {
      console.error('Erro ao carregar intake segmentado do aluno:', error);
      return sendStudentDomainLoadError(res, error, 'Erro ao carregar intake segmentado do aluno');
    }
  }
);

router.get(
  '/:id/assessment-records',
  blockAccessMiddleware('students.details.assessments'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { contractId } = getProfessorContext(req);
      if (!(await ensureAlunoAccess(req, res, id))) {
        return;
      }

      const assessments = await studentDomainService.listAssessmentRecords(id, {
        companyContractId: contractId,
      });
      if (!assessments) {
        return sendError(res, 'Aluno não encontrado', 404);
      }

      return sendSuccess(res, assessments, 'Avaliações segmentadas do aluno carregadas com sucesso');
    } catch (error) {
      console.error('Erro ao carregar avaliações segmentadas do aluno:', error);
      return sendStudentDomainLoadError(res, error, 'Erro ao carregar avaliações segmentadas do aluno');
    }
  }
);

router.get(
  '/:id/financial',
  blockAccessMiddleware('students.details.financialContract'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { contractId } = getProfessorContext(req);
      if (!(await ensureAlunoAccess(req, res, id))) {
        return;
      }

      const financial = await studentDomainService.getFinancialProfile(id, {
        companyContractId: contractId,
      });
      if (!financial) {
        return sendError(res, 'Aluno não encontrado', 404);
      }

      return sendSuccess(res, financial, 'Dados financeiros segmentados do aluno carregados com sucesso');
    } catch (error) {
      console.error('Erro ao carregar dados financeiros segmentados do aluno:', error);
      return sendStudentDomainLoadError(res, error, 'Erro ao carregar dados financeiros segmentados do aluno');
    }
  }
);

router.get(
  '/:id/integrations',
  blockAccessMiddleware('students.details.integrations'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { contractId } = getProfessorContext(req);
      if (!(await ensureAlunoAccess(req, res, id))) {
        return;
      }

      const integrations = await studentDomainService.getIntegrations(id, {
        companyContractId: contractId,
      });
      if (!integrations) {
        return sendError(res, 'Aluno não encontrado', 404);
      }

      return sendSuccess(res, integrations, 'Integrações do aluno carregadas com sucesso');
    } catch (error) {
      console.error('Erro ao carregar integrações do aluno:', error);
      return sendStudentDomainLoadError(res, error, 'Erro ao carregar integrações do aluno');
    }
  }
);

router.get(
  '/:id/activities',
  blockAccessMiddleware('students.details.integrations'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { contractId } = getProfessorContext(req);
      if (!(await ensureAlunoAccess(req, res, id))) {
        return;
      }

      const activities = await studentDomainService.listExternalActivities(id, {
        companyContractId: contractId,
      });
      if (!activities) {
        return sendError(res, 'Aluno não encontrado', 404);
      }

      return sendSuccess(res, activities, 'Atividades importadas do aluno carregadas com sucesso');
    } catch (error) {
      console.error('Erro ao carregar atividades importadas do aluno:', error);
      return sendStudentDomainLoadError(res, error, 'Erro ao carregar atividades importadas do aluno');
    }
  }
);

router.get(
  '/:id/timeline',
  blockAccessMiddleware('students.details.audit'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { contractId } = getProfessorContext(req);
      if (!(await ensureAlunoAccess(req, res, id))) {
        return;
      }

      const timeline = await studentDomainService.getTimeline(id, {
        companyContractId: contractId,
      });
      if (!timeline) {
        return sendError(res, 'Aluno não encontrado', 404);
      }

      return sendSuccess(res, timeline, 'Linha do tempo do aluno carregada com sucesso');
    } catch (error) {
      console.error('Erro ao carregar linha do tempo do aluno:', error);
      return sendStudentDomainLoadError(res, error, 'Erro ao carregar linha do tempo do aluno');
    }
  }
);

export default router;
