import { Router, type Request, type Response } from 'express';
import { academyMasterMiddleware, authMiddleware } from '../auth/auth.middleware.js';
import { sendError, sendSuccess } from '@corrida/utils';
import { bankService } from './bank.service.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const items = await bankService.list();
    return sendSuccess(res, items, 'Bancos carregados com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao carregar bancos', 500);
  }
});

router.post('/sync', academyMasterMiddleware, async (_req: Request, res: Response) => {
  try {
    const items = await bankService.sync();
    return sendSuccess(res, items, 'Catálogo de bancos sincronizado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao sincronizar bancos', 500);
  }
});

export default router;
