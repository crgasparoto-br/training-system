import { Router, type NextFunction, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { blockAccessMiddleware } from '../access-control/access-control.middleware.js';
import { alunoService } from './aluno.service.js';
import { studentParqBoundaryService } from './student-parq-boundary.service.js';
import {
  assertNoLegacyParqWrite,
  LegacyParqWriteError,
} from './student-parq-legacy-cutover.js';

const router: Router = Router();
const protectedRoute = [authMiddleware, professorMiddleware] as const;

const getProfessorContext = (req: Request) => ({
  professorId: (req as any).user.professorId as string | undefined,
  professorRole: (req as any).user.professorRole as 'master' | 'professor' | undefined,
  contractId: (req as any).user.contractId as string | undefined,
});

async function ensureAlunoAccess(req: Request, res: Response, alunoId: string) {
  const { professorId, professorRole, contractId } = getProfessorContext(req);
  if (!professorId || !contractId) {
    sendError(res, 'Cadastro não encontrado', 404);
    return false;
  }

  const belongs =
    professorRole === 'master'
      ? await alunoService.belongsToContract(alunoId, contractId)
      : await alunoService.belongsToProfessor(alunoId, professorId);

  if (!belongs) {
    sendError(res, 'Aluno não encontrado ou não pertence ao seu acesso', 404);
    return false;
  }
  return true;
}

export function legacyParqWriteBoundary(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    assertNoLegacyParqWrite(req.body);
    return next();
  } catch (error) {
    if (error instanceof LegacyParqWriteError) {
      return sendError(res, error.message, error.statusCode, { code: error.code });
    }
    return next(error);
  }
}

router.post('/', ...protectedRoute, legacyParqWriteBoundary);
router.put('/:id', ...protectedRoute, legacyParqWriteBoundary);

router.get(
  '/:id',
  ...protectedRoute,
  blockAccessMiddleware('students.details.summary'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { contractId } = getProfessorContext(req);
      if (!contractId || !(await ensureAlunoAccess(req, res, id))) return;

      const aluno = await studentParqBoundaryService.getAdministrativeAluno(contractId, id);
      if (!aluno) return sendError(res, 'Aluno não encontrado', 404);

      const bmi = aluno.weight !== null && aluno.height !== null
        ? alunoService.calculateBMI(aluno.weight, aluno.height)
        : null;
      const hrZones = aluno.maxHeartRate !== null && aluno.restingHeartRate !== null
        ? alunoService.calculateHeartRateZones(aluno.maxHeartRate, aluno.restingHeartRate)
        : null;

      return sendSuccess(
        res,
        { ...aluno, calculated: { bmi, hrZones } },
        'Aluno recuperado com sucesso'
      );
    } catch (error) {
      console.error('Erro ao obter aluno sanitizado:', error);
      return sendError(res, 'Erro ao obter aluno', 500);
    }
  }
);

export default router;
