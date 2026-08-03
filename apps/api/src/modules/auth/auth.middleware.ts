import { PrismaClient } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import type { AuthenticatedUserPayload } from '@corrida/types';

const prisma = new PrismaClient();

// Estender tipo Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUserPayload;
    }
  }
}

type ActiveProfessorContext = {
  id: string;
  contractId: string;
  role: 'master' | 'professor';
  contract: {
    type: string;
  };
};

async function getActiveProfessorContext(userId: string): Promise<ActiveProfessorContext | null> {
  return prisma.professor.findFirst({
    where: {
      userId,
      currentStatus: 'active',
      user: {
        isActive: true,
      },
    },
    select: {
      id: true,
      contractId: true,
      role: true,
      contract: {
        select: {
          type: true,
        },
      },
    },
  });
}

function applyProfessorContext(req: Request, professor: ActiveProfessorContext) {
  req.user!.professorId = professor.id;
  req.user!.contractId = professor.contractId;
  req.user!.professorRole = professor.role;
}

function sendProfessorUnavailable(res: Response) {
  return res.status(404).json({
    success: false,
    error: 'Professor não encontrado',
  });
}

/**
 * Middleware para verificar autenticação.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token não fornecido',
      });
    }

    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);
    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Token inválido ou expirado',
    });
  }
}

/**
 * Middleware para verificar se é professor ativo.
 *
 * A assinatura do JWT não é autoridade suficiente: a situação atual do usuário
 * e do vínculo profissional é reavaliada a cada requisição protegida.
 */
export async function professorMiddleware(req: Request, res: Response, next: NextFunction) {
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
    const professor = await getActiveProfessorContext(req.user.userId);

    if (!professor) {
      return sendProfessorUnavailable(res);
    }

    applyProfessorContext(req, professor);
    next();
  } catch (error) {
    console.error('Erro ao buscar professor:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao verificar professor',
    });
  }
}

/**
 * Middleware para verificar se é professor master ativo.
 */
export async function masterMiddleware(req: Request, res: Response, next: NextFunction) {
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
    const professor = await getActiveProfessorContext(req.user.userId);

    if (!professor) {
      return sendProfessorUnavailable(res);
    }

    if (professor.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professor master pode acessar este recurso',
      });
    }

    applyProfessorContext(req, professor);
    next();
  } catch (error) {
    console.error('Erro ao buscar professor master:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao verificar professor master',
    });
  }
}

/**
 * Middleware para verificar se é professor master ativo com contrato academy.
 */
export async function academyMasterMiddleware(req: Request, res: Response, next: NextFunction) {
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
    const professor = await getActiveProfessorContext(req.user.userId);

    if (!professor) {
      return sendProfessorUnavailable(res);
    }

    if (professor.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professor master pode acessar este recurso',
      });
    }

    if (professor.contract.type !== 'academy') {
      return res.status(403).json({
        success: false,
        error: 'Apenas contratos do tipo academia podem gerenciar professores',
      });
    }

    applyProfessorContext(req, professor);
    next();
  } catch (error) {
    console.error('Erro ao validar professor master da academia:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao verificar acesso do professor master',
    });
  }
}

/**
 * Middleware para verificar se é aluno.
 */
export function alunoMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Não autenticado',
    });
  }

  if (req.user.type !== 'aluno') {
    return res.status(403).json({
      success: false,
      error: 'Apenas alunos podem acessar este recurso',
    });
  }

  next();
}
