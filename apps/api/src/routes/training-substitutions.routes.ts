import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, alunoMiddleware, professorMiddleware } from '../modules/auth/auth.middleware.js';
import {
  normalizeRequestedStudentContractId, resolveActiveStudentMembership,
  StudentAccountContextError,
} from '../modules/alunos/student-account-context.service.js';
import {
  trainingSubstitutionService, TrainingSubstitutionError, type SubstitutionActor,
} from '../modules/workout/training-substitution.service.js';

const router: Router = Router();
router.use(authMiddleware);
router.use((req: Request, res: Response, next: NextFunction) =>
  req.user?.type === 'professor'
    ? professorMiddleware(req, res, next)
    : alunoMiddleware(req, res, next),
);

const idSchema = z.string().trim().min(1).max(128);
const createSchema = z.object({
  kind: z.enum(['exercise', 'session']),
  context: z.enum(['planning', 'review', 'execution']),
  originalUnitId: idSchema,
  replacementUnitId: idSchema,
  reason: z.string().trim().min(3).max(500),
  operationKey: z.string().trim().min(8).max(128),
  expectedExecutionVersion: z.number().int().nonnegative().optional(),
}).strict();
const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500).nullable().optional(),
}).strict();

async function resolveActor(req: Request): Promise<SubstitutionActor> {
  const user = req.user!;
  if (user.type === 'professor') {
    if (!user.professorId || !user.contractId) {
      throw new TrainingSubstitutionError(403, 'SUBSTITUTION_FORBIDDEN', 'Sem acesso ao contrato.');
    }
    return { kind: 'professor', userId: user.userId, professorId: user.professorId, contractId: user.contractId };
  }
  if (user.type === 'aluno') {
    const membership = await resolveActiveStudentMembership(
      user.userId, normalizeRequestedStudentContractId(req.header('x-contract-id')),
    );
    return { kind: 'student', userId: user.userId, alunoId: membership.id, contractId: membership.contractId };
  }
  throw new TrainingSubstitutionError(403, 'SUBSTITUTION_FORBIDDEN', 'Sem acesso ao treino.');
}

function sendFailure(res: Response, error: unknown) {
  if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos para a substituição.', 400, error.errors);
  if (error instanceof TrainingSubstitutionError) {
    return sendError(res, error.message, error.status, { code: error.code });
  }
  if (error instanceof StudentAccountContextError) {
    return sendError(res, error.message, error.code === 'STUDENT_CONTRACT_CONTEXT_REQUIRED' ? 409 : 404);
  }
  console.error('Training substitution operation failed:', error);
  return sendError(res, 'Não foi possível processar a substituição.', 500);
}

/** Todas as rotas verificam contrato e autoridade real na transação definitiva. */
router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = idSchema.parse(req.params.sessionId);
    const actor = await resolveActor(req);
    return sendSuccess(res, await trainingSubstitutionService.list({ sessionId, actor }));
  } catch (error) { return sendFailure(res, error); }
});

router.get('/sessions/:sessionId/alternatives', async (req: Request, res: Response) => {
  try {
    const sessionId = idSchema.parse(req.params.sessionId);
    const kind = z.enum(['exercise', 'session']).parse(req.query.kind);
    const originalUnitId = idSchema.parse(req.query.originalUnitId);
    const actor = await resolveActor(req);
    return sendSuccess(res, await trainingSubstitutionService.alternatives({
      sessionId, actor, kind, originalUnitId,
    }));
  } catch (error) { return sendFailure(res, error); }
});

router.post('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = idSchema.parse(req.params.sessionId);
    const actor = await resolveActor(req);
    const payload = createSchema.parse(req.body);
    return sendSuccess(res, await trainingSubstitutionService.create({ sessionId, actor, ...payload }));
  } catch (error) { return sendFailure(res, error); }
});

router.post('/sessions/:sessionId/:substitutionId/review', async (req: Request, res: Response) => {
  try {
    const sessionId = idSchema.parse(req.params.sessionId);
    const substitutionId = idSchema.parse(req.params.substitutionId);
    const actor = await resolveActor(req);
    if (actor.kind !== 'professor') {
      throw new TrainingSubstitutionError(403, 'SUBSTITUTION_FORBIDDEN', 'Somente o professor pode revisar uma troca.');
    }
    const payload = reviewSchema.parse(req.body);
    return sendSuccess(res, await trainingSubstitutionService.review({
      sessionId, substitutionId, actor, ...payload,
    }));
  } catch (error) { return sendFailure(res, error); }
});

export default router;
