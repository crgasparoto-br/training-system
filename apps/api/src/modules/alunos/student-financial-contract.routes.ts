import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CreateAlunoSchema, UpdateAlunoSchema, sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { blockAccessMiddleware } from '../access-control/access-control.middleware.js';
import { studentFinancialContractService } from './student-financial-contract.service.js';

const router: Router = Router();

const contractMutationSchema = z.object({
  contractId: z.string().trim().min(1),
  serviceId: z.string().trim().nullable().optional(),
  startDate: z.string().trim().nullable().optional(),
  endDate: z.string().trim().nullable().optional(),
  amount: z.coerce.number().nonnegative().nullable().optional(),
  paymentDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const createSchema = z.object({
  profile: CreateAlunoSchema,
  contract: contractMutationSchema,
});

const updateSchema = z.object({
  profile: UpdateAlunoSchema,
  contract: contractMutationSchema,
});

const parseCivilDate = (value: string | null | undefined, fieldName: string) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new Error(`Campo ${fieldName} inválido`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Campo ${fieldName} inválido`);
  }

  return parsed;
};

const getContext = (req: Request) => ({
  professorId: (req as any).user.professorId as string | undefined,
  companyContractId: (req as any).user.contractId as string | undefined,
});

const mapContractInput = (input: z.infer<typeof contractMutationSchema>) => ({
  contractId: input.contractId,
  serviceId: input.serviceId,
  startDate: parseCivilDate(input.startDate, 'startDate'),
  endDate: parseCivilDate(input.endDate, 'endDate'),
  amount: input.amount,
  paymentDay: input.paymentDay,
  notes: input.notes,
});

const handleError = (res: Response, error: unknown) => {
  if (error instanceof z.ZodError) {
    return sendError(res, 'Dados inválidos', 400, error.errors);
  }

  const message = error instanceof Error ? error.message : 'Erro ao salvar aluno e contrato';
  if (message.startsWith('Campo ')) return sendError(res, message, 400);
  if (
    message.includes('não encontrado') ||
    message.includes('não pertence') ||
    message.includes('fora do contrato')
  ) {
    return sendError(res, message, 404);
  }
  if (
    message.includes('já está registrado') ||
    message.includes('já está vinculado') ||
    message.includes('inativo') ||
    message.includes('Selecione um serviço principal')
  ) {
    return sendError(res, message, 400);
  }

  console.error('Erro na operação atômica de aluno e contrato:', error);
  return sendError(res, message, 500);
};

router.post(
  '/financial-contract',
  authMiddleware,
  professorMiddleware,
  blockAccessMiddleware('students.actions.manageFinancialContract'),
  async (req: Request, res: Response) => {
    try {
      const { professorId, companyContractId } = getContext(req);
      if (!professorId || !companyContractId) {
        return sendError(res, 'Professor ou contrato autenticado não encontrado', 404);
      }

      const validated = createSchema.parse(req.body);
      const result = await studentFinancialContractService.createAlunoWithContract(
        validated.profile,
        mapContractInput(validated.contract),
        { professorId, companyContractId }
      );
      return sendSuccess(res, result, 'Aluno e contrato salvos com sucesso', 201);
    } catch (error) {
      return handleError(res, error);
    }
  }
);

router.put(
  '/:id/financial-contract',
  authMiddleware,
  professorMiddleware,
  blockAccessMiddleware('students.actions.manageFinancialContract'),
  async (req: Request, res: Response) => {
    try {
      const { professorId, companyContractId } = getContext(req);
      if (!professorId || !companyContractId) {
        return sendError(res, 'Professor ou contrato autenticado não encontrado', 404);
      }

      const validated = updateSchema.parse(req.body);
      const result = await studentFinancialContractService.updateAlunoWithContract(
        req.params.id,
        validated.profile,
        mapContractInput(validated.contract),
        { professorId, companyContractId }
      );
      return sendSuccess(res, result, 'Aluno e contrato atualizados com sucesso');
    } catch (error) {
      return handleError(res, error);
    }
  }
);

export default router;
