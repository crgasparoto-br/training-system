import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { blockAccessMiddleware, screenAccessMiddleware } from '../access-control/access-control.middleware.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  AnthropometryCompletionAccessError,
  completeAnthropometrySecurely,
} from './anthropometry-completion.service.js';
import {
  AnthropometryCorrectionAccessError,
  correctCompletedAnthropometry,
} from './anthropometry-correction.service.js';
import { AnthropometryDomainError, anthropometryService } from './anthropometry.service.js';

const router: Router = Router();

router.use(authMiddleware);
router.use(professorMiddleware);
router.use(screenAccessMiddleware('physicalAssessment.protocol'));

const segmentType = z.enum(['principal', 'opcional', 'personalizado']);
const sexApplicability = z.enum(['masculino', 'feminino', 'ambos']);

const segmentSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional().nullable(),
  technicalDescription: z.string().optional().nullable(),
  sexApplicability: sexApplicability.optional(),
  type: segmentType.optional(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
  importByDefault: z.boolean().optional(),
  importObservationByDefault: z.boolean().optional(),
  requiredForCompletion: z.boolean().optional(),
  femaleImageUrl: z.string().url().optional().nullable().or(z.literal('')),
  maleImageUrl: z.string().url().optional().nullable().or(z.literal('')),
  tutorialVideoUrl: z.string().url().optional().nullable().or(z.literal('')),
  formulaHint: z.string().optional().nullable(),
});

const updateSegmentSchema = segmentSchema.partial();

const createAssessmentSchema = z.object({
  assessmentDate: z.string().optional(),
  professorId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  copyPrevious: z.boolean().optional(),
});

const updateAssessmentSchema = z.object({
  assessmentDate: z.string().optional(),
  professorId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const valueSchema = z.object({
  segmentId: z.string(),
  value: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  observation: z.string().optional().nullable(),
});

const observationSchema = z.object({
  segmentId: z.string().optional().nullable(),
  text: z.string(),
  importable: z.boolean().optional(),
});

const correctionSchema = z.object({
  reason: z.string().trim().min(1),
  values: z.array(valueSchema).optional(),
  notes: z.string().optional().nullable(),
  observations: z.array(observationSchema).optional(),
});

const contextFromRequest = (req: Request) => ({
  contractId: req.user?.contractId,
  professorId: req.user?.professorId,
  userId: req.user?.userId,
});

const parseDate = (value?: string) => {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

function handleAnthropometryError(res: Response, error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
  if (
    error instanceof AnthropometryCompletionAccessError ||
    error instanceof AnthropometryCorrectionAccessError
  ) {
    return sendError(res, error.message, 403, { code: error.code });
  }
  if (error instanceof AnthropometryDomainError) {
    const conflictCodes = new Set([
      'ASSESSMENT_COMPLETED',
      'ASSESSMENT_NOT_COMPLETED',
      'COMPLETION_CONFIGURATION_MISSING',
      'REQUIRED_MEASURES_MISSING',
      'CONCURRENT_COMPLETION',
      'CORRECTION_WITHOUT_CHANGES',
    ]);
    return sendError(res, error.message, conflictCodes.has(error.code) ? 409 : 400, {
      code: error.code,
      ...(error.details ?? {}),
    });
  }
  const typed = error as { code?: string; message?: string };
  if (typed?.code === 'P2025') return sendError(res, 'Recurso antropométrico não encontrado', 404);
  if (typed?.message === 'Aluno não encontrado no contrato') return sendError(res, typed.message, 404);
  if (typed?.message === 'Avaliação antropométrica não encontrada') return sendError(res, typed.message, 404);
  console.error(fallback, error);
  return sendError(res, typed?.message || fallback, 500);
}

router.get('/segments', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    return sendSuccess(res, await anthropometryService.listSegments(contractId), 'Segmentos antropométricos carregados');
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao listar segmentos antropométricos');
  }
});

router.get('/segments/active', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const sex = req.query.sex as 'male' | 'female' | 'other' | undefined;
    return sendSuccess(res, await anthropometryService.listActiveSegments(contractId, sex), 'Segmentos ativos carregados');
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao listar segmentos ativos');
  }
});

router.post('/segments', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const payload = segmentSchema.parse(req.body);
    const segment = await anthropometryService.createSegment(contractId, {
      ...payload,
      femaleImageUrl: payload.femaleImageUrl || null,
      maleImageUrl: payload.maleImageUrl || null,
      tutorialVideoUrl: payload.tutorialVideoUrl || null,
    });
    return sendSuccess(res, segment, 'Segmento antropométrico criado', 201);
  } catch (error: any) {
    if (error?.code === 'P2002') return sendError(res, 'Segmento já cadastrado', 400);
    return handleAnthropometryError(res, error, 'Erro ao criar segmento antropométrico');
  }
});

