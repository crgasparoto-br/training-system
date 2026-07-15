import { Router, type NextFunction, type Request, type Response } from 'express';
import { sendError } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { blockAccessMiddleware } from '../access-control/access-control.middleware.js';
import { parseActiveContractTemplateReference } from '../student-contracts/student-contract-reference.js';

const router: Router = Router();

router.post(
  '/:id/contracts',
  authMiddleware,
  professorMiddleware,
  blockAccessMiddleware('students.actions.manageFinancialContract'),
  (req: Request, res: Response, next: NextFunction) => {
    const contractId =
      typeof req.body?.contractId === 'string' ? req.body.contractId.trim() : '';
    if (!parseActiveContractTemplateReference(contractId)) {
      return next();
    }

    const status = req.body?.status;
    if (status && status !== 'draft' && status !== 'active') {
      return sendError(
        res,
        'Para gerar um contrato por modelo, use o estado rascunho ou ativo.',
        400
      );
    }

    return next();
  }
);

export default router;