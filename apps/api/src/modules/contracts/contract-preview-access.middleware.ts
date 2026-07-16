import { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import {
  canProfessorAccessBlock,
  canProfessorAccessScreen,
} from '../access-control/access-control.service.js';

const prisma = new PrismaClient();

export async function contractPreviewAccessMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
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
      },
    });

    if (!professor) {
      return res.status(404).json({
        success: false,
        error: 'Professor não encontrado',
      });
    }

    const [canManageFinancialContract, canPreviewContractSettings] =
      await Promise.all([
        canProfessorAccessBlock(
          professor,
          'students.actions.manageFinancialContract'
        ),
        canProfessorAccessScreen(professor, 'settings.contract'),
      ]);

    if (!canManageFinancialContract && !canPreviewContractSettings) {
      return res.status(403).json({
        success: false,
        error: 'Perfil sem permissão para acessar este recurso',
      });
    }

    next();
  } catch (error) {
    console.error('Erro ao verificar permissão de prévia de contrato:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao verificar permissão de acesso',
    });
  }
}
