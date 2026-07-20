import { Router, type NextFunction, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware } from '../auth/auth.middleware.js';
import {
  getMostPermissiveDataScopeForProfessor,
  screenAccessMiddleware,
} from '../access-control/index.js';
import { professorService } from './professor.service.js';

const router: Router = Router();

function getActorProfessor(req: Request) {
  return {
    role: (req as any).user.professorRole,
    collaboratorFunction: {
      id: (req as any).user.collaboratorFunctionId,
      code: (req as any).user.collaboratorFunctionCode,
    },
  };
}

async function findAccessibleCollaborator(
  req: Request,
  screens: Array<'collaborators.registration' | 'collaborators.consultation'>
) {
  const contractId = (req as any).user.contractId;
  const actorProfessorId = (req as any).user.professorId;
  if (!contractId) return null;

  const dataScope = await getMostPermissiveDataScopeForProfessor(
    getActorProfessor(req),
    screens
  );
  if (!dataScope) return null;

  const collaborators = await professorService.listByAccessScope(
    contractId,
    actorProfessorId,
    dataScope,
    'all'
  );
  return collaborators.find((item) => item.id === req.params.id) ?? null;
}

router.get(
  '/:id',
  authMiddleware,
  screenAccessMiddleware(['collaborators.registration', 'collaborators.consultation']),
  async (req: Request, res: Response) => {
    try {
      const collaborator = await findAccessibleCollaborator(req, [
        'collaborators.consultation',
        'collaborators.registration',
      ]);

      if (!collaborator) {
        return sendError(res, 'Colaborador não encontrado', 404);
      }

      return sendSuccess(res, collaborator, 'Colaborador recuperado com sucesso');
    } catch (error) {
      console.error('Erro ao consultar colaborador:', error);
      return sendError(res, 'Erro ao consultar colaborador', 500);
    }
  }
);

router.put(
  '/:id',
  authMiddleware,
  screenAccessMiddleware('collaborators.registration'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const collaborator = await findAccessibleCollaborator(req, [
        'collaborators.registration',
      ]);

      if (!collaborator) {
        return sendError(res, 'Colaborador não encontrado', 404);
      }

      return next();
    } catch (error) {
      console.error('Erro ao validar acesso ao colaborador:', error);
      return sendError(res, 'Erro ao validar acesso ao colaborador', 500);
    }
  }
);

export default router;
