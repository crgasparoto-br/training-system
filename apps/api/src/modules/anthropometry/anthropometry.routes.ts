import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { anthropometryService } from './anthropometry.service.js';

const router: Router = Router();

router.use(authMiddleware);
router.use(professorMiddleware);

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

const contextFromRequest = (req: Request) => ({
  contractId: (req as any).user.contractId as string | undefined,
  professorId: (req as any).user.professorId as string | undefined,
});

const parseDate = (value?: string) => {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

router.get('/segments', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);

    const segments = await anthropometryService.listSegments(contractId);
    return sendSuccess(res, segments, 'Segmentos antropométricos carregados');
  } catch (error) {
    console.error('Erro ao listar segmentos antropométricos:', error);
    return sendError(res, 'Erro ao listar segmentos antropométricos', 500);
  }
});

router.get('/segments/active', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);

    const sex = req.query.sex as 'male' | 'female' | 'other' | undefined;
    const segments = await anthropometryService.listActiveSegments(contractId, sex);
    return sendSuccess(res, segments, 'Segmentos ativos carregados');
  } catch (error) {
    console.error('Erro ao listar segmentos ativos:', error);
    return sendError(res, 'Erro ao listar segmentos ativos', 500);
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
    if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
    if (error?.code === 'P2002') return sendError(res, 'Segmento já cadastrado', 400);
    console.error('Erro ao criar segmento antropométrico:', error);
    return sendError(res, 'Erro ao criar segmento antropométrico', 500);
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
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
    console.error('Erro ao atualizar segmento antropométrico:', error);
    return sendError(res, 'Erro ao atualizar segmento antropométrico', 500);
  }
});

router.post('/segments/reorder', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);

    const { segmentIds } = z.object({ segmentIds: z.array(z.string()) }).parse(req.body);
    const segments = await anthropometryService.reorderSegments(contractId, segmentIds);
    return sendSuccess(res, segments, 'Segmentos reordenados');
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
    console.error('Erro ao reordenar segmentos:', error);
    return sendError(res, 'Erro ao reordenar segmentos', 500);
  }
});

router.get('/alunos/:alunoId/assessments', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);

    const assessments = await anthropometryService.listAssessments(contractId, req.params.alunoId);
    return sendSuccess(res, assessments, 'Histórico antropométrico carregado');
  } catch (error) {
    console.error('Erro ao listar avaliações antropométricas:', error);
    return sendError(res, 'Erro ao listar avaliações antropométricas', 500);
  }
});

router.get('/alunos/:alunoId/assessments/last', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);

    const assessment = await anthropometryService.getLastAssessment(contractId, req.params.alunoId);
    return sendSuccess(res, assessment, 'Última avaliação antropométrica carregada');
  } catch (error) {
    console.error('Erro ao buscar última avaliação antropométrica:', error);
    return sendError(res, 'Erro ao buscar última avaliação antropométrica', 500);
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
    console.error('Erro ao buscar avaliação antropométrica:', error);
    return sendError(res, 'Erro ao buscar avaliação antropométrica', 500);
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
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
    console.error('Erro ao criar avaliação antropométrica:', error);
    if (error?.message === 'Aluno não encontrado no contrato') {
      return sendError(res, error.message, 404);
    }
    return sendError(res, error?.message || 'Erro ao criar avaliação antropométrica', 500);
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
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
    console.error('Erro ao atualizar avaliação antropométrica:', error);
    return sendError(res, 'Erro ao atualizar avaliação antropométrica', 500);
  }
});

router.put('/assessments/:id/values', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);

    const { values } = z.object({ values: z.array(valueSchema) }).parse(req.body);
    const assessment = await anthropometryService.saveValues(contractId, req.params.id, values);
    return sendSuccess(res, assessment, 'Medidas antropométricas salvas');
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
    console.error('Erro ao salvar medidas antropométricas:', error);
    return sendError(res, 'Erro ao salvar medidas antropométricas', 500);
  }
});

router.put('/assessments/:id/observations', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);

    const { observations } = z.object({ observations: z.array(observationSchema) }).parse(req.body);
    const assessment = await anthropometryService.saveObservations(contractId, req.params.id, observations);
    return sendSuccess(res, assessment, 'Observações antropométricas salvas');
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
    console.error('Erro ao salvar observações antropométricas:', error);
    return sendError(res, 'Erro ao salvar observações antropométricas', 500);
  }
});

router.get('/alunos/:alunoId/compare', async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);

    const assessmentIds =
      typeof req.query.assessmentIds === 'string'
        ? req.query.assessmentIds.split(',').map((item) => item.trim()).filter(Boolean)
        : undefined;
    const assessments = await anthropometryService.compare(contractId, req.params.alunoId, assessmentIds);
    return sendSuccess(res, assessments, 'Comparação antropométrica carregada');
  } catch (error) {
    console.error('Erro ao comparar avaliações antropométricas:', error);
    return sendError(res, 'Erro ao comparar avaliações antropométricas', 500);
  }
});

export default router;
