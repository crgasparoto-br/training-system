import { Router, Request, Response } from 'express';
import { alunoService } from './aluno.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  sendSuccess,
  sendError,
  CreateAlunoSchema,
  UpdateAlunoSchema,
} from '@corrida/utils';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import { PrismaClient } from '@prisma/client';
import { assessmentService } from '../assessments/assessment.service.js';
import { alunoAssessmentPlanService } from './aluno-assessment-plan.service.js';
import { upsertAlunoAssessmentPlanSchema } from './aluno-assessment-plan.schemas.js';
import { parseAssessmentPdf } from '../assessments/assessment-parser.js';
import { fillAssessmentWithAi } from '../assessments/assessment-ai.js';
import { profileReviewService } from './profile-review.service.js';
import { profileAuditService } from './profile-audit.service.js';
import { assessmentPlanNotificationService } from './assessment-plan-notification.service.js';
import { screenAccessMiddleware, blockAccessMiddleware } from '../access-control/access-control.middleware.js';
import { studentContractService } from '../student-contracts/student-contract.service.js';
import { buildPublicUploadUrl } from '../../common/public-upload-url.js';
import {
  buildTimestampedUploadFileName,
  ensureUploadStorageDir,
  resolvePublicUploadPath,
  resolveStoredUploadPathFromAbsolute,
  resolveUploadAbsolutePathFromStored,
} from '../../common/asset-storage.js';

const router: Router = Router();
const prisma = new PrismaClient();

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ensureUploadStorageDir('alunos'));
  },
  filename: (_req, file, cb) => {
    cb(null, buildTimestampedUploadFileName(file.originalname));
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Envie um arquivo de imagem válido'));
    }

    cb(null, true);
  },
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const alunoId = req.params.id;
    cb(null, ensureUploadStorageDir('assessments', alunoId));
  },
  filename: (req, file, cb) => {
    cb(null, buildTimestampedUploadFileName(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Somente arquivos PDF sÃƒÂ£o permitidos'));
    }
    cb(null, true);
  },
});

const uploadAssessmentFile = (req: Request, res: Response, next: any) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      return sendError(res, err.message || 'Erro ao fazer upload do arquivo', 400);
    }
    next();
  });
};

const uploadAvatarFile = (req: Request, res: Response, next: any) => {
  avatarUpload.single('file')(req, res, (err: any) => {
    if (err) {
      return sendError(res, err.message || 'Erro ao fazer upload da foto', 400);
    }

    next();
  });
};

const prefillUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Somente arquivos PDF sao permitidos'));
    }
    cb(null, true);
  },
});

const uploadAssessmentPrefillFile = (req: Request, res: Response, next: any) => {
  prefillUpload.single('file')(req, res, (err: any) => {
    if (err) {
      return sendError(res, err.message || 'Erro ao processar o arquivo', 400);
    }
    next();
  });
};

// Aplicar autenticaÃ§Ã£o em todas as rotas
router.use(authMiddleware);
router.use(professorMiddleware); // Apenas professores podem gerenciar alunos

router.post('/avatar-upload', uploadAvatarFile, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return sendError(res, 'Selecione uma imagem para upload', 400);
    }

    const fileUrl = buildPublicUploadUrl(req, resolvePublicUploadPath('alunos', req.file.filename));
    if (!fileUrl) {
      return sendError(res, 'Não foi possível montar a URL da foto enviada', 500);
    }

    return sendSuccess(res, { url: fileUrl }, 'Foto enviada com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao enviar foto', 400);
  }
});

const getProfessorContext = (req: Request) => ({
  professorId: (req as any).user.professorId as string | undefined,
  professorRole: (req as any).user.professorRole as 'master' | 'professor' | undefined,
  contractId: (req as any).user.contractId as string | undefined,
});

const getManagedProfessorIds = async (contractId: string, actorProfessorId: string) => {
  const rows = await prisma.professor.findMany({
    where: {
      contractId,
      OR: [{ id: actorProfessorId }, { responsibleManagerId: actorProfessorId }],
    },
    select: { id: true },
  });

  return rows.map((item) => item.id);
};

const ensureAlunoAccess = async (req: Request, res: Response, alunoId: string) => {
  const { professorId, professorRole, contractId } = getProfessorContext(req);

  if (!professorId) {
    sendError(res, 'Professor não encontrado', 404);
    return false;
  }

  const belongs =
    professorRole === 'master' && contractId
      ? await alunoService.belongsToContract(alunoId, contractId)
      : await alunoService.belongsToProfessor(alunoId, professorId);

  if (!belongs) {
    sendError(res, 'Aluno não encontrado ou não pertence ao seu acesso', 404);
    return false;
  }

  return true;
};

const parseOptionalIsoDate = (value: string | undefined | null) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value.trim() === '') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Data inválida');
  }

  return parsed;
};

const createProfileReviewSchema = z.object({
  dueAt: z.string().optional(),
  sectionsRequested: z.array(z.string().min(1)).optional(),
});

const updateProfileReviewSettingsSchema = z.object({
  reviewPeriodMonths: z.number().int().min(1).max(24).nullable().optional(),
  nextReviewAt: z.string().nullable().optional(),
  isReviewRequired: z.boolean().optional(),
});

const rejectProfileReviewSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const createStudentContractSchema = z.object({
  contractId: z.string().min(1),
  serviceId: z.string().nullable().optional(),
  status: z
    .enum(['draft', 'pending_signature', 'active', 'expired', 'canceled', 'terminated'])
    .optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  amount: z.coerce.number().nonnegative().nullable().optional(),
  paymentDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateStudentContractSchema = z
  .object({
    serviceId: z.string().nullable().optional(),
    status: z
      .enum(['draft', 'pending_signature', 'active', 'expired', 'canceled', 'terminated'])
      .optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    signedAt: z.string().nullable().optional(),
    canceledAt: z.string().nullable().optional(),
    cancellationReason: z.string().max(500).nullable().optional(),
    amount: z.coerce.number().nonnegative().nullable().optional(),
    paymentDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Informe ao menos um campo para atualização',
  });

const cancelStudentContractSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

/**
 * GET /api/v1/alunos/:id/profile-reviews
 * Listar revisões cadastrais do aluno
 */
router.get('/:id/profile-reviews', blockAccessMiddleware('students.details.profileReviews'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    const reviews = await profileReviewService.listByAluno(id);
    return sendSuccess(res, reviews, 'Revisões cadastrais recuperadas com sucesso');
  } catch (error) {
    console.error('Erro ao listar revisões cadastrais:', error);
    return sendError(res, 'Erro ao listar revisões cadastrais', 500);
  }
});

/**
 * POST /api/v1/alunos/:id/profile-reviews
 * Criar solicitação manual de revisão cadastral
 */
router.post('/:id/profile-reviews', blockAccessMiddleware('students.actions.manageProfileReviews'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    const validated = createProfileReviewSchema.parse(req.body);
    const dueAt = parseOptionalIsoDate(validated.dueAt);

    const requestedByUserId = (req as any).user.userId as string;
    const created = await profileReviewService.createManualReview({
      alunoId: id,
      requestedByUserId,
      dueAt: dueAt ?? undefined,
      sectionsRequested: validated.sectionsRequested,
    });

    return sendSuccess(res, created, 'Solicitação de revisão cadastral criada com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    if (error?.message === 'Data inválida') {
      return sendError(res, error.message, 400);
    }
    console.error('Erro ao criar revisão cadastral:', error);
    return sendError(res, 'Erro ao criar revisão cadastral', 500);
  }
});

