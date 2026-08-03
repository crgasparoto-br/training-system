import { type NextFunction, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ACCESS_BLOCK_CATALOG, type AccessScreenKey } from '@corrida/types';
import { canProfessorAccessScreen, canProfessorAccessBlock } from './access-control.service.js';

const prisma = new PrismaClient();

function applyProfessorAccessContext(req: Request, professor: {
  id: string;
  contractId: string;
  role: string;
  collaboratorFunctionId: string;
  collaboratorFunction: { code: string };
  contract: { type: string };
}) {
  (req as any).user.professorId = professor.id;
  (req as any).user.contractId = professor.contractId;
  (req as any).user.professorRole = professor.role;
  (req as any).user.collaboratorFunctionId = professor.collaboratorFunctionId;
  (req as any).user.collaboratorFunctionCode = professor.collaboratorFunction.code;
  (req as any).user.contractType = professor.contract.type;
}

async function findAuthenticatedProfessor(req: Request) {
  return prisma.professor.findFirst({
    where: {
      userId: req.user!.userId,
      currentStatus: 'active',
      user: {
        isActive: true,
      },
    },
    include: {
      collaboratorFunction: true,
      contract: {
        select: {
          id: true,
          type: true,
          document: true,
          name: true,
        },
      },
    },
  });
}

export function screenAccessMiddleware(screenKey: AccessScreenKey | string | Array<AccessScreenKey | string>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Não autenticado',
      });
    }

    if (req.user.type !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem acessar este recurso',
      });
    }

    try {
      const professor = await findAuthenticatedProfessor(req);

      if (!professor) {
        return res.status(404).json({
          success: false,
          error: 'Professor não encontrado',
        });
      }

      const screenKeys = Array.isArray(screenKey) ? screenKey : [screenKey];
      const accessChecks = await Promise.all(
        screenKeys.map((key) => canProfessorAccessScreen(professor, key))
      );
      const hasAccess = accessChecks.some(Boolean);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'Perfil sem permissão para acessar este recurso',
        });
      }

      applyProfessorAccessContext(req, professor);
      next();
    } catch (error) {
      console.error('Erro ao verificar permissão de tela:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao verificar permissão de acesso',
      });
    }
  };
}

export function blockAccessMiddleware(blockKey: string | Array<string>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Não autenticado',
      });
    }

    if (req.user.type !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem acessar este recurso',
      });
    }

    try {
      const professor = await findAuthenticatedProfessor(req);

      if (!professor) {
        return res.status(404).json({
          success: false,
          error: 'Professor não encontrado',
        });
      }

      const blockKeys = Array.isArray(blockKey) ? blockKey : [blockKey];
      const accessChecks = await Promise.all(
        blockKeys.map((key) => canProfessorAccessBlock(professor, key))
      );
      const hasAccess = accessChecks.some(Boolean);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'Perfil sem permissão para acessar este recurso',
        });
      }

      applyProfessorAccessContext(req, professor);
      next();
    } catch (error) {
      console.error('Erro ao verificar permissão de bloco:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao verificar permissão de acesso',
      });
    }
  };
}

/**
 * Sensitive permissions are explicit grants. Unlike ordinary block access,
 * neither the master role nor a profile default can bypass the persisted row.
 */
export function explicitBlockAccessMiddleware(blockKey: string | Array<string>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Não autenticado',
      });
    }

    if (req.user.type !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem acessar este recurso',
      });
    }

    try {
      const professor = await findAuthenticatedProfessor(req);

      if (!professor) {
        return res.status(404).json({
          success: false,
          error: 'Professor não encontrado',
        });
      }

      const blockKeys = Array.isArray(blockKey) ? blockKey : [blockKey];
      const accessChecks = await Promise.all(
        blockKeys.map(async (key) => {
          const block = ACCESS_BLOCK_CATALOG.find((item) => item.key === key);
          if (!block || !(await canProfessorAccessScreen(professor, block.screenKey))) {
            return false;
          }

          const explicitPermission = await prisma.accessPermission.findFirst({
            where: {
              collaboratorFunctionId: professor.collaboratorFunctionId,
              screenKey: block.screenKey,
              blockKey: key,
              canView: true,
            },
            select: { id: true },
          });

          return Boolean(explicitPermission);
        })
      );

      if (!accessChecks.some(Boolean)) {
        return res.status(403).json({
          success: false,
          error: 'Ação sensível sem concessão explícita',
        });
      }

      applyProfessorAccessContext(req, professor);
      next();
    } catch (error) {
      console.error('Erro ao verificar concessão explícita:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao verificar permissão de acesso',
      });
    }
  };
}
