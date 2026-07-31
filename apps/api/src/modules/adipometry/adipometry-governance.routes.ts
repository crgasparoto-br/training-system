import { Router, type Request, type Response } from 'express';
import {
  ADIPOMETRY_PROTOCOL_APPROVAL_BLOCK_KEY,
  ADIPOMETRY_RESPONSIBILITY_MANAGEMENT_BLOCK_KEY,
} from '@corrida/types';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  explicitBlockAccessMiddleware,
  screenAccessMiddleware,
} from '../access-control/access-control.middleware.js';
import {
  AdipometryGovernanceError,
  adipometryGovernanceService,
} from './adipometry-governance.service.js';

const router = Router();

function sendGovernanceError(res: Response, error: unknown) {
  if (error instanceof AdipometryGovernanceError) {
    return sendError(res, error.message, error.statusCode);
  }

  console.error('Erro na governança clínica da adipometria:', error);
  return sendError(res, 'Erro ao processar a governança clínica da adipometria', 500);
}

router.use(authMiddleware);
router.use(professorMiddleware);

router.get(
  '/adipometry-governance',
  screenAccessMiddleware('settings.contract'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const governance = await adipometryGovernanceService.getGovernance(
        user.contractId,
        user.professorId
      );
      return sendSuccess(
        res,
        governance,
        'Governança clínica da adipometria recuperada com sucesso'
      );
    } catch (error) {
      return sendGovernanceError(res, error);
    }
  }
);

router.put(
  '/adipometry-governance/responsible',
  screenAccessMiddleware('settings.contract'),
  explicitBlockAccessMiddleware(ADIPOMETRY_RESPONSIBILITY_MANAGEMENT_BLOCK_KEY),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const governance = await adipometryGovernanceService.designate(
        user.contractId,
        user.userId,
        user.professorId,
        req.body
      );
      return sendSuccess(res, governance, 'Responsável técnico atualizado com sucesso');
    } catch (error) {
      return sendGovernanceError(res, error);
    }
  }
);

router.post(
  '/adipometry-governance/protocols/:code/:version/approve',
  screenAccessMiddleware('settings.contract'),
  explicitBlockAccessMiddleware(ADIPOMETRY_PROTOCOL_APPROVAL_BLOCK_KEY),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const governance = await adipometryGovernanceService.approve(
        user.contractId,
        user.userId,
        user.professorId,
        req.params.code,
        Number(req.params.version),
        req.body
      );
      return sendSuccess(res, governance, 'Versão clínica aprovada com sucesso');
    } catch (error) {
      return sendGovernanceError(res, error);
    }
  }
);

router.post(
  '/adipometry-governance/protocols/:code/:version/revoke',
  screenAccessMiddleware('settings.contract'),
  explicitBlockAccessMiddleware(ADIPOMETRY_PROTOCOL_APPROVAL_BLOCK_KEY),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const governance = await adipometryGovernanceService.revoke(
        user.contractId,
        user.userId,
        user.professorId,
        req.params.code,
        Number(req.params.version),
        req.body
      );
      return sendSuccess(res, governance, 'Aprovação clínica revogada com sucesso');
    } catch (error) {
      return sendGovernanceError(res, error);
    }
  }
);

export default router;