/**
 * GET /api/v1/alunos/:id/profile-review-settings
 * Retornar configuração individual de revisão cadastral
 */
router.get('/:id/profile-review-settings', blockAccessMiddleware('students.details.profileReviews'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    const settings = await profileReviewService.getEffectiveSettings(id);
    return sendSuccess(res, settings, 'Configuração de revisão cadastral recuperada com sucesso');
  } catch (error: any) {
    if (error?.message === 'Aluno não encontrado') {
      return sendError(res, error.message, 404);
    }
    console.error('Erro ao obter configuração de revisão cadastral:', error);
    return sendError(res, 'Erro ao obter configuração de revisão cadastral', 500);
  }
});

/**
 * PUT /api/v1/alunos/:id/profile-review-settings
 * Atualizar configuração individual de revisão cadastral
 */
router.put('/:id/profile-review-settings', blockAccessMiddleware('students.actions.manageProfileReviews'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    const validated = updateProfileReviewSettingsSchema.parse(req.body);
    const nextReviewAt = parseOptionalIsoDate(validated.nextReviewAt);

    const updated = await profileReviewService.updateSettings({
      alunoId: id,
      reviewPeriodMonths: validated.reviewPeriodMonths,
      nextReviewAt,
      isReviewRequired: validated.isReviewRequired,
    });

    return sendSuccess(res, updated, 'Configuração de revisão cadastral atualizada com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    if (error?.message === 'Data inválida') {
      return sendError(res, error.message, 400);
    }
    console.error('Erro ao atualizar configuração de revisão cadastral:', error);
    return sendError(res, 'Erro ao atualizar configuração de revisão cadastral', 500);
  }
});

/**
 * POST /api/v1/alunos/:id/profile-reviews/:reviewId/approve
 * Aprovar alterações sensíveis da revisão cadastral
 */
router.post('/:id/profile-reviews/:reviewId/approve', blockAccessMiddleware('students.actions.manageProfileReviews'), async (req: Request, res: Response) => {
  try {
    const { id, reviewId } = req.params;
    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    const approvedByUserId = (req as any).user.userId as string;
    const approved = await profileReviewService.approveReview(id, reviewId, approvedByUserId);

    return sendSuccess(res, approved, 'Alterações sensíveis aprovadas com sucesso');
  } catch (error: any) {
    if (error?.message?.includes('não encontrada')) {
      return sendError(res, error.message, 404);
    }
    if (error?.message?.includes('pendentes')) {
      return sendError(res, error.message, 400);
    }
    console.error('Erro ao aprovar revisão cadastral:', error);
    return sendError(res, 'Erro ao aprovar revisão cadastral', 500);
  }
});

/**
 * POST /api/v1/alunos/:id/profile-reviews/:reviewId/reject
 * Rejeitar alterações sensíveis da revisão cadastral
 */
router.post('/:id/profile-reviews/:reviewId/reject', blockAccessMiddleware('students.actions.manageProfileReviews'), async (req: Request, res: Response) => {
  try {
    const { id, reviewId } = req.params;
    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    const validated = rejectProfileReviewSchema.parse(req.body);
    const rejectedByUserId = (req as any).user.userId as string;

    const rejected = await profileReviewService.rejectReview(
      id,
      reviewId,
      rejectedByUserId,
      validated.reason
    );

    return sendSuccess(res, rejected, 'Alterações sensíveis rejeitadas com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    if (error?.message?.includes('não encontrada')) {
      return sendError(res, error.message, 404);
    }
    if (error?.message?.includes('pendentes')) {
      return sendError(res, error.message, 400);
    }
    console.error('Erro ao rejeitar revisão cadastral:', error);
    return sendError(res, 'Erro ao rejeitar revisão cadastral', 500);
  }
});

/**
 * GET /api/v1/alunos/:id/profile-audit-logs
 * Lista o log de auditoria de alterações cadastrais do aluno.
 */
const profileAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

router.get(
  '/:id/profile-audit-logs',
  screenAccessMiddleware('students.profileReview'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const query = profileAuditLogsQuerySchema.parse(req.query);
      const result = await profileAuditService.listByAluno(id, {
        page: query.page,
        limit: query.limit,
      });
      return sendSuccess(res, result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 'Parâmetros inválidos', 400, error.errors);
      }
      console.error('Erro ao buscar logs de auditoria cadastral:', error);
      return sendError(res, 'Erro ao buscar logs de auditoria', 500);
    }
  }
);

/**
 * GET /api/v1/alunos/:id/contracts
 * Listar histórico de contratos vinculados ao aluno
 */
router.get(
  '/:id/contracts',
  screenAccessMiddleware('students.contracts.view'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { contractId } = getProfessorContext(req);

      if (!contractId) {
        return sendError(res, 'Contrato não encontrado', 404);
      }

      if (!(await ensureAlunoAccess(req, res, id))) {
        return;
      }

      const contracts = await studentContractService.listByAluno(id, {
        companyContractId: contractId,
      });

      const activeContract = contracts.find((item) => item.status === 'active') ?? null;

      return sendSuccess(
        res,
        {
          alunoId: id,
          activeContract,
          contracts,
        },
        'Contratos vinculados ao aluno recuperados com sucesso'
      );
    } catch (error: any) {
      console.error('Erro ao listar contratos do aluno:', error);
      return sendError(res, error?.message || 'Erro ao listar contratos do aluno', 500);
    }
  }
);

/**
 * POST /api/v1/alunos/:id/contracts
 * Vincular contrato existente ao aluno
 */
