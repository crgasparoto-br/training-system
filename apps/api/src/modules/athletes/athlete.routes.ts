import { Router, Request, Response } from 'express';
import { athleteService } from './athlete.service';
import { authMiddleware, educatorMiddleware } from '../auth/auth.middleware';
import { sendSuccess, sendError } from '@corrida/utils';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import { PrismaClient } from '@prisma/client';
import { assessmentService } from '../assessments/assessment.service';
import { parseAssessmentPdf } from '../assessments/assessment-parser';
import { fillAssessmentWithAi } from '../assessments/assessment-ai';

const router = Router();
const prisma = new PrismaClient();

const uploadRoot = path.resolve(process.cwd(), 'uploads', 'assessments');
const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const athleteId = req.params.id;
    const athleteDir = path.join(uploadRoot, athleteId);
    ensureDir(athleteDir);
    cb(null, athleteDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Somente arquivos PDF sÃ£o permitidos'));
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

// Aplicar autenticação em todas as rotas
router.use(authMiddleware);
router.use(educatorMiddleware); // Apenas educadores podem gerenciar atletas

// Schemas de validação
const createAthleteSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  phone: z.string().optional(),
  age: z.number().int().min(10).max(100),
  weight: z.number().positive(),
  height: z.number().positive(),
  bodyFatPercentage: z.number().min(0).max(100).optional(),
  vo2Max: z.number().positive(),
  anaerobicThreshold: z.number().positive(),
  maxHeartRate: z.number().int().min(100).max(220),
  restingHeartRate: z.number().int().min(30).max(100),
});

const updateAthleteSchema = z.object({
  age: z.number().int().min(10).max(100).optional(),
  weight: z.number().positive().optional(),
  height: z.number().positive().optional(),
  bodyFatPercentage: z.number().min(0).max(100).optional(),
  vo2Max: z.number().positive().optional(),
  anaerobicThreshold: z.number().positive().optional(),
  maxHeartRate: z.number().int().min(100).max(220).optional(),
  restingHeartRate: z.number().int().min(30).max(100).optional(),
});

