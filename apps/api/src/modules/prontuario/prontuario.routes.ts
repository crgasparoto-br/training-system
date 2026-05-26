import { PrismaClient } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { blockAccessMiddleware, screenAccessMiddleware } from '../access-control/access-control.middleware.js';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import { prontuarioService } from './prontuario.service.js';

const router: Router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);
router.use(professorMiddleware);
router.use(screenAccessMiddleware('physicalAssessment.protocol'));

const recordSchema = z.object({
  recordDate: z.string().optional(),
  summary: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['open', 'closed', 'archived']).optional(),
});

const itemStatus = z.enum(['active', 'monitoring', 'resolved', 'archived']);
const activityType = z.enum(['running', 'strength', 'mobility', 'sport', 'occupational', 'other']);
const medicationProcedureType = z.enum(['medication', 'supplement', 'procedure', 'exam', 'therapy', 'other']);
const painCaseStatus = z.enum(['active', 'monitoring', 'resolved', 'archived']);

const parqSchema = z.object({
  responses: z
    .object({
      q1: z.boolean(),
      q2: z.boolean(),
      q3: z.boolean(),
      q4: z.boolean(),
      q5: z.boolean(),
      q6: z.boolean(),
      q7: z.boolean(),
      q8: z.boolean(),
    })
    .strict(),
  notes: z.string().optional().nullable(),
});

const contextFromRequest = (req: Request) => ({
  contractId: (req as any).user.contractId as string | undefined,
  professorId: (req as any).user.professorId as string | undefined,
  userId: (req as any).user.userId as string | undefined,
});

const PRNT_OVERVIEW_BLOCKS = {
  goals: 'physicalAssessment.prnt.goals',
  anamnesisFollowUps: 'physicalAssessment.prnt.anamnesisFollowUp',
  activityHistory: 'physicalAssessment.prnt.activityHistory',
  medicationsProcedures: 'physicalAssessment.prnt.medicationsProcedures',
  painCases: 'physicalAssessment.prnt.painCases',
  discomfortSnapshots: 'physicalAssessment.prnt.discomforts',
  parqSubmissions: 'physicalAssessment.prnt.parqSubmissions',
} as const;

type PrntOverviewVisibility = Record<keyof typeof PRNT_OVERVIEW_BLOCKS, boolean>;

function handleError(res: Response, error: any, fallback: string) {
  if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
  if (error?.message === 'Aluno não encontrado no contrato') return sendError(res, error.message, 404);
  console.error(fallback, error);
  return sendError(res, error?.message || fallback, 500);
}

async function getProfessorAccessContext(userId: string) {
  return prisma.professor.findUnique({
    where: { userId },
    include: {
      collaboratorFunction: true,
    },
  });
}

async function resolvePrntOverviewVisibility(userId: string): Promise<PrntOverviewVisibility> {
  const professor = await getProfessorAccessContext(userId);
  if (!professor) {
    throw new Error('Professor não encontrado');
  }

  const entries = await Promise.all(
    Object.entries(PRNT_OVERVIEW_BLOCKS).map(async ([key, blockKey]) => [
      key,
      await canProfessorAccessBlock(professor, blockKey),
    ])
  );

  return Object.fromEntries(entries) as PrntOverviewVisibility;
}

function sanitizeProntuarioRecord(record: any, visibility: PrntOverviewVisibility) {
  return {
    ...record,
    goals: visibility.goals ? record.goals : [],
    anamnesisFollowUps: visibility.anamnesisFollowUps ? record.anamnesisFollowUps : [],
    activityHistory: visibility.activityHistory ? record.activityHistory : [],
    medicationsProcedures: visibility.medicationsProcedures ? record.medicationsProcedures : [],
    painCases: visibility.painCases ? record.painCases : [],
    discomfortSnapshots: visibility.discomfortSnapshots ? record.discomfortSnapshots : [],
  };
}

function sanitizeProntuarioOverview(overview: any, visibility: PrntOverviewVisibility) {
  return {
    ...overview,
    records: overview.records.map((record: any) => sanitizeProntuarioRecord(record, visibility)),
    currentRecord: overview.currentRecord ? sanitizeProntuarioRecord(overview.currentRecord, visibility) : null,
    latestParqSubmission: visibility.parqSubmissions ? overview.latestParqSubmission : null,
    parqSubmissions: visibility.parqSubmissions ? overview.parqSubmissions : [],
  };
}