router.post(
  '/:id/contracts',
  blockAccessMiddleware('students.actions.manageFinancialContract'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { contractId } = getProfessorContext(req);

      if (!contractId) {
        return sendError(res, 'Contrato não encontrado', 404);
      }

      if (!(await ensureAlunoAccess(req, res, id))) {
        return;
      }

      const validated = createStudentContractSchema.parse(req.body);

      const created = await studentContractService.linkExistingContract(
        {
          alunoId: id,
          contractId: validated.contractId,
          serviceId: validated.serviceId,
          status: validated.status,
          startDate: parseOptionalDate(validated.startDate, 'startDate'),
          endDate: parseOptionalDate(validated.endDate, 'endDate'),
          amount: validated.amount,
          paymentDay: validated.paymentDay,
          notes: validated.notes,
        },
        {
          companyContractId: contractId,
        }
      );

      return sendSuccess(res, created, 'Contrato vinculado ao aluno com sucesso', 201);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 'Dados inválidos', 400, error.errors);
      }
      if (error?.message?.startsWith('Campo ')) {
        return sendError(res, error.message, 400);
      }
      if (
        error?.message?.includes('não pertence') ||
        error?.message?.includes('já está vinculado') ||
        error?.message?.includes('já possui contrato ativo')
      ) {
        return sendError(res, error.message, 400);
      }
      if (error?.message?.includes('não encontrado')) {
        return sendError(res, error.message, 404);
      }
      console.error('Erro ao vincular contrato ao aluno:', error);
      return sendError(res, 'Erro ao vincular contrato ao aluno', 500);
    }
  }
);

/**
 * PATCH /api/v1/alunos/:id/contracts/:studentContractId
 * Atualizar vínculo de contrato do aluno
 */
router.patch(
  '/:id/contracts/:studentContractId',
  blockAccessMiddleware('students.actions.manageFinancialContract'),
  async (req: Request, res: Response) => {
    try {
      const { id, studentContractId } = req.params;
      const { contractId } = getProfessorContext(req);

      if (!contractId) {
        return sendError(res, 'Contrato não encontrado', 404);
      }

      if (!(await ensureAlunoAccess(req, res, id))) {
        return;
      }

      const validated = updateStudentContractSchema.parse(req.body);

      const updated = await studentContractService.update(
        id,
        studentContractId,
        {
          serviceId: validated.serviceId,
          status: validated.status,
          startDate: parseOptionalDate(validated.startDate, 'startDate'),
          endDate: parseOptionalDate(validated.endDate, 'endDate'),
          signedAt: parseOptionalDate(validated.signedAt, 'signedAt'),
          canceledAt: parseOptionalDate(validated.canceledAt, 'canceledAt'),
          cancellationReason: validated.cancellationReason,
          amount: validated.amount,
          paymentDay: validated.paymentDay,
          notes: validated.notes,
        },
        {
          companyContractId: contractId,
        }
      );

      return sendSuccess(res, updated, 'Vínculo de contrato atualizado com sucesso');
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 'Dados inválidos', 400, error.errors);
      }
      if (error?.message?.startsWith('Campo ')) {
        return sendError(res, error.message, 400);
      }
      if (
        error?.message?.includes('não encontrado') ||
        error?.message?.includes('não possui') ||
        error?.message?.includes('fora do escopo')
      ) {
        return sendError(res, error.message, 404);
      }
      if (error?.message?.includes('já possui contrato ativo')) {
        return sendError(res, error.message, 400);
      }
      console.error('Erro ao atualizar vínculo de contrato:', error);
      return sendError(res, 'Erro ao atualizar vínculo de contrato', 500);
    }
  }
);

/**
 * POST /api/v1/alunos/:id/contracts/:studentContractId/activate
 * Ativar vínculo de contrato do aluno
 */
router.post(
  '/:id/contracts/:studentContractId/activate',
  blockAccessMiddleware('students.actions.manageFinancialContract'),
  async (req: Request, res: Response) => {
    try {
      const { id, studentContractId } = req.params;
      const { contractId } = getProfessorContext(req);

      if (!contractId) {
        return sendError(res, 'Contrato não encontrado', 404);
      }

      if (!(await ensureAlunoAccess(req, res, id))) {
        return;
      }

      const activated = await studentContractService.activate(id, studentContractId, {
        companyContractId: contractId,
      });

      return sendSuccess(res, activated, 'Contrato ativado com sucesso');
    } catch (error: any) {
      if (
        error?.message?.includes('não encontrado') ||
        error?.message?.includes('fora do escopo')
      ) {
        return sendError(res, error.message, 404);
      }
      console.error('Erro ao ativar contrato do aluno:', error);
      return sendError(res, error?.message || 'Erro ao ativar contrato do aluno', 500);
    }
  }
);

/**
 * POST /api/v1/alunos/:id/contracts/:studentContractId/cancel
 * Cancelar vínculo de contrato do aluno
 */
router.post(
  '/:id/contracts/:studentContractId/cancel',
  blockAccessMiddleware('students.actions.manageFinancialContract'),
  async (req: Request, res: Response) => {
    try {
      const { id, studentContractId } = req.params;
      const { contractId } = getProfessorContext(req);

      if (!contractId) {
        return sendError(res, 'Contrato não encontrado', 404);
      }

      if (!(await ensureAlunoAccess(req, res, id))) {
        return;
      }

      const validated = cancelStudentContractSchema.parse(req.body);

      const canceled = await studentContractService.cancel(
        id,
        studentContractId,
        validated.reason,
        {
          companyContractId: contractId,
        }
      );

      return sendSuccess(res, canceled, 'Contrato cancelado com sucesso');
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 'Dados inválidos', 400, error.errors);
      }
      if (
        error?.message?.includes('não encontrado') ||
        error?.message?.includes('fora do escopo')
      ) {
        return sendError(res, error.message, 404);
      }
      console.error('Erro ao cancelar contrato do aluno:', error);
      return sendError(res, error?.message || 'Erro ao cancelar contrato do aluno', 500);
    }
  }
);

