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
 * Middleware para verificar autenticação
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Obter token do header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token não fornecido',
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
      error: 'Token inválido ou expirado',
    });
  }
}

/**
 * Middleware para verificar se é educador
 */
export async function educatorMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Não autenticado',
    });
  }

  if (req.user.type !== 'educator') {
    return res.status(403).json({
      success: false,
      error: 'Apenas educadores podem acessar este recurso',
    });
  }

  try {
    // Buscar educatorId do banco
    const user = await authService.getUserById(req.user.userId);
    
    if (!user?.educator) {
      return res.status(404).json({
        success: false,
        error: 'Educador não encontrado',
      });
    }

    // Adicionar educatorId ao request
    (req as any).user.educatorId = user.educator.id;
    (req as any).user.contractId = user.educator.contractId;
    (req as any).user.educatorRole = user.educator.role;

    next();
  } catch (error) {
    console.error('Erro ao buscar educador:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao verificar educador',
    });
  }
}

/**
 * Middleware para verificar se é educador master
 */
export async function masterMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Não autenticado',
    });
  }

  if (req.user.type !== 'educator') {
    return res.status(403).json({
      success: false,
      error: 'Apenas educadores podem acessar este recurso',
    });
  }

  try {
    const user = await authService.getUserById(req.user.userId);

    if (!user?.educator) {
      return res.status(404).json({
        success: false,
        error: 'Educador não encontrado',
      });
    }

    if (user.educator.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Apenas educador master pode acessar este recurso',
      });
    }

    (req as any).user.educatorId = user.educator.id;
    (req as any).user.contractId = user.educator.contractId;
    (req as any).user.educatorRole = user.educator.role;

    next();
  } catch (error) {
    console.error('Erro ao buscar educador master:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao verificar educador master',
    });
  }
}

/**
 * Middleware para verificar se é aluno
 */
export function studentMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Não autenticado',
    });
  }

  if (req.user.type !== 'student') {
    return res.status(403).json({
      success: false,
      error: 'Apenas alunos podem acessar este recurso',
    });
  }

  next();
}