/**
 * POST /api/v1/athletes
 * Criar novo atleta
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = createAthleteSchema.parse(req.body);
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    const athlete = await athleteService.create({
      ...validatedData,
      educatorId,
    });

    return sendSuccess(res, athlete, 'Atleta criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    if (error?.message === 'Email já está registrado') {
      return sendError(res, error.message, 400);
    }
    console.error('Erro ao criar atleta:', error);
    return sendError(res, 'Erro ao criar atleta', 500);
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

const textVariableKeys = new Set(['Protocolo', 'R. VO2máximo', 'Tipo de Dieta']);

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

/**
 * GET /api/v1/athletes
 * Listar atletas do educador
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const educatorId = (req as any).user.educatorId;
    const educatorRole = (req as any).user.educatorRole as 'master' | 'educator';
    const contractId = (req as any).user.contractId as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const filterEducatorId =
      typeof req.query.educatorId === 'string' && req.query.educatorId.trim()
        ? req.query.educatorId.trim()
        : undefined;
    const rawStatus = req.query.status as string | undefined;
    const status = rawStatus === 'inactive' || rawStatus === 'all' ? rawStatus : 'active';

    if (!educatorId) {
      return sendError(res, 'Educador nao encontrado', 404);
    }

    const result =
      educatorRole === 'master' && contractId
        ? await athleteService.findByContract(
            contractId,
            page,
            limit,
            filterEducatorId,
            status
          )
        : await athleteService.findByEducator(educatorId, page, limit, status);

    return sendSuccess(res, result, 'Atletas recuperados com sucesso');
  } catch (error) {
    console.error('Erro ao listar atletas:', error);
    return sendError(res, 'Erro ao listar atletas', 500);
  }
});


/**
 * GET /api/v1/athletes/search
 * Buscar atletas por nome
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const educatorId = (req as any).user.educatorId;
    const educatorRole = (req as any).user.educatorRole as 'master' | 'educator';
    const contractId = (req as any).user.contractId as string | undefined;
    const query = req.query.q as string;
    const filterEducatorId =
      typeof req.query.educatorId === 'string' && req.query.educatorId.trim()
        ? req.query.educatorId.trim()
        : undefined;
    const rawStatus = req.query.status as string | undefined;
    const status = rawStatus === 'inactive' || rawStatus === 'all' ? rawStatus : 'active';

    if (!educatorId) {
      return sendError(res, 'Educador n?o encontrado', 404);
    }

    if (!query || query.length < 2) {
      return sendError(res, 'Query de busca deve ter no m?nimo 2 caracteres', 400);
    }

    const athletes =
      educatorRole === 'master' && contractId
        ? await athleteService.search({
            query,
            contractId,
            educatorId: filterEducatorId,
            status,
          })
        : await athleteService.search({ query, educatorId, status });

    return sendSuccess(res, athletes, 'Busca realizada com sucesso');
  } catch (error) {
    console.error('Erro ao buscar atletas:', error);
    return sendError(res, 'Erro ao buscar atletas', 500);
  }
});


/**
 * GET /api/v1/athletes/:id
 * Obter atleta por ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    // Verificar se atleta pertence ao educador
    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta não encontrado ou não pertence a você', 404);
    }

    const athlete = await athleteService.findById(id);

    if (!athlete) {
      return sendError(res, 'Atleta não encontrado', 404);
    }

    // Calcular dados adicionais
    const bmi = athleteService.calculateBMI(athlete.weight, athlete.height);
    const hrZones = athleteService.calculateHeartRateZones(
      athlete.maxHeartRate,
      athlete.restingHeartRate
    );

    return sendSuccess(
      res,
      {
        ...athlete,
        calculated: {
          bmi,
          hrZones,
        },
      },
      'Atleta recuperado com sucesso'
    );
  } catch (error) {
    console.error('Erro ao obter atleta:', error);
    return sendError(res, 'Erro ao obter atleta', 500);
  }
});

/**
 * PUT /api/v1/athletes/:id
 * Atualizar atleta
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    // Verificar se atleta pertence ao educador
    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta não encontrado ou não pertence a você', 404);
    }

    const validatedData = updateAthleteSchema.parse(req.body);
    const athlete = await athleteService.update(id, validatedData);

    return sendSuccess(res, athlete, 'Atleta atualizado com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    console.error('Erro ao atualizar atleta:', error);
    return sendError(res, 'Erro ao atualizar atleta', 500);
  }
});

/**
 * DELETE /api/v1/athletes/:id
 * Deletar atleta
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    // Verificar se atleta pertence ao educador
    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta não encontrado ou não pertence a você', 404);
    }

    await athleteService.delete(id);

    return sendSuccess(res, null, 'Atleta deletado com sucesso');
  } catch (error) {
    console.error('Erro ao deletar atleta:', error);
    return sendError(res, 'Erro ao deletar atleta', 500);
  }
});


/**
 * POST /api/v1/athletes/:id/deactivate
 * Inativar atleta
 */
router.post('/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;
    const educatorRole = (req as any).user.educatorRole as 'master' | 'educator';
    const contractId = (req as any).user.contractId as string | undefined;

    if (!educatorId) {
      return sendError(res, 'Educador n?o encontrado', 404);
    }

    const belongs =
      educatorRole === 'master' && contractId
        ? await athleteService.belongsToContract(id, contractId)
        : await athleteService.belongsToEducator(id, educatorId);

    if (!belongs) {
      return sendError(res, 'Atleta nao encontrado ou nao pertence a voce', 404);
    }

    const athlete = await athleteService.setActive(id, false);
    return sendSuccess(res, athlete, 'Atleta inativado com sucesso');
  } catch (error) {
    console.error('Erro ao inativar atleta:', error);
    return sendError(res, 'Erro ao inativar atleta', 500);
  }
});

/**
 * POST /api/v1/athletes/:id/activate
 * Reativar atleta
 */
router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;
    const educatorRole = (req as any).user.educatorRole as 'master' | 'educator';
    const contractId = (req as any).user.contractId as string | undefined;

    if (!educatorId) {
      return sendError(res, 'Educador nao encontrado', 404);
    }

    const belongs =
      educatorRole === 'master' && contractId
        ? await athleteService.belongsToContract(id, contractId)
        : await athleteService.belongsToEducator(id, educatorId);

    if (!belongs) {
      return sendError(res, 'Atleta nao encontrado ou nao pertence a voce', 404);
    }

    const athlete = await athleteService.setActive(id, true);
    return sendSuccess(res, athlete, 'Atleta reativado com sucesso');
  } catch (error) {
    console.error('Erro ao reativar atleta:', error);
    return sendError(res, 'Erro ao reativar atleta', 500);
  }
});

/**
 * POST /api/v1/athletes/:id/reset-password
 * Resetar senha do atleta (gera senha temporária)
 */
