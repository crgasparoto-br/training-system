import { Router, Request, Response } from 'express';
import { authService } from './auth.service.js';
import { authMiddleware } from './auth.middleware.js';
import { getProfessionalActorAccessControl } from '../access-control/professional-actor.service.js';
import { ForgotPasswordSchema, LoginSchema, RegisterSchema, ResetPasswordSchema } from '@corrida/utils';
import { sendSuccess, sendError } from '@corrida/utils';

const router: Router = Router();

async function enrichProfessionalActor<T extends {
  id: string;
  type: string;
  professor?: unknown;
  accessControl?: unknown;
}>(user: T): Promise<T> {
  if (user.type !== 'professor' || user.professor) return user;
  const accessControl = await getProfessionalActorAccessControl(user.id);
  return accessControl ? { ...user, accessControl } : user;
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    const validation = RegisterSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, validation.error.errors.map((e) => e.message).join(', '), 400);
    }
    return sendSuccess(
      res,
      await authService.register(validation.data),
      'Usuário registrado com sucesso',
      201
    );
  } catch (error: any) {
    return sendError(res, error.message, 400);
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const validation = LoginSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, validation.error.errors.map((e) => e.message).join(', '), 400);
    }
    const result = await authService.login(validation.data);
    return sendSuccess(
      res,
      { ...result, user: await enrichProfessionalActor(result.user) },
      'Login realizado com sucesso'
    );
  } catch (error: any) {
    return sendError(res, error.message, 401);
  }
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const validation = ForgotPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, validation.error.errors.map((e) => e.message).join(', '), 400);
    }
    const result = await authService.requestPasswordReset(validation.data.email);
    return sendSuccess(res, result, result.message);
  } catch (error: any) {
    return sendError(res, error.message, 400);
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const validation = ResetPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, validation.error.errors.map((e) => e.message).join(', '), 400);
    }
    const result = await authService.resetPassword(validation.data);
    return sendSuccess(res, result, result.message);
  } catch (error: any) {
    return sendError(res, error.message, 400);
  }
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) return sendError(res, 'Não autenticado', 401);
    const user = await authService.getAuthenticatedUserById(req.user.userId);
    if (!user) return sendError(res, 'Usuário não encontrado', 404);
    return sendSuccess(res, await enrichProfessionalActor(user));
  } catch (error: any) {
    return sendError(res, error.message, 500);
  }
});

router.post('/logout', authMiddleware, (_req: Request, res: Response) => {
  return sendSuccess(res, null, 'Logout realizado com sucesso');
});

export default router;
