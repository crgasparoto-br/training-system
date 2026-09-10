import { Router, type Request, type Response } from 'express';
import { CreateAlunoSchema, sendError, sendSuccess } from '@corrida/utils';
import { z } from 'zod';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { FixedScheduleError } from '../agenda/fixed-schedule.service.js';
import { alunoService } from './aluno.service.js';
import {
  handleKnownStudentCreationError,
  sendUnexpectedStudentCreationError,
} from './student-create-error-boundary.js';

const router: Router = Router();

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

      const knownErrorResponse = handleKnownStudentCreationError(res, error);
      if (knownErrorResponse) return knownErrorResponse;

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

      return sendUnexpectedStudentCreationError(res, error, {
        stage: 'aluno.create',
        logMessage: 'Erro ao criar aluno:',
      });
    }
  }
);

export default router;
