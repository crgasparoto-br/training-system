import { Router, Request, Response } from 'express';
import { authService } from './auth.service';
import { authMiddleware } from './auth.middleware';
import { LoginSchema, RegisterSchema } from '@corrida/utils';
import { sendSuccess, sendError } from '@corrida/utils';

const router: Router = Router();

/**
 * POST /api/v1/auth/register
 * Registrar novo usuÃ¡rio
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    // Validar dados
    const validation = RegisterSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.errors.map((e) => e.message).join(', ');
      return sendError(res, errors, 400);
    }

    // Registrar usuÃ¡rio
    const result = await authService.register(validation.data);

    return sendSuccess(res, result, 'UsuÃ¡rio registrado com sucesso', 201);
  } catch (error: any) {
    return sendError(res, error.message, 400);
  }
});

/**
 * POST /api/v1/auth/login
 * Fazer login
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    // Validar dados
    const validation = LoginSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.errors.map((e) => e.message).join(', ');
      return sendError(res, errors, 400);
    }

    // Fazer login
    const result = await authService.login(validation.data);

    return sendSuccess(res, result, 'Login realizado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message, 401);
  }
});

/**
 * GET /api/v1/auth/me
 * Obter dados do usuÃ¡rio autenticado
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'NÃ£o autenticado', 401);
    }

    const user = await authService.getAuthenticatedUserById(req.user.userId);

    if (!user) {
      return sendError(res, 'UsuÃ¡rio nÃ£o encontrado', 404);
    }

    return sendSuccess(res, user);
  } catch (error: any) {
    return sendError(res, error.message, 500);
  }
});

/**
 * POST /api/v1/auth/logout
 * Fazer logout (client-side, apenas para confirmar)
 */
router.post('/logout', authMiddleware, (req: Request, res: Response) => {
  return sendSuccess(res, null, 'Logout realizado com sucesso');
});

export default router;

