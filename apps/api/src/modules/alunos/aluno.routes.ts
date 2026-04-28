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
import { parseAssessmentPdf } from '../assessments/assessment-parser.js';
import { fillAssessmentWithAi } from '../assessments/assessment-ai.js';

const router: Router = Router();
const prisma = new PrismaClient();

const uploadRoot = path.resolve(process.cwd(), 'uploads', 'assessments');
const avatarUploadRoot = path.resolve(process.cwd(), 'uploads', 'alunos');
const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(avatarUploadRoot);
    cb(null, avatarUploadRoot);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
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
    const alunoDir = path.join(uploadRoot, alunoId);
    ensureDir(alunoDir);
    cb(null, alunoDir);
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

    const host = req.get('host');
    if (!host) {
      return sendError(res, 'Não foi possível montar a URL da foto enviada', 500);
    }

    const fileUrl = `${req.protocol}://${host}/uploads/alunos/${req.file.filename}`;

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
router.put('/:id', async (req: Request, res: Response) => {
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
router.delete('/:id', async (req: Request, res: Response) => {
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
router.post('/:id/deactivate', async (req: Request, res: Response) => {
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
router.post('/:id/activate', async (req: Request, res: Response) => {
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
router.post('/:id/reset-password', async (req: Request, res: Response) => {
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
router.get('/:id/assessments', async (req: Request, res: Response) => {
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
router.get('/:id/assessments/summary', async (req: Request, res: Response) => {
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
 * POST /api/v1/alunos/:id/assessments
 * Upload de avaliaÃƒÂ§ÃƒÂ£o e criaÃƒÂ§ÃƒÂ£o de registro
 */
router.post('/:id/assessments', uploadAssessmentFile, async (req: Request, res: Response) => {
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
      console.warn('NÃƒÂ£o foi possÃƒÂ­vel extrair dados do PDF:', parseError);
    }

    const created = await assessmentService.create({
      alunoId: id,
      typeId: validated.typeId,
      assessmentDate,
      filePath: storedPath,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      extractedData,
    });

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
router.get('/:id/assessments/:assessmentId/file', async (req: Request, res: Response) => {
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

    const filePath = path.resolve(process.cwd(), assessment.filePath);
    if (!fs.existsSync(filePath)) {
      return sendError(res, 'Arquivo nÃƒÂ£o encontrado no servidor', 404);
    }

    return res.download(filePath, assessment.originalFileName);
  } catch (error) {
    console.error('Erro ao baixar arquivo:', error);
    return sendError(res, 'Erro ao baixar arquivo', 500);
  }
});

/**
 * POST /api/v1/alunos/:id/assessments/:assessmentId/reprocess
 * Reprocessar PDF e atualizar extractedData
 */
router.post('/:id/assessments/:assessmentId/reprocess', async (req: Request, res: Response) => {
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
        professorId,
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
 * GET /api/v1/alunos/:id/assessments/:assessmentId/logs
 * Histórico de alterações da avaliação
 */
router.get('/:id/assessments/:assessmentId/logs', async (req: Request, res: Response) => {
  try {
    const { id, assessmentId } = req.params;
    const professorId = (req as any).user.professorId;

    if (!professorId) {
      return sendError(res, 'Professor não encontrado', 404);
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
 * Atualizar data/tipo da avaliação
 */
router.put('/:id/assessments/:assessmentId', async (req: Request, res: Response) => {
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
 * DELETE /api/v1/alunos/:id/assessments/:assessmentId
 * Excluir avaliação e PDF
 */
router.delete('/:id/assessments/:assessmentId', async (req: Request, res: Response) => {
  try {
    const { id, assessmentId } = req.params;
    const professorId = (req as any).user.professorId;

    if (!professorId) {
      return sendError(res, 'Professor não encontrado', 404);
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

