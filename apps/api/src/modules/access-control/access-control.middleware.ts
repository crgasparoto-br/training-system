import { type NextFunction, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { AccessScreenKey } from '@corrida/types';
import { canProfessorAccessScreen } from './access-control.service.js';

const prisma = new PrismaClient();

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
      const professor = await prisma.professor.findUnique({
        where: { userId: req.user.userId },
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

      (req as any).user.professorId = professor.id;
      (req as any).user.contractId = professor.contractId;
      (req as any).user.professorRole = professor.role;
      (req as any).user.collaboratorFunctionId = professor.collaboratorFunctionId;
      (req as any).user.collaboratorFunctionCode = professor.collaboratorFunction.code;
      (req as any).user.contractType = professor.contract.type;

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