// Schemas de validaÃ§Ã£o
/**
 * POST /api/v1/alunos
 * Criar novo aluno
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = CreateAlunoSchema.parse(req.body);
    const { professorId } = getProfessorContext(req);

    if (!professorId) {
      return sendError(res, 'Professor não encontrado', 404);
    }

    const aluno = await alunoService.create({
      ...validatedData,
      professorId: professorId,
    });

    return sendSuccess(res, aluno, 'Aluno criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    if (error?.message === 'Email jÃ¡ estÃ¡ registrado') {
      return sendError(res, error.message, 400);
    }
    console.error('Erro ao criar aluno:', error);
    return sendError(res, 'Erro ao criar aluno', 500);
  }
});

const createAssessmentSchema = z.object({
  typeId: z.string().min(1),
  assessmentDate: z.string().optional(),
});

const updateAssessmentSchema = z.object({
  typeId: z.string().min(1).optional(),
  assessmentDate: z.string().optional(),
  variables: z.record(z.union([z.number(), z.string(), z.null()])).optional(),
});

const textVariableKeys = new Set(['Protocolo', 'R. VO2mÃ¡ximo', 'Tipo de Dieta']);

const parseVariableValue = (key: string, value: unknown) => {
  if (textVariableKeys.has(key)) {
    if (value === null || value === undefined || value === '') return null;
    return String(value).trim();
  }
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    let cleaned = value.trim();
    if (cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
    cleaned = cleaned.replace(/[^\d.-]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getNumericVariable = (variables: Record<string, any>, ...keys: string[]) => {
  for (const key of keys) {
    const value = variables[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
};

const getStringVariable = (variables: Record<string, any>, ...keys: string[]) => {
  for (const key of keys) {
    const value = variables[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
};

const parseBrDateToIso = (value?: string | null) => {
  if (!value) return undefined;

  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return undefined;

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
};

const parseOptionalDate = (value: string | null | undefined, fieldName: string) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value.trim() === '') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Campo ${fieldName} inválido`);
  }

  return parsed;
};

const recalculateAssessmentPlanAfterMutation = async (
  alunoId: string,
  contractId: string
) => {
  await alunoAssessmentPlanService.recalculateByAluno({
    alunoId,
    contractId,
  });

  await assessmentPlanNotificationService.dispatchForAluno(alunoId, contractId, {
    upcomingWindowDays: 7,
  });
};

const extractNamedValue = (text: string, labels: string[]) => {
  for (const label of labels) {
    const regex = new RegExp(`${label}\\s*:?\\s*([^\\n\\r]+)`, 'i');
    const match = text.match(regex);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
};

const extractPressure = (text: string) => {
  const labeledMatch = text.match(/press[aã]o[^\d]*(\d{2,3})\s*\/\s*(\d{2,3})/i);
  if (labeledMatch) {
    return {
      systolicPressure: Number(labeledMatch[1]),
      diastolicPressure: Number(labeledMatch[2]),
    };
  }

  const genericMatch = text.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\s*mmhg\b/i);
  if (genericMatch) {
    return {
      systolicPressure: Number(genericMatch[1]),
      diastolicPressure: Number(genericMatch[2]),
    };
  }

  return {
    systolicPressure: undefined,
    diastolicPressure: undefined,
  };
};

const buildAlunoPrefillPayload = (
  rawText: string,
  metrics: Record<string, number | null>,
  variables: Record<string, any>
) => {
  const assessmentDateLabel = extractNamedValue(rawText, ['Data da Avalia[cç][aã]o', 'Data Avalia[cç][aã]o']);
  const birthDateLabel = extractNamedValue(rawText, ['Nascimento', 'Data de Nascimento']);
  const genderLabel = extractNamedValue(rawText, ['Sexo']);
  const ageLabel = extractNamedValue(rawText, ['Idade']);
  const alunoName = extractNamedValue(rawText, ['Aluno', 'Avaliado']);
  const pressure = extractPressure(rawText);
  const heightRaw = getNumericVariable(variables, 'Estatura');
  const height = heightRaw !== undefined ? (heightRaw > 3 ? heightRaw : heightRaw * 100) : undefined;

  let gender: 'male' | 'female' | 'other' | undefined;
  if (genderLabel) {
    const normalized = genderLabel.toLowerCase();
    if (normalized.includes('masc')) gender = 'male';
    else if (normalized.includes('fem')) gender = 'female';
    else gender = 'other';
  }

  const ageMatch = ageLabel?.match(/\d{1,3}/);

  return {
    name: alunoName,
    birthDate: parseBrDateToIso(birthDateLabel),
    gender,
    age: ageMatch ? Number(ageMatch[0]) : undefined,
    weight: metrics.peso ?? getNumericVariable(variables, 'Peso'),
    height,
    bodyFatPercentage: metrics.percent_gordura ?? getNumericVariable(variables, '% Gordura'),
    vo2Max: metrics.vo2max_ml ?? getNumericVariable(variables, 'VO2máximo'),
    anaerobicThreshold:
      metrics.limiar_anaerobio_kmh ??
      getNumericVariable(variables, 'Limiar Anaeróbico (km/h ou watt)', 'Carga Limiar (km/h)'),
    maxHeartRate: metrics.fc_max ?? getNumericVariable(variables, 'FC Máxima no Teste', 'FC Máxima Predita'),
    restingHeartRate: metrics.fc_rep ?? getNumericVariable(variables, 'FC Repouso'),
    systolicPressure: pressure.systolicPressure,
    diastolicPressure: pressure.diastolicPressure,
    macronutrients: {
      carbohydratesPercentage: getNumericVariable(variables, 'Carboidratos (%)'),
      proteinsPercentage: getNumericVariable(variables, 'Proteínas (%)'),
      lipidsPercentage: getNumericVariable(variables, 'Lipídios (%)'),
      dailyCalories: getNumericVariable(variables, 'Total de Kcal/dia'),
    },
    intakeForm: {
      assessmentDate: parseBrDateToIso(assessmentDateLabel),
      trainingBackground: getStringVariable(variables, 'Protocolo'),
      observations: 'Campos pre-preenchidos a partir do PDF de avaliacao.',
    },
    extractedPreview: {
      parseOk: Boolean(rawText && rawText.trim().length > 0),
      sourceName: alunoName,
      sourceAssessmentDate: parseBrDateToIso(assessmentDateLabel),
    },
  };
};

/**
 * GET /api/v1/alunos
 * Listar alunos do professor
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const professorId = (req as any).user.professorId;
    const professorRole = (req as any).user.professorRole as 'master' | 'professor';
    const contractId = (req as any).user.contractId as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const filterProfessorId =
      typeof req.query.professorId === 'string' && req.query.professorId.trim()
        ? req.query.professorId.trim()
        : undefined;
    const rawStatus = req.query.status as string | undefined;
    const status = rawStatus === 'inactive' || rawStatus === 'all' ? rawStatus : 'active';

    if (!professorId) {
      return sendError(res, 'Professor não encontrado', 404);
    }

    const result =
      professorRole === 'master' && contractId
        ? await alunoService.findByContract(
            contractId,
            page,
            limit,
            filterProfessorId,
            status
          )
        : contractId
          ? await (async () => {
              const accessibleProfessorIds = await getManagedProfessorIds(contractId, professorId);

              if (accessibleProfessorIds.length > 1) {
                return alunoService.findByProfessorIds(accessibleProfessorIds, page, limit, status);
              }

              return alunoService.findByProfessor(professorId, page, limit, status);
            })()
          : await alunoService.findByProfessor(professorId, page, limit, status);

    return sendSuccess(res, result, 'Alunos recuperados com sucesso');
  } catch (error) {
    console.error('Erro ao listar alunos:', error);
    return sendError(res, 'Erro ao listar alunos', 500);
  }
});


/**
 * GET /api/v1/alunos/search
 * Buscar alunos por nome
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const professorId = (req as any).user.professorId;
    const professorRole = (req as any).user.professorRole as 'master' | 'professor';
    const contractId = (req as any).user.contractId as string | undefined;
    const query = req.query.q as string;
    const filterProfessorId =
      typeof req.query.professorId === 'string' && req.query.professorId.trim()
        ? req.query.professorId.trim()
        : undefined;
    const rawStatus = req.query.status as string | undefined;
    const status = rawStatus === 'inactive' || rawStatus === 'all' ? rawStatus : 'active';

    if (!professorId) {
      return sendError(res, 'Professor n?o encontrado', 404);
    }

    if (!query || query.length < 2) {
      return sendError(res, 'Query de busca deve ter no m?nimo 2 caracteres', 400);
    }

    const alunos =
      professorRole === 'master' && contractId
        ? await alunoService.search({
            query,
            contractId,
            professorId: filterProfessorId,
            status,
          })
        : contractId
          ? await (async () => {
              const accessibleProfessorIds = await getManagedProfessorIds(contractId, professorId);

              if (accessibleProfessorIds.length > 1) {
                return alunoService.search({
                  query,
                  professorIds: accessibleProfessorIds,
                  status,
                });
              }

              return alunoService.search({ query, professorId, status });
            })()
          : await alunoService.search({ query, professorId, status });

    return sendSuccess(res, alunos, 'Busca realizada com sucesso');
  } catch (error) {
    console.error('Erro ao buscar alunos:', error);
    return sendError(res, 'Erro ao buscar alunos', 500);
  }
});

/**
 * POST /api/v1/alunos/assessment-prefill
 * Processar PDF de avaliacao e retornar dados para pre-preenchimento do cadastro
 */