router.post('/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta não encontrado ou não pertence a você', 404);
    }

    const tempPassword = await athleteService.resetPassword(id);

    return sendSuccess(res, { tempPassword }, 'Senha resetada com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao resetar senha', 400);
  }
});

/**
 * GET /api/v1/athletes/:id/assessments
 * Listar avaliaÃ§Ãµes do atleta
 */
router.get('/:id/assessments', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador nÃ£o encontrado', 404);
    }

    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta nÃ£o encontrado ou nÃ£o pertence a vocÃª', 404);
    }

    const assessments = await assessmentService.listByAthlete(id);
    return sendSuccess(res, assessments, 'AvaliaÃ§Ãµes recuperadas com sucesso');
  } catch (error) {
    console.error('Erro ao listar avaliaÃ§Ãµes:', error);
    return sendError(res, 'Erro ao listar avaliaÃ§Ãµes', 500);
  }
});

/**
 * GET /api/v1/athletes/:id/assessments/summary
 * Resumo da Ãºltima e prÃ³xima avaliaÃ§Ã£o por tipo
 */
router.get('/:id/assessments/summary', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;
    const contractId = (req as any).user.contractId;

    if (!educatorId || !contractId) {
      return sendError(res, 'Contrato ou educador nÃ£o encontrado', 404);
    }

    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta nÃ£o encontrado ou nÃ£o pertence a vocÃª', 404);
    }

    const summary = await assessmentService.getSummaryByAthlete(id, contractId);
    return sendSuccess(res, summary, 'Resumo de avaliaÃ§Ãµes carregado');
  } catch (error) {
    console.error('Erro ao carregar resumo de avaliaÃ§Ãµes:', error);
    return sendError(res, 'Erro ao carregar resumo de avaliaÃ§Ãµes', 500);
  }
});

/**
 * POST /api/v1/athletes/:id/assessments
 * Upload de avaliaÃ§Ã£o e criaÃ§Ã£o de registro
 */
router.post('/:id/assessments', uploadAssessmentFile, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const educatorId = (req as any).user.educatorId;
    const contractId = (req as any).user.contractId;

    if (!educatorId || !contractId) {
      return sendError(res, 'Contrato ou educador nÃ£o encontrado', 404);
    }

    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta nÃ£o encontrado ou nÃ£o pertence a vocÃª', 404);
    }

    const validated = createAssessmentSchema.parse(req.body);

    if (!req.file) {
      return sendError(res, 'Arquivo PDF nÃ£o enviado', 400);
    }

    const type = await prisma.assessmentType.findFirst({
      where: { id: validated.typeId, contractId },
    });

    if (!type) {
      return sendError(res, 'Tipo de avaliaÃ§Ã£o nÃ£o encontrado', 404);
    }

    const assessmentDate = validated.assessmentDate
      ? new Date(validated.assessmentDate)
      : new Date();

    if (Number.isNaN(assessmentDate.getTime())) {
      return sendError(res, 'Data de avaliaÃ§Ã£o invÃ¡lida', 400);
    }

    const storedPath = path.relative(process.cwd(), req.file.path);

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
      console.warn('NÃ£o foi possÃ­vel extrair dados do PDF:', parseError);
    }

    const created = await assessmentService.create({
      athleteId: id,
      typeId: validated.typeId,
      assessmentDate,
      filePath: storedPath,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      extractedData,
    });

    return sendSuccess(res, created, 'AvaliaÃ§Ã£o cadastrada com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados invÃ¡lidos', 400, error.errors);
    }
    if (error?.message?.includes('Somente arquivos PDF')) {
      return sendError(res, error.message, 400);
    }
    console.error('Erro ao cadastrar avaliaÃ§Ã£o:', error);
    return sendError(res, 'Erro ao cadastrar avaliaÃ§Ã£o', 500);
  }
});

/**
 * GET /api/v1/athletes/:id/assessments/:assessmentId/file
 * Download do PDF da avaliaÃ§Ã£o
 */
router.get('/:id/assessments/:assessmentId/file', async (req: Request, res: Response) => {
  try {
    const { id, assessmentId } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador nÃ£o encontrado', 404);
    }

    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta nÃ£o encontrado ou nÃ£o pertence a vocÃª', 404);
    }

    const assessment = await assessmentService.getById(assessmentId);
    if (!assessment || assessment.athleteId !== id) {
      return sendError(res, 'AvaliaÃ§Ã£o nÃ£o encontrada', 404);
    }

    const filePath = path.resolve(process.cwd(), assessment.filePath);
    if (!fs.existsSync(filePath)) {
      return sendError(res, 'Arquivo nÃ£o encontrado no servidor', 404);
    }

    return res.download(filePath, assessment.originalFileName);
  } catch (error) {
    console.error('Erro ao baixar arquivo:', error);
    return sendError(res, 'Erro ao baixar arquivo', 500);
  }
});

