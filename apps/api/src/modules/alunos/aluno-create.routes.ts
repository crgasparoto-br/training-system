import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { CreateAlunoSchema, sendError, sendSuccess } from '@corrida/utils';
import { z } from 'zod';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { FixedScheduleError } from '../agenda/fixed-schedule.service.js';
import { alunoService } from './aluno.service.js';
import { StudentIdentityLockTimeoutError } from './student-identity.service.js';

const router: Router = Router();

const isDuplicateEmailError = (error: any) => {
  if (error?.message === 'Email já está registrado' || error?.message === 'Email jÃ¡ estÃ¡ registrado') {
    return true;
  }

  if (error?.code !== 'P2002') return false;
  const target = error?.meta?.target;
  if (Array.isArray(target)) {
    return target.some((item) => String(item).toLowerCase().includes('email'));
  }

  return String(target ?? '').toLowerCase().includes('email');
};

const isServiceBusinessError = (error: any) => {
  const message = typeof error?.message === 'string' ? error.message : '';
  return (
    message === 'Serviço selecionado não pertence ao contrato' ||
    message === 'Serviço selecionado está inativo' ||
    message === 'Selecione um serviço principal no campo Serviço de Interesse'
  );
};

router.post(
  '/',
  authMiddleware,
  professorMiddleware,
  async (req: Request, res: Response) => {
    try {
      const validatedData = CreateAlunoSchema.parse(req.body);
      const professorId = (req as any).user?.professorId as string | undefined;

      if (!professorId) {
        return sendError(res, 'Professor não encontrado', 404);
      }

      const aluno = await alunoService.create({
        ...validatedData,
        professorId,
      });

      return sendSuccess(res, aluno, 'Aluno criado com sucesso', 201);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 'Dados inválidos', 400, error.errors);
      }

      if (isDuplicateEmailError(error)) {
        return sendError(res, 'Email já está registrado', 409);
      }

      if (isServiceBusinessError(error)) {
        return sendError(res, error.message, 400);
      }

      if (error instanceof StudentIdentityLockTimeoutError) {
        return sendError(res, error.message, 409);
      }

      if (error instanceof FixedScheduleError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
          stage: error.stage,
          rowIndex: error.rowIndex,
          reasonCode: error.reasonCode,
        });
      }

      const correlationId = randomUUID();
      console.error('Erro ao criar aluno:', {
        correlationId,
        stage: 'aluno.create',
        errorName: error?.name,
        errorCode: error?.code,
        message: error?.message,
        stack: error?.stack,
      });

      return sendError(res, 'Erro ao criar aluno', 500, {
        code: 'ALUNO_CREATE_INTERNAL_ERROR',
        correlationId,
      });
    }
  }
);

export default router;