router.post('/assessment-prefill', uploadAssessmentPrefillFile, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return sendError(res, 'Arquivo PDF nao enviado', 400);
    }

    const parsed = await pdfParse(req.file.buffer);
    const rawText = parsed.text || '';
    const parsedData = parseAssessmentPdf(rawText);
    const aiResult = await fillAssessmentWithAi(parsedData, req.file.buffer, req.file.originalname);
    const payload = buildAlunoPrefillPayload(rawText, aiResult.metrics, aiResult.variables);

    return sendSuccess(res, payload, 'PDF processado com sucesso');
  } catch (error: any) {
    console.error('Erro ao pre-processar PDF de avaliacao:', error);
    return sendError(res, error?.message || 'Erro ao processar PDF de avaliacao', 500);
  }
});


/**
 * GET /api/v1/alunos/:id
 * Obter aluno por ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    const aluno = await alunoService.findById(id);

    if (!aluno) {
      return sendError(res, 'Aluno nÃ£o encontrado', 404);
    }

    // Calcular dados adicionais
    const bmi = aluno.weight !== null && aluno.height !== null
      ? alunoService.calculateBMI(aluno.weight, aluno.height)
      : null;
    const hrZones = aluno.maxHeartRate !== null && aluno.restingHeartRate !== null
      ? alunoService.calculateHeartRateZones(
          aluno.maxHeartRate,
          aluno.restingHeartRate
        )
      : null;

    return sendSuccess(
      res,
      {
        ...aluno,
        calculated: {
          bmi,
          hrZones,
        },
      },
      'Aluno recuperado com sucesso'
    );
  } catch (error) {
    console.error('Erro ao obter aluno:', error);
    return sendError(res, 'Erro ao obter aluno', 500);
  }
});

/**
 * PUT /api/v1/alunos/:id
 * Atualizar aluno
 */
router.put('/:id', blockAccessMiddleware('students.actions.editProfile'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    const validatedData = UpdateAlunoSchema.parse(req.body);
    const aluno = await alunoService.update(id, validatedData);

    return sendSuccess(res, aluno, 'Aluno atualizado com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    console.error('Erro ao atualizar aluno:', error);
    return sendError(res, 'Erro ao atualizar aluno', 500);
  }
});

/**
 * DELETE /api/v1/alunos/:id
 * Deletar aluno
 */
router.delete('/:id', blockAccessMiddleware('students.actions.deleteStudent'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    await alunoService.delete(id);

    return sendSuccess(res, null, 'Aluno excluÃ­do com sucesso');
  } catch (error) {
    console.error('Erro ao excluir aluno:', error);
    return sendError(res, 'Erro ao excluir aluno', 500);
  }
});


/**
 * POST /api/v1/alunos/:id/deactivate
 * Inativar aluno
 */
router.post('/:id/deactivate', blockAccessMiddleware('students.actions.deleteStudent'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const professorId = (req as any).user.professorId;
    const professorRole = (req as any).user.professorRole as 'master' | 'professor';
    const contractId = (req as any).user.contractId as string | undefined;

    if (!professorId) {
      return sendError(res, 'Professor n?o encontrado', 404);
    }

    const belongs =
      professorRole === 'master' && contractId
        ? await alunoService.belongsToContract(id, contractId)
        : await alunoService.belongsToProfessor(id, professorId);

    if (!belongs) {
      return sendError(res, 'Aluno não encontrado ou não pertence a você', 404);
    }

    const aluno = await alunoService.setActive(id, false);
    return sendSuccess(res, aluno, 'Aluno inativado com sucesso');
  } catch (error) {
    console.error('Erro ao inativar aluno:', error);
    return sendError(res, 'Erro ao inativar aluno', 500);
  }
});

/**
 * POST /api/v1/alunos/:id/activate
 * Reativar aluno
 */
router.post('/:id/activate', blockAccessMiddleware('students.actions.editProfile'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const professorId = (req as any).user.professorId;
    const professorRole = (req as any).user.professorRole as 'master' | 'professor';
    const contractId = (req as any).user.contractId as string | undefined;

    if (!professorId) {
      return sendError(res, 'Professor não encontrado', 404);
    }

    const belongs =
      professorRole === 'master' && contractId
        ? await alunoService.belongsToContract(id, contractId)
        : await alunoService.belongsToProfessor(id, professorId);

    if (!belongs) {
      return sendError(res, 'Aluno não encontrado ou não pertence a você', 404);
    }

    const aluno = await alunoService.setActive(id, true);
    return sendSuccess(res, aluno, 'Aluno reativado com sucesso');
  } catch (error) {
    console.error('Erro ao reativar aluno:', error);
    return sendError(res, 'Erro ao reativar aluno', 500);
  }
});

