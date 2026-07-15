import { Router, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { studentContractLifecycleService } from '../student-contracts/student-contract-lifecycle.service.js';
import legacyContractRoutes from './contract.routes.js';
import { contractAuthoritativeGenerationService } from './contract-authoritative-generation.service.js';
import { contractDocumentService } from './contract-document.service.js';

const router: Router = Router();

const actorFromRequest = (req: Request) => ({
  userId: req.user?.userId,
  ipAddress: req.ip,
  userAgent: req.get('user-agent') || undefined,
});

const companyContractIdFromRequest = (req: Request) => {
  const companyContractId = (req as any).user?.contractId;
  return typeof companyContractId === 'string' && companyContractId.trim()
    ? companyContractId.trim()
    : null;
};

router.get('/public/:token', async (req: Request, res: Response) => {
  try {
    const contract = await contractDocumentService.openPublic(
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

router.post('/public/:token/sign', async (req: Request, res: Response) => {
  try {
    const result = await studentContractLifecycleService.signPublicContract(
      req.params.token,
      req.body,
      actorFromRequest(req)
    );
    return sendSuccess(res, result, 'Contrato assinado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao assinar contrato', 400);
  }
});

router.use(authMiddleware);
router.use(professorMiddleware);

router.post('/preview', async (req: Request, res: Response) => {
  try {
    const companyContractId = companyContractIdFromRequest(req);
    if (!companyContractId) {
      return sendError(res, 'Contrato autenticado não encontrado', 403);
    }

    const preview = await contractAuthoritativeGenerationService.preview(
      companyContractId,
      req.body
    );
    return sendSuccess(res, preview, 'Prévia gerada com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao gerar prévia', 400);
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const companyContractId = companyContractIdFromRequest(req);
    if (!companyContractId) {
      return sendError(res, 'Contrato autenticado não encontrado', 403);
    }

    const contract = await contractAuthoritativeGenerationService.generate(
      companyContractId,
      req.body,
      actorFromRequest(req)
    );
    return sendSuccess(res, contract, 'Contrato gerado com sucesso', 201);
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao gerar contrato', 400);
  }
});

router.use(legacyContractRoutes);

export default router;
