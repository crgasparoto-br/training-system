import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import type { JwtPayload } from '@corrida/types';

// Estender tipo Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware para verificar autenticaÃ§Ã£o
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Obter token do header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token nÃ£o fornecido',
      });
    }

    const token = authHeader.substring(7);

    // Verificar token
    const decoded = authService.verifyToken(token);

    // Adicionar user ao request
    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Token invÃ¡lido ou expirado',
    });
  }
}

/**
 * Middleware para verificar se Ã© professor
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
    const professor = await authService.getProfessorByUserId(req.user.userId);

    if (!professor) {
      return res.status(404).json({
        success: false,
        error: 'Professor não encontrado',
      });
    }

    // Adicionar professorId ao request
    (req as any).user.professorId = professor.id;
    (req as any).user.contractId = professor.contractId;
    (req as any).user.professorRole = professor.role;

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
 * Middleware para verificar se é professor master
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
    const professor = await authService.getProfessorByUserId(req.user.userId);

    if (!professor) {
      return res.status(404).json({
        success: false,
        error: 'Professor não encontrado',
      });
    }

    if (professor.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professor master pode acessar este recurso',
      });
    }

    (req as any).user.professorId = professor.id;
    (req as any).user.contractId = professor.contractId;
    (req as any).user.professorRole = professor.role;

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
 * Middleware para verificar se e professor master com contrato academy
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
    const professor = await authService.getProfessorByUserId(req.user.userId);

    if (!professor) {
      return res.status(404).json({
        success: false,
        error: 'Professor não encontrado',
      });
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

    (req as any).user.professorId = professor.id;
    (req as any).user.contractId = professor.contractId;
    (req as any).user.professorRole = professor.role;

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
 * Middleware para verificar se Ã© aluno
 */
export function alunoMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'NÃ£o autenticado',
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