/**
 * POST /api/v1/alunos/:id/reset-password
 * Resetar senha do aluno (gera senha temporÃ¡ria)
 */
router.post('/:id/reset-password', blockAccessMiddleware('students.actions.resetPassword'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    const tempPassword = await alunoService.resetPassword(id);

    return sendSuccess(res, { tempPassword }, 'Senha resetada com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao resetar senha', 400);
  }
});

/**
 * GET /api/v1/alunos/:id/assessments
 * Listar avaliaÃƒÂ§ÃƒÂµes do aluno
 */
router.get('/:id/assessments', blockAccessMiddleware('students.details.assessments'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    if (false) {
      return sendError(res, 'Professor não encontrado', 404);
    }

    const belongs = true;
    if (!belongs) {
      return sendError(res, 'Aluno nÃƒÂ£o encontrado ou nÃƒÂ£o pertence a vocÃƒÂª', 404);
    }

    const assessments = await assessmentService.listByAluno(id);
    return sendSuccess(res, assessments, 'AvaliaÃƒÂ§ÃƒÂµes recuperadas com sucesso');
  } catch (error) {
    console.error('Erro ao listar avaliaÃƒÂ§ÃƒÂµes:', error);
    return sendError(res, 'Erro ao listar avaliaÃƒÂ§ÃƒÂµes', 500);
  }
});

/**
 * GET /api/v1/alunos/:id/assessments/summary
 * Resumo da ÃƒÂºltima e prÃƒÂ³xima avaliaÃƒÂ§ÃƒÂ£o por tipo
 */
router.get('/:id/assessments/summary', blockAccessMiddleware('students.details.assessments'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { professorId, professorRole, contractId } = getProfessorContext(req);

    if (!professorId || !contractId) {
      return sendError(res, 'Contrato ou professor nÃƒÂ£o encontrado', 404);
    }

    const belongs =
      professorRole === 'master'
        ? await alunoService.belongsToContract(id, contractId)
        : await alunoService.belongsToProfessor(id, professorId);
    if (!belongs) {
      return sendError(res, 'Aluno nÃƒÂ£o encontrado ou nÃƒÂ£o pertence a vocÃƒÂª', 404);
    }

    const summary = await assessmentService.getSummaryByAluno(id, contractId);
    return sendSuccess(res, summary, 'Resumo de avaliaÃƒÂ§ÃƒÂµes carregado');
  } catch (error) {
    console.error('Erro ao carregar resumo de avaliaÃƒÂ§ÃƒÂµes:', error);
    return sendError(res, 'Erro ao carregar resumo de avaliaÃƒÂ§ÃƒÂµes', 500);
  }
});

/**
 * GET /api/v1/alunos/:id/assessment-plan
 * Lista plano de avaliações do aluno (ativos e inativos)
 */
router.get('/:id/assessment-plan', screenAccessMiddleware('students.assessmentPlan'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { contractId } = getProfessorContext(req);

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    const plan = await alunoAssessmentPlanService.getByAluno(id, contractId);
    return sendSuccess(res, plan, 'Plano de avaliações carregado com sucesso');
  } catch (error) {
    console.error('Erro ao carregar plano de avaliações:', error);
    return sendError(res, 'Erro ao carregar plano de avaliações', 500);
  }
});

/**
 * PUT /api/v1/alunos/:id/assessment-plan
 * Criar/atualizar itens do plano de avaliações do aluno
 */
router.put('/:id/assessment-plan', blockAccessMiddleware('students.actions.manageAssessmentPlan'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { contractId } = getProfessorContext(req);

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    const validated = upsertAlunoAssessmentPlanSchema.parse(req.body);
    const items = validated.items.map((item) => ({
      assessmentTypeId: item.assessmentTypeId,
      isActive: item.isActive,
      isRequired: item.isRequired,
      cadenceMonths: item.cadenceMonths,
      startDate: parseOptionalDate(item.startDate, 'startDate'),
      nextDueDate: parseOptionalDate(item.nextDueDate, 'nextDueDate'),
      notes: item.notes === undefined ? undefined : item.notes?.trim() || null,
    }));

    const plan = await alunoAssessmentPlanService.upsertByAluno({
      alunoId: id,
      contractId,
      items,
    });

    await assessmentPlanNotificationService.dispatchForAluno(id, contractId, {
      upcomingWindowDays: 7,
    });

    return sendSuccess(res, plan, 'Plano de avaliações salvo com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }

    if (error?.message?.startsWith('Campo ')) {
      return sendError(res, error.message, 400);
    }

    if (error?.message?.includes('tipos de avaliação')) {
      return sendError(res, error.message, 400);
    }

    console.error('Erro ao salvar plano de avaliações:', error);
    return sendError(res, 'Erro ao salvar plano de avaliações', 500);
  }
});

/**
 * POST /api/v1/alunos/:id/assessment-plan/recalculate
 * Recalcula próximas datas previstas do plano de avaliações
 */
router.post('/:id/assessment-plan/recalculate', blockAccessMiddleware('students.actions.manageAssessmentPlan'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { contractId } = getProfessorContext(req);

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    if (!(await ensureAlunoAccess(req, res, id))) {
      return;
    }

    const plan = await alunoAssessmentPlanService.recalculateByAluno({
      alunoId: id,
      contractId,
    });

    await assessmentPlanNotificationService.dispatchForAluno(id, contractId, {
      upcomingWindowDays: 7,
    });

    return sendSuccess(res, plan, 'Plano de avaliações recalculado com sucesso');
  } catch (error) {
    console.error('Erro ao recalcular plano de avaliações:', error);
    return sendError(res, 'Erro ao recalcular plano de avaliações', 500);
  }
});

/**
 * POST /api/v1/alunos/:id/assessments
 * Upload de avaliacao e criacao de registro
 */
router.post('/:id/assessments', blockAccessMiddleware('students.actions.manageAssessments'), uploadAssessmentFile, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { professorId, professorRole, contractId } = getProfessorContext(req);

    if (!professorId || !contractId) {
      return sendError(res, 'Contrato ou professor nÃƒÂ£o encontrado', 404);
    }

    const belongs =
      professorRole === 'master'
        ? await alunoService.belongsToContract(id, contractId)
        : await alunoService.belongsToProfessor(id, professorId);
    if (!belongs) {
      return sendError(res, 'Aluno nÃƒÂ£o encontrado ou nÃƒÂ£o pertence a vocÃƒÂª', 404);
    }

    const validated = createAssessmentSchema.parse(req.body);

    if (!req.file) {
      return sendError(res, 'Arquivo PDF nÃƒÂ£o enviado', 400);
    }

    const type = await prisma.assessmentType.findFirst({
      where: { id: validated.typeId, contractId },
    });

    if (!type) {
      return sendError(res, 'Tipo de avaliaÃƒÂ§ÃƒÂ£o nÃƒÂ£o encontrado', 404);
    }

    const assessmentDate = validated.assessmentDate
      ? new Date(validated.assessmentDate)
      : new Date();

    if (Number.isNaN(assessmentDate.getTime())) {
      return sendError(res, 'Data de avaliaÃƒÂ§ÃƒÂ£o invÃƒÂ¡lida', 400);
    }

    const storedPath = resolveStoredUploadPathFromAbsolute(req.file.path);

    let extractedData: any = null;
    try {
      const buffer = fs.readFileSync(req.file.path);
      const parsed = await pdfParse(buffer);
      const rawText = parsed.text || '';
      const parsedData = parseAssessmentPdf(rawText);
      const aiResult = await fillAssessmentWithAi(parsedData, buffer, req.file.originalname);
      const aiOk = Boolean(aiResult.ai?.used && !aiResult.ai?.error);
      extractedData = {
        rawText,
        info: parsed.info,
        metadata: parsed.metadata ? parsed.metadata : null,
        metrics: aiResult.metrics,
        variables: aiResult.variables,
        ai: aiResult.ai,
        parseOk: Boolean(rawText && rawText.trim().length > 0) || aiOk,
      };
    } catch (parseError) {
      extractedData = {
        parseOk: false,
        parseError: (parseError as Error)?.message || 'Falha ao ler PDF',
      };
      console.warn('NÃƒÂ£o foi possÃƒÂ­vel extrair dados do PDF:', parseError);
    }

    const created = await assessmentService.create({
      alunoId: id,
      professorId,
      typeId: validated.typeId,
      assessmentDate,
      filePath: storedPath,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      extractedData,
    });

    await recalculateAssessmentPlanAfterMutation(id, contractId);

    return sendSuccess(res, created, 'AvaliaÃƒÂ§ÃƒÂ£o cadastrada com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados invÃƒÂ¡lidos', 400, error.errors);
    }
    if (error?.message?.includes('Somente arquivos PDF')) {
      return sendError(res, error.message, 400);
    }
    console.error('Erro ao cadastrar avaliaÃƒÂ§ÃƒÂ£o:', error);
    return sendError(res, 'Erro ao cadastrar avaliaÃƒÂ§ÃƒÂ£o', 500);
  }
});

/**
 * GET /api/v1/alunos/:id/assessments/:assessmentId/file
 * Download do PDF da avaliaÃƒÂ§ÃƒÂ£o
 */
router.get('/:id/assessments/:assessmentId/file', blockAccessMiddleware('students.details.assessments'), async (req: Request, res: Response) => {
  try {
    const { id, assessmentId } = req.params;
    const professorId = (req as any).user.professorId;

    if (false) {
      return sendError(res, 'Professor não encontrado', 404);
    }

    const belongs = true;
    if (!belongs) {
      return sendError(res, 'Aluno nÃƒÂ£o encontrado ou nÃƒÂ£o pertence a vocÃƒÂª', 404);
    }

    const assessment = await assessmentService.getById(assessmentId);
    if (!assessment || assessment.alunoId !== id) {
      return sendError(res, 'AvaliaÃƒÂ§ÃƒÂ£o nÃƒÂ£o encontrada', 404);
    }

    const filePath = resolveUploadAbsolutePathFromStored(assessment.filePath);
    if (!fs.existsSync(filePath)) {
      return sendError(res, 'Arquivo nÃƒÂ£o encontrado no servidor', 404);
    }

    return res.download(filePath, assessment.originalFileName ?? path.basename(filePath));
  } catch (error) {
    console.error('Erro ao baixar arquivo:', error);
    return sendError(res, 'Erro ao baixar arquivo', 500);
  }
});

/**
 * POST /api/v1/alunos/:id/assessments/:assessmentId/reprocess
 * Reprocessar PDF e atualizar extractedData
 */
router.post('/:id/assessments/:assessmentId/reprocess', blockAccessMiddleware('students.actions.manageAssessments'), async (req: Request, res: Response) => {
  try {
    const { id, assessmentId } = req.params;
    const professorId = (req as any).user.professorId;
    const contractId = (req as any).user.contractId;

    console.log('[assessments][reprocess] start', {
      assessmentId,
      alunoId: id,
        professorId,
      contractId,
    });

    if (!professorId || !contractId) {
      return sendError(res, 'Contrato ou professor não encontrado', 404);
    }

    const belongs = await alunoService.belongsToProfessor(id, professorId);
    if (!belongs) {
      return sendError(res, 'Aluno não encontrado ou não pertence a você', 404);
    }

    const assessment = await assessmentService.getById(assessmentId);
    if (!assessment || assessment.alunoId !== id) {
      return sendError(res, 'Avaliação não encontrada', 404);
    }

    const filePath = resolveUploadAbsolutePathFromStored(assessment.filePath);
    console.log('[assessments][reprocess] file', { filePath });
    if (!fs.existsSync(filePath)) {
      return sendError(res, 'Arquivo não encontrado no servidor', 404);
    }

    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    const rawText = parsed.text || '';
    const parsedData = parseAssessmentPdf(rawText);
    const aiResult = await fillAssessmentWithAi(parsedData, buffer, path.basename(filePath));
    const aiOk = Boolean(aiResult.ai?.used && !aiResult.ai?.error);

    const extractedData = {
      rawText,
      info: parsed.info,
      metadata: parsed.metadata ? parsed.metadata : null,
      metrics: aiResult.metrics,
      variables: aiResult.variables,
      ai: aiResult.ai,
      parseOk: Boolean(rawText && rawText.trim().length > 0) || aiOk,
    };

    console.log('[assessments][reprocess] parsed', {
      parseOk: extractedData.parseOk,
      metricsCount: Object.keys(parsedData.metrics || {}).length,
      variablesCount: Object.keys(parsedData.variables || {}).length,
    });

    const updated = await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        extractedData,
      },
      include: {
        type: true,
      },
    });

    await recalculateAssessmentPlanAfterMutation(id, contractId);

    await prisma.assessmentAuditLog.create({
      data: {
        assessmentId,
        professorId,
        action: 'update',
        diff: {
          beforeData: {
            reprocess: true,
            extractedData: assessment.extractedData,
          },
          afterData: {
            reprocess: true,
            extractedData,
          },
        },
      },
    });

    return sendSuccess(res, updated, 'Avaliação reprocessada com sucesso');
  } catch (error) {
    console.error('Erro ao reprocessar avaliação:', error);
    return sendError(res, 'Erro ao reprocessar avaliação', 500);
  }
});