router.get(
  '/alunos/:alunoId',
  blockAccessMiddleware('physicalAssessment.prnt.summary'),
  async (req: Request, res: Response) => {
    try {
      const { contractId, userId } = contextFromRequest(req);
      if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
      if (!userId) return sendError(res, 'Usuário não encontrado', 404);
      const overview = await prontuarioService.overview(contractId, req.params.alunoId);
      const visibility = await resolvePrntOverviewVisibility(userId);
      return sendSuccess(res, sanitizeProntuarioOverview(overview, visibility), 'PRNT carregado');
    } catch (error) {
      return handleError(res, error, 'Erro ao carregar PRNT');
    }
  }
);

router.get('/alunos/:alunoId/parq-submissions', blockAccessMiddleware('physicalAssessment.prnt.parqSubmissions'), async (req: Request, res: Response) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const submissions = await prontuarioService.listParqSubmissions(contractId, req.params.alunoId);
    return sendSuccess(res, submissions, 'Histórico PAR-Q carregado');
  } catch (error) {
    return handleError(res, error, 'Erro ao carregar histórico PAR-Q');
  }
});

router.post('/alunos/:alunoId/parq-submissions', blockAccessMiddleware('physicalAssessment.prnt.actions.createParqSubmission'), async (req: Request, res: Response) => {
  try {
    const { contractId, userId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const payload = parqSchema.parse(req.body);
    const submission = await prontuarioService.createParqSubmission(contractId, req.params.alunoId, userId, payload.responses, payload.notes);
    return sendSuccess(res, submission, 'Submissão PAR-Q registrada', 201);
  } catch (error) {
    return handleError(res, error, 'Erro ao registrar submissão PAR-Q');
  }
});

router.post(
  '/alunos/:alunoId/records',
  blockAccessMiddleware('physicalAssessment.prnt.actions.createRecord'),
  async (req: Request, res: Response) => {
    try {
      const { contractId, professorId } = contextFromRequest(req);
      if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
      const payload = recordSchema.parse(req.body);
      const record = await prontuarioService.createRecord(contractId, req.params.alunoId, professorId, payload);
      return sendSuccess(res, record, 'Registro PRNT criado', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao criar registro PRNT');
    }
  }
);

router.put(
  '/records/:recordId',
  blockAccessMiddleware('physicalAssessment.prnt.actions.editRecord'),
  async (req: Request, res: Response) => {
    try {
      const { contractId } = contextFromRequest(req);
      if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
      const payload = recordSchema.parse(req.body);
      const record = await prontuarioService.updateRecord(contractId, req.params.recordId, payload);
      return sendSuccess(res, record, 'Registro PRNT atualizado');
    } catch (error) {
      return handleError(res, error, 'Erro ao atualizar registro PRNT');
    }
  }
);

router.put('/records/:recordId/goals', blockAccessMiddleware('physicalAssessment.prnt.goals'), async (req, res) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const { goals } = z.object({ goals: z.array(z.object({ id: z.string().optional(), title: z.string(), description: z.string().optional().nullable(), status: itemStatus.optional(), priority: z.number().int().optional(), targetDate: z.string().optional().nullable() })) }).parse(req.body);
    return sendSuccess(res, await prontuarioService.saveGoals(contractId, req.params.recordId, goals), 'Objetivos salvos');
  } catch (error) {
    return handleError(res, error, 'Erro ao salvar objetivos');
  }
});

router.put('/records/:recordId/anamnesis-follow-ups', blockAccessMiddleware('physicalAssessment.prnt.anamnesisFollowUp'), async (req, res) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const { items } = z.object({ items: z.array(z.object({ id: z.string().optional(), parqSubmissionId: z.string().optional().nullable(), itemKey: z.string(), itemLabel: z.string(), status: itemStatus.optional(), followUpNotes: z.string().optional().nullable(), actionPlan: z.string().optional().nullable(), closedAt: z.string().optional().nullable() })) }).parse(req.body);
    return sendSuccess(res, await prontuarioService.saveAnamnesisFollowUps(contractId, req.params.recordId, items), 'Acompanhamentos salvos');
  } catch (error) {
    return handleError(res, error, 'Erro ao salvar acompanhamentos');
  }
});