/**
 * POST /api/v1/athletes/:id/assessments/:assessmentId/reprocess
 * Reprocessar PDF e atualizar extractedData
 */
router.post('/:id/assessments/:assessmentId/reprocess', async (req: Request, res: Response) => {
  try {
    const { id, assessmentId } = req.params;
    const educatorId = (req as any).user.educatorId;
    const contractId = (req as any).user.contractId;

    console.log('[assessments][reprocess] start', {
      assessmentId,
      athleteId: id,
      educatorId,
      contractId,
    });

    if (!educatorId || !contractId) {
      return sendError(res, 'Contrato ou educador não encontrado', 404);
    }

    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta não encontrado ou não pertence a você', 404);
    }

    const assessment = await assessmentService.getById(assessmentId);
    if (!assessment || assessment.athleteId !== id) {
      return sendError(res, 'Avaliação não encontrada', 404);
    }

    const filePath = path.resolve(process.cwd(), assessment.filePath);
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

    await prisma.assessmentAuditLog.create({
      data: {
        assessmentId,
        educatorId,
        action: 'update',
        beforeData: {
          reprocess: true,
          extractedData: assessment.extractedData,
        },
        afterData: {
          reprocess: true,
          extractedData,
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
 * GET /api/v1/athletes/:id/assessments/:assessmentId/logs
 * Histórico de alterações da avaliação
 */
router.get('/:id/assessments/:assessmentId/logs', async (req: Request, res: Response) => {
  try {
    const { id, assessmentId } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta não encontrado ou não pertence a você', 404);
    }

    const assessment = await assessmentService.getById(assessmentId);
    if (!assessment || assessment.athleteId !== id) {
      return sendError(res, 'Avaliação não encontrada', 404);
    }

    const logs = await prisma.assessmentAuditLog.findMany({
      where: { assessmentId },
      orderBy: { createdAt: 'desc' },
      include: {
        educator: {
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
 * PUT /api/v1/athletes/:id/assessments/:assessmentId
 * Atualizar data/tipo da avaliação
 */
router.put('/:id/assessments/:assessmentId', async (req: Request, res: Response) => {
  try {
    const { id, assessmentId } = req.params;
    const educatorId = (req as any).user.educatorId;
    const contractId = (req as any).user.contractId;

    if (!educatorId || !contractId) {
      return sendError(res, 'Contrato ou educador não encontrado', 404);
    }

    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta não encontrado ou não pertence a você', 404);
    }

    const assessment = await assessmentService.getById(assessmentId);
    if (!assessment || assessment.athleteId !== id) {
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
        educatorId,
        action: 'update',
        beforeData,
        afterData: {
          typeId: updated.typeId,
          assessmentDate: updated.assessmentDate,
          variables: updatedVariables ?? undefined,
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
 * DELETE /api/v1/athletes/:id/assessments/:assessmentId
 * Excluir avaliação e PDF
 */
router.delete('/:id/assessments/:assessmentId', async (req: Request, res: Response) => {
  try {
    const { id, assessmentId } = req.params;
    const educatorId = (req as any).user.educatorId;

    if (!educatorId) {
      return sendError(res, 'Educador não encontrado', 404);
    }

    const belongs = await athleteService.belongsToEducator(id, educatorId);
    if (!belongs) {
      return sendError(res, 'Atleta não encontrado ou não pertence a você', 404);
    }

    const assessment = await assessmentService.getById(assessmentId);
    if (!assessment || assessment.athleteId !== id) {
      return sendError(res, 'Avaliação não encontrada', 404);
    }

    await prisma.assessmentAuditLog.create({
      data: {
        assessmentId,
        educatorId,
        action: 'delete',
        beforeData: {
          typeId: assessment.typeId,
          assessmentDate: assessment.assessmentDate,
          originalFileName: assessment.originalFileName,
        },
      },
    });

    const filePath = path.resolve(process.cwd(), assessment.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await assessmentService.delete(assessmentId);
    return sendSuccess(res, null, 'Avaliação excluída com sucesso');
  } catch (error) {
    console.error('Erro ao excluir avaliação:', error);
    return sendError(res, 'Erro ao excluir avaliação', 500);
  }
});

export default router;