/**
 * GET /api/v1/alunos/:id/assessments/:assessmentId/logs
 * Histórico de alterações da avaliação
 */
router.get('/:id/assessments/:assessmentId/logs', blockAccessMiddleware('students.actions.manageAssessments'), async (req: Request, res: Response) => {
  try {
    const { id, assessmentId } = req.params;
    const professorId = (req as any).user.professorId;
    const contractId = (req as any).user.contractId;

    if (!professorId || !contractId) {
      return sendError(res, 'Contrato ou professor não encontrado', 404);
    }

    const belongs = await alunoService.belongsToProfessor(id, professorId);
    if (!belongs) {
      return sendError(res, 'Aluno não encontrado ou não pertence a você', 404);
    }

    const assessment = await assessmentService.getById(assessmentId);
    if (!assessment || assessment.alunoId !== id) {
      return sendError(res, 'Avaliação não encontrada', 404);
    }

    const logs = await prisma.assessmentAuditLog.findMany({
      where: { assessmentId },
      orderBy: { createdAt: 'desc' },
      include: {
        professor: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    return sendSuccess(res, logs, 'Histórico carregado');
  } catch (error) {
    console.error('Erro ao carregar histórico:', error);
    return sendError(res, 'Erro ao carregar histórico', 500);
  }
});

/**
 * PUT /api/v1/alunos/:id/assessments/:assessmentId
 * Atualizar data/tipo da avaliacao
 */
router.put('/:id/assessments/:assessmentId', blockAccessMiddleware('students.actions.manageAssessments'), async (req: Request, res: Response) => {
  try {
    const { id, assessmentId } = req.params;
    const professorId = (req as any).user.professorId;
    const contractId = (req as any).user.contractId;

    if (!professorId || !contractId) {
      return sendError(res, 'Contrato ou professor não encontrado', 404);
    }

    const belongs = await alunoService.belongsToProfessor(id, professorId);
    if (!belongs) {
      return sendError(res, 'Aluno não encontrado ou não pertence a você', 404);
    }

    const assessment = await assessmentService.getById(assessmentId);
    if (!assessment || assessment.alunoId !== id) {
      return sendError(res, 'Avaliação não encontrada', 404);
    }

    if (assessment.extractedData && (assessment.extractedData as any).parseOk === false) {
      return sendError(res, 'Não é possível editar uma avaliação com PDF corrompido', 400);
    }

    const validated = updateAssessmentSchema.parse(req.body);

    let assessmentDate: Date | undefined;
    if (validated.assessmentDate) {
      assessmentDate = new Date(validated.assessmentDate);
      if (Number.isNaN(assessmentDate.getTime())) {
        return sendError(res, 'Data de avaliação inválida', 400);
      }
    }

    if (validated.typeId) {
      const type = await prisma.assessmentType.findFirst({
        where: { id: validated.typeId, contractId },
      });
      if (!type) {
        return sendError(res, 'Tipo de avaliação não encontrado', 404);
      }
    }

    const beforeData: any = {
      typeId: assessment.typeId,
      assessmentDate: assessment.assessmentDate,
    };

    let extractedData = assessment.extractedData ? { ...(assessment.extractedData as any) } : {};
    let updatedVariables: Record<string, number | string | null> | null = null;
    if (validated.variables) {
      const currentVariables = (extractedData?.variables || {}) as Record<string, number | string | null>;
      updatedVariables = { ...currentVariables };
      Object.entries(validated.variables).forEach(([key, value]) => {
        updatedVariables![key] = parseVariableValue(key, value) as any;
      });
      extractedData = { ...extractedData, variables: updatedVariables };
      beforeData.variables = currentVariables;
    }

    const updated = await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        assessmentDate,
        typeId: validated.typeId,
        extractedData: updatedVariables ? extractedData : undefined,
      },
      include: {
        type: true,
      },
    });

    await prisma.assessmentAuditLog.create({
      data: {
        assessmentId,
        professorId,
        action: 'update',
        diff: {
          beforeData,
          afterData: {
            typeId: updated.typeId,
            assessmentDate: updated.assessmentDate,
            variables: updatedVariables ?? undefined,
          },
        },
      },
    });

    return sendSuccess(res, updated, 'Avaliação atualizada com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    console.error('Erro ao atualizar avaliação:', error);
    return sendError(res, 'Erro ao atualizar avaliação', 500);
  }
});

/**
 * DELETE /api/v1/alunos/:id/assessments/:assessmentId
 * Excluir avaliação e PDF
 */
router.delete('/:id/assessments/:assessmentId', blockAccessMiddleware('students.actions.manageAssessments'), async (req: Request, res: Response) => {
  try {
    const { id, assessmentId } = req.params;
    const professorId = (req as any).user.professorId;
    const contractId = (req as any).user.contractId;

    if (!professorId || !contractId) {
      return sendError(res, 'Contrato ou professor não encontrado', 404);
    }

    const belongs = await alunoService.belongsToProfessor(id, professorId);
    if (!belongs) {
      return sendError(res, 'Aluno não encontrado ou não pertence a você', 404);
    }

    const assessment = await assessmentService.getById(assessmentId);
    if (!assessment || assessment.alunoId !== id) {
      return sendError(res, 'Avaliação não encontrada', 404);
    }

    await prisma.assessmentAuditLog.create({
      data: {
        assessmentId,
        professorId,
        action: 'delete',
        diff: {
          beforeData: {
            typeId: assessment.typeId,
            assessmentDate: assessment.assessmentDate,
            originalFileName: assessment.originalFileName,
          },
        },
      },
    });

    const filePath = resolveUploadAbsolutePathFromStored(assessment.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await assessmentService.delete(assessmentId);
    await recalculateAssessmentPlanAfterMutation(id, contractId);
    return sendSuccess(res, null, 'Avaliação excluída com sucesso');
  } catch (error) {
    console.error('Erro ao excluir avaliação:', error);
    return sendError(res, 'Erro ao excluir avaliação', 500);
  }
});

export default router;