router.post('/anamnesis-follow-ups/:followUpId/close', blockAccessMiddleware('physicalAssessment.prnt.actions.closeFollowUp'), async (req, res) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    return sendSuccess(res, await prontuarioService.closeAnamnesisFollowUp(contractId, req.params.followUpId), 'Acompanhamento encerrado');
  } catch (error) {
    return handleError(res, error, 'Erro ao encerrar acompanhamento');
  }
});

router.put('/records/:recordId/activity-history', blockAccessMiddleware('physicalAssessment.prnt.activityHistory'), async (req, res) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const { items } = z.object({ items: z.array(z.object({ id: z.string().optional(), activityType: activityType.optional(), description: z.string(), frequency: z.string().optional().nullable(), duration: z.string().optional().nullable(), intensity: z.string().optional().nullable(), startedAt: z.string().optional().nullable(), endedAt: z.string().optional().nullable(), notes: z.string().optional().nullable() })) }).parse(req.body);
    return sendSuccess(res, await prontuarioService.saveActivityHistory(contractId, req.params.recordId, items), 'Histórico de atividades salvo');
  } catch (error) {
    return handleError(res, error, 'Erro ao salvar histórico de atividades');
  }
});

router.put('/records/:recordId/medications-procedures', blockAccessMiddleware('physicalAssessment.prnt.medicationsProcedures'), async (req, res) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const { items } = z.object({ items: z.array(z.object({ id: z.string().optional(), type: medicationProcedureType, name: z.string(), dosage: z.string().optional().nullable(), frequency: z.string().optional().nullable(), startDate: z.string().optional().nullable(), endDate: z.string().optional().nullable(), notes: z.string().optional().nullable() })) }).parse(req.body);
    return sendSuccess(res, await prontuarioService.saveMedicationsProcedures(contractId, req.params.recordId, items), 'Medicações e procedimentos salvos');
  } catch (error) {
    return handleError(res, error, 'Erro ao salvar medicações e procedimentos');
  }
});

router.put('/records/:recordId/pain-cases', blockAccessMiddleware('physicalAssessment.prnt.painCases'), async (req, res) => {
  try {
    const { contractId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const { items } = z.object({ items: z.array(z.object({ id: z.string().optional(), title: z.string(), region: z.string().optional().nullable(), status: painCaseStatus.optional(), onsetDate: z.string().optional().nullable(), description: z.string().optional().nullable(), followUps: z.array(z.object({ id: z.string().optional(), followUpAt: z.string().optional(), intensity: z.number().int().min(1).max(10).optional().nullable(), notes: z.string().optional().nullable(), conduct: z.string().optional().nullable() })).optional() })) }).parse(req.body);
    return sendSuccess(res, await prontuarioService.savePainCases(contractId, req.params.recordId, items), 'Casos de dor salvos');
  } catch (error) {
    return handleError(res, error, 'Erro ao salvar casos de dor');
  }
});

router.post('/records/:recordId/discomfort-snapshots', blockAccessMiddleware('physicalAssessment.prnt.discomforts'), async (req, res) => {
  try {
    const { contractId, professorId } = contextFromRequest(req);
    if (!contractId) return sendError(res, 'Contrato não encontrado', 404);
    const payload = z.object({
      notes: z.string().optional().nullable(),
      entries: z.array(z.object({
        regionId: z.string(),
        regionName: z.string(),
        discomfortTypes: z.array(z.string()).min(1),
        intensity: z.number().int().min(1).max(10),
        notes: z.string().optional().nullable(),
      })),
    }).parse(req.body);
    return sendSuccess(res, await prontuarioService.createDiscomfortSnapshot(contractId, req.params.recordId, professorId, payload), 'Snapshot de desconforto salvo', 201);
  } catch (error) {
    return handleError(res, error, 'Erro ao salvar snapshot de desconforto');
  }
});

export default router;
