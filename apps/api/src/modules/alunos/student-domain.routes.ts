import { Router, Request, Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { blockAccessMiddleware } from '../access-control/access-control.middleware.js';
import { alunoService } from './aluno.service.js';
import { studentDomainService } from './student-domain.service.js';
import { studentParqBoundaryService } from './student-parq-boundary.service.js';

const router: Router = Router();

router.use(authMiddleware);
router.use(professorMiddleware);

const getProfessorContext = (req: Request) => ({
  professorId: (req as any).user.professorId as string | undefined,
  professorRole: (req as any).user.professorRole as 'master' | 'professor' | undefined,
  contractId: (req as any).user.contractId as string | undefined,
});

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
      return sendError(res, 'Erro ao carregar resumo segmentado do aluno', 500);
    }
  }
);

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

      const profile = await studentDomainService.getProfile(id, {
        companyContractId: contractId,
      });
      if (!profile) {
        return sendError(res, 'Aluno não encontrado', 404);
      }

      return sendSuccess(res, profile, 'Perfil segmentado do aluno carregado com sucesso');
    } catch (error) {
      console.error('Erro ao carregar perfil segmentado do aluno:', error);
      return sendError(res, 'Erro ao carregar perfil segmentado do aluno', 500);
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
      return sendError(res, 'Erro ao carregar intake segmentado do aluno', 500);
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
      return sendError(res, 'Erro ao carregar avaliações segmentadas do aluno', 500);
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
      return sendError(res, 'Erro ao carregar dados financeiros segmentados do aluno', 500);
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
      return sendError(res, 'Erro ao carregar integrações do aluno', 500);
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
      return sendError(res, 'Erro ao carregar atividades importadas do aluno', 500);
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
      return sendError(res, 'Erro ao carregar linha do tempo do aluno', 500);
    }
  }
);

export default router;
