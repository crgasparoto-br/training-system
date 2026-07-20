import { Router, type NextFunction, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { blockAccessMiddleware } from '../access-control/access-control.middleware.js';
import { studentAccessScopeService } from '../alunos/student-access-scope.service.js';
import legacyContractRoutes from './contract.routes.js';
import collaboratorContractRoutes from './collaborator-contract.routes.js';
import { contractAuthoritativeGenerationService } from './contract-authoritative-generation.service.js';
import { contractPreviewAccessMiddleware } from './contract-preview-access.middleware.js';
import { contractPublicAccessService } from './contract-public-access.service.js';

const router: Router = Router();

const actorFromRequest = (req: Request) => ({
  userId: req.user?.userId,
  professorId: (req as any).user?.professorId as string | undefined,
  professorRole: (req as any).user?.professorRole as string | undefined,
  ipAddress: req.ip,
  userAgent: req.get('user-agent') || undefined,
});

const studentAccessContextFromRequest = (req: Request) => ({
  professorId: (req as any).user?.professorId as string | undefined,
  professorRole: (req as any).user?.professorRole as string | undefined,
  companyContractId: (req as any).user?.contractId as string | undefined,
});

const companyContractIdFromRequest = (req: Request) => {
  const companyContractId = (req as any).user?.contractId;
  return typeof companyContractId === 'string' && companyContractId.trim()
    ? companyContractId.trim()
    : null;
};

const contractGenerationErrorStatus = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('fora do escopo') || message.includes('não pertence ao contrato autenticado')) {
    return 404;
  }
  return 400;
};

const studentScopeError = (res: Response, error: unknown) =>
  sendError(
    res,
    error instanceof Error ? error.message : 'Recurso contratual não encontrado',
    404
  );

router.get('/public/:token', async (req: Request, res: Response) => {
  try {
    const contract = await contractPublicAccessService.open(
      req.params.token,
      actorFromRequest(req)
    );
    return sendSuccess(
      res,
      {
        id: contract.id,
        title: contract.title,
        status: contract.status,
        renderedHtml: contract.renderedHtml,
        signedAt: contract.signedAt,
      },
      'Contrato recuperado com sucesso'
    );
  } catch (error: any) {
    return sendError(res, error.message || 'Contrato não encontrado', 404);
  }
});

router.use(authMiddleware);
router.use(professorMiddleware);

router.post(
  '/preview',
  contractPreviewAccessMiddleware,
  async (req: Request, res: Response) => {
    try {
      const companyContractId = companyContractIdFromRequest(req);
      if (!companyContractId) return sendError(res, 'Contrato autenticado não encontrado', 403);

      const preview = await contractAuthoritativeGenerationService.preview(
        companyContractId,
        req.body,
        actorFromRequest(req)
      );
      return sendSuccess(res, preview, 'Prévia gerada com sucesso');
    } catch (error: any) {
      return sendError(
        res,
        error.message || 'Erro ao gerar prévia',
        contractGenerationErrorStatus(error)
      );
    }
  }
);

router.post(
  '/generate',
  blockAccessMiddleware('students.actions.manageFinancialContract'),
  async (req: Request, res: Response) => {
    try {
      const companyContractId = companyContractIdFromRequest(req);
      if (!companyContractId) return sendError(res, 'Contrato autenticado não encontrado', 403);

      const contract = await contractAuthoritativeGenerationService.generate(
        companyContractId,
        req.body,
        actorFromRequest(req)
      );
      return sendSuccess(res, contract, 'Contrato gerado com sucesso', 201);
    } catch (error: any) {
      return sendError(
        res,
        error.message || 'Erro ao gerar contrato',
        contractGenerationErrorStatus(error)
      );
    }
  }
);

// Must run before student-only document guards and the legacy router.
router.use(collaboratorContractRoutes);

router.use(
  '/alunos/:alunoId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await studentAccessScopeService.assertAlunoAccess(
        req.params.alunoId,
        studentAccessContextFromRequest(req)
      );
      return next();
    } catch (error) {
      return studentScopeError(res, error);
    }
  }
);

router.use(
  '/documents/:contractDocumentId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await studentAccessScopeService.assertContractDocumentAccess(
        req.params.contractDocumentId,
        studentAccessContextFromRequest(req)
      );
      return next();
    } catch (error) {
      return studentScopeError(res, error);
    }
  }
);

router.get(
  '/available-for-student',
  async (req: Request, res: Response, next: NextFunction) => {
    const alunoId = typeof req.query.alunoId === 'string' ? req.query.alunoId.trim() : '';
    if (!alunoId) return next();

    try {
      await studentAccessScopeService.assertAlunoAccess(
        alunoId,
        studentAccessContextFromRequest(req)
      );
      return next();
    } catch (error) {
      return studentScopeError(res, error);
    }
  }
);

router.use(legacyContractRoutes);

export default router;