router.put('/segments/:id', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const payload = updateSegmentSchema.parse(req.body);
    const segment = await anthropometryService.updateSegment(contractId, req.params.id, {
      ...payload,
      femaleImageUrl: payload.femaleImageUrl === '' ? null : payload.femaleImageUrl,
      maleImageUrl: payload.maleImageUrl === '' ? null : payload.maleImageUrl,
      tutorialVideoUrl: payload.tutorialVideoUrl === '' ? null : payload.tutorialVideoUrl,
    });
    return sendSuccess(res, segment, 'Segmento antropométrico atualizado');
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao atualizar segmento antropométrico');
  }
});

router.post('/segments/reorder', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const { segmentIds } = z.object({ segmentIds: z.array(z.string()) }).parse(req.body);
    return sendSuccess(res, await anthropometryService.reorderSegments(contractId, segmentIds), 'Segmentos reordenados');
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao reordenar segmentos');
  }
});

router.get('/alunos/:alunoId/assessments', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    return sendSuccess(res, await anthropometryService.listAssessments(contractId, req.params.alunoId), 'Histórico antropométrico carregado');
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao listar avaliações antropométricas');
  }
});

router.get('/alunos/:alunoId/assessments/last', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    return sendSuccess(res, await anthropometryService.getLastAssessment(contractId, req.params.alunoId), 'Última avaliação antropométrica carregada');
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao buscar última avaliação antropométrica');
  }
});

router.get('/assessments/:id', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const assessment = await anthropometryService.getAssessment(contractId, req.params.id);
    if (!assessment) return sendError(res, 'Avaliação antropométrica não encontrada', 404);
    return sendSuccess(res, assessment, 'Avaliação antropométrica carregada');
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao buscar avaliação antropométrica');
  }
});

router.post('/alunos/:alunoId/assessments', async (req: Request, res: Response) => {
  try {
    const { contractId, professorId } = contextFromRequest(req);
    if (!contractId || !professorId) return sendError(res, 'Professor ou contrato não encontrado', 404);
    const payload = createAssessmentSchema.parse(req.body);
    const assessment = await anthropometryService.createAssessment(contractId, req.params.alunoId, professorId, {
      assessmentDate: parseDate(payload.assessmentDate),
      professorId: payload.professorId,
      notes: payload.notes,
      copyPrevious: payload.copyPrevious ?? true,
    });
    return sendSuccess(res, assessment, 'Avaliação antropométrica criada', 201);
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao criar avaliação antropométrica');
  }
});

router.put('/assessments/:id', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const payload = updateAssessmentSchema.parse(req.body);
    const assessment = await anthropometryService.updateAssessment(contractId, req.params.id, {
      assessmentDate: parseDate(payload.assessmentDate),
      professorId: payload.professorId,
      notes: payload.notes,
    });
    return sendSuccess(res, assessment, 'Avaliação antropométrica atualizada');
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao atualizar avaliação antropométrica');
  }
});

router.put('/assessments/:id/values', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const { values } = z.object({ values: z.array(valueSchema) }).parse(req.body);
    return sendSuccess(res, await anthropometryService.saveValues(contractId, req.params.id, values), 'Medidas antropométricas salvas');
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao salvar medidas antropométricas');
  }
});

router.put('/assessments/:id/observations', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const { observations } = z.object({ observations: z.array(observationSchema) }).parse(req.body);
    return sendSuccess(res, await anthropometryService.saveObservations(contractId, req.params.id, observations), 'Observações antropométricas salvas');
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao salvar observações antropométricas');
  }
});

router.post('/assessments/:id/complete', async (req: Request, res: Response) => {
  try {
    const { contractId, professorId, userId } = contextFromRequest(req);
    if (!contractId || !userId) return sendError(res, 'Usuário ou contrato não encontrado', 404);
    const assessment = await completeAnthropometrySecurely(contractId, req.params.id, { userId, professorId });
    return sendSuccess(res, assessment, 'Avaliação antropométrica concluída');
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao concluir avaliação antropométrica');
  }
});

router.post(
  '/assessments/:id/corrections',
  blockAccessMiddleware('students.actions.manageAssessments'),
  async (req: Request, res: Response) => {
    try {
      const { contractId, professorId, userId } = contextFromRequest(req);
      if (!contractId || !userId) return sendError(res, 'Usuário ou contrato não encontrado', 404);
      const payload = correctionSchema.parse(req.body);
      const assessment = await correctCompletedAnthropometry(
        contractId,
        req.params.id,
        { userId, professorId },
        payload
      );
      return sendSuccess(res, assessment, 'Correção antropométrica registrada');
    } catch (error) {
      return handleAnthropometryError(res, error, 'Erro ao corrigir avaliação antropométrica');
    }
  }
);

router.get('/alunos/:alunoId/compare', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const assessmentIds =
      typeof req.query.assessmentIds === 'string'
        ? req.query.assessmentIds.split(',').map((item) => item.trim()).filter(Boolean)
        : undefined;
    return sendSuccess(res, await anthropometryService.compare(contractId, req.params.alunoId, assessmentIds), 'Comparação antropométrica carregada');
  } catch (error) {
    return handleAnthropometryError(res, error, 'Erro ao comparar avaliações antropométricas');
  }
});

export default router;
