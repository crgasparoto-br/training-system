import { Router, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import { studentContractLifecycleService } from '../student-contracts/student-contract-lifecycle.service.js';

const router = Router();

const actorFromRequest = (req: Request) => ({
  userId: req.user?.userId,
  ipAddress: req.ip,
  userAgent: req.get('user-agent') || undefined,
});

router.post('/public/:token/sign', async (req: Request, res: Response) => {
  try {
    const result = await studentContractLifecycleService.signPublicContract(
      req.params.token,
      req.body,
      actorFromRequest(req)
    );

    return sendSuccess(
      res,
      result,
      result.activation.scheduled
        ? 'Contrato assinado e programado para entrar em vigor'
        : 'Contrato assinado e colocado em vigor com sucesso'
    );
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao assinar contrato', 400);
  }
});

export default router;
