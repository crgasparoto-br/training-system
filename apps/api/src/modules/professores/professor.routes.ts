import { Router, Request, Response } from 'express';
import { professorService } from './professor.service.js';
import { authMiddleware } from '../auth/auth.middleware.js';
import {
  getEffectiveDataScopeForProfessor,
  getMostPermissiveDataScopeForProfessor,
  screenAccessMiddleware,
} from '../access-control/index.js';
import { CreateProfessorSchema, UpdateProfessorSchema } from '@corrida/utils';
import { sendSuccess, sendError } from '@corrida/utils';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router: Router = Router();
const avatarUploadRoot = path.resolve(process.cwd(), 'uploads', 'professores');
const signedContractUploadRoot = path.resolve(process.cwd(), 'uploads', 'professores', 'contracts');

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

const signedContractStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(signedContractUploadRoot);
    cb(null, signedContractUploadRoot);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const signedContractUpload = multer({
  storage: signedContractStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Envie um arquivo PDF válido'));
    }

    cb(null, true);
  },
});

function getActorProfessor(req: Request) {
  return {
    role: (req as any).user.professorRole,
    collaboratorFunction: {
      id: (req as any).user.collaboratorFunctionId,
      code: (req as any).user.collaboratorFunctionCode,
    },
  };
}

function sendScopedError(res: Response, error: any, fallback: string) {
  return sendError(res, error.message || fallback, error.statusCode || 400);
}

const uploadAvatarFile = (req: Request, res: Response, next: any) => {
  avatarUpload.single('file')(req, res, (err: any) => {
    if (err) {
      return sendError(res, err.message || 'Erro ao fazer upload da foto', 400);
    }

    next();
  });
};

const uploadSignedContractFile = (req: Request, res: Response, next: any) => {
  signedContractUpload.single('file')(req, res, (err: any) => {
    if (err) {
      return sendError(res, err.message || 'Erro ao fazer upload do contrato', 400);
    }

    next();
  });
};

router.use(authMiddleware);

router.post(
  '/avatar-upload',
  screenAccessMiddleware('collaborators.registration'),
  uploadAvatarFile,
  async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return sendError(res, 'Selecione uma imagem para upload', 400);
    }

    const host = req.get('host');
    if (!host) {
      return sendError(res, 'Não foi possível montar a URL da foto enviada', 500);
    }

    const fileUrl = `${req.protocol}://${host}/uploads/professores/${req.file.filename}`;

    return sendSuccess(res, { url: fileUrl }, 'Foto enviada com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao enviar foto', 400);
  }
  }
);

router.post(
  '/signed-contract-upload',
  screenAccessMiddleware('collaborators.registration'),
  uploadSignedContractFile,
  async (req: Request, res: Response) => {
  try {
    const dataScope = await getEffectiveDataScopeForProfessor(
      getActorProfessor(req),
      'collaborators.registration'
    );

    if (dataScope !== 'contract') {
      return sendError(res, 'Você não tem permissão para executar esta ação administrativa.', 403);
    }

    if (!req.file) {
      return sendError(res, 'Selecione um PDF para upload', 400);
    }

    const host = req.get('host');
    if (!host) {
      return sendError(res, 'Não foi possível montar a URL do contrato enviado', 500);
    }

    const fileUrl = `${req.protocol}://${host}/uploads/professores/contracts/${req.file.filename}`;

    return sendSuccess(res, { url: fileUrl }, 'Contrato enviado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao enviar contrato', 400);
  }
  }
);

/**
 * GET /api/v1/professores
 * Listar professores do contrato
 */
router.get(
  '/',
  screenAccessMiddleware(['collaborators.registration', 'collaborators.consultation']),
  async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId;
    const rawStatus = req.query.status as string | undefined;
    const status = rawStatus === 'active' || rawStatus === 'inactive' ? rawStatus : 'all';

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const dataScope = await getMostPermissiveDataScopeForProfessor(getActorProfessor(req), [
      'collaborators.consultation',
      'collaborators.registration',
    ]);

    if (!dataScope) {
      return sendError(res, 'Você não tem permissão para acessar este colaborador.', 403);
    }

    const professores = await professorService.listByAccessScope(
      contractId,
      (req as any).user.professorId,
      dataScope,
      status
    );

    return sendSuccess(res, professores, 'Professores recuperados com sucesso');
  } catch (error: any) {
    console.error('Erro ao listar professores:', error);
    return sendError(res, 'Erro ao listar professores', 500);
  }
  }
);

/**
 * POST /api/v1/professores
 * Criar novo professor (apenas master de academia)
 */
router.post('/', screenAccessMiddleware('collaborators.registration'), async (req: Request, res: Response) => {
  try {
    const validation = CreateProfessorSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.errors.map((e) => e.message).join(', ');
      return sendError(res, errors, 400);
    }

    const contractId = (req as any).user.contractId;
    const actorProfessorId = (req as any).user.professorId;

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const dataScope = await getEffectiveDataScopeForProfessor(
      getActorProfessor(req),
      'collaborators.registration'
    );

    const professor = await professorService.create({
      contractId,
      actorProfessorId,
      dataScope: dataScope ?? undefined,
      ...validation.data,
    });

    return sendSuccess(res, professor, 'Professor criado com sucesso', 201);
  } catch (error: any) {
    return sendScopedError(res, error, 'Erro ao criar professor');
  }
});

/**
 * PUT /api/v1/professores/:id
 * Atualizar professor
 */
router.put('/:id', screenAccessMiddleware('collaborators.registration'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;
    const actorProfessorId = (req as any).user.professorId;

    const validation = UpdateProfessorSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.errors.map((e) => e.message).join(', ');
      return sendError(res, errors, 400);
    }

    const professor = await professorService.update(contractId, id, {
      actorProfessorId,
      dataScope:
        (await getEffectiveDataScopeForProfessor(
          getActorProfessor(req),
          'collaborators.registration'
        )) ?? undefined,
      ...validation.data,
    });

    return sendSuccess(res, professor, 'Professor atualizado com sucesso');
  } catch (error: any) {
    return sendScopedError(res, error, 'Erro ao atualizar professor');
  }
});

/**
 * POST /api/v1/professores/:id/legal-financial/validate
 * Validar bloco juridico e financeiro do colaborador
 */
router.post('/:id/legal-financial/validate', screenAccessMiddleware('collaborators.registration'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;
    const validatorProfessorId = (req as any).user.professorId;

    const professor = await professorService.validateLegalFinancial(
      contractId,
      id,
      validatorProfessorId,
      (await getEffectiveDataScopeForProfessor(
        getActorProfessor(req),
        'collaborators.registration'
      )) ?? undefined
    );

    return sendSuccess(res, professor, 'Dados juridicos e financeiros validados com sucesso');
  } catch (error: any) {
    return sendScopedError(res, error, 'Erro ao validar dados juridicos e financeiros');
  }
});

/**
 * POST /api/v1/professores/:id/deactivate
 * Desativar professor
 */
router.post('/:id/deactivate', screenAccessMiddleware('collaborators.registration'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;

    await professorService.deactivate(
      contractId,
      id,
      (await getEffectiveDataScopeForProfessor(
        getActorProfessor(req),
        'collaborators.registration'
      )) ?? undefined
    );

    return sendSuccess(res, null, 'Professor desativado com sucesso');
  } catch (error: any) {
    return sendScopedError(res, error, 'Erro ao desativar professor');
  }
});

/**
 * POST /api/v1/professores/:id/activate
 * Reativar professor
 */
router.post('/:id/activate', screenAccessMiddleware('collaborators.registration'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;

    await professorService.activate(
      contractId,
      id,
      (await getEffectiveDataScopeForProfessor(
        getActorProfessor(req),
        'collaborators.registration'
      )) ?? undefined
    );

    return sendSuccess(res, null, 'Professor reativado com sucesso');
  } catch (error: any) {
    return sendScopedError(res, error, 'Erro ao reativar professor');
  }
});

/**
 * POST /api/v1/professores/:id/reset-password
 * Reset rápido de senha do professor
 */
router.post('/:id/reset-password', screenAccessMiddleware('collaborators.registration'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;

    const tempPassword = await professorService.resetPassword(
      contractId,
      id,
      (await getEffectiveDataScopeForProfessor(
        getActorProfessor(req),
        'collaborators.registration'
      )) ?? undefined
    );

    return sendSuccess(
      res,
      { tempPassword },
      'Senha temporária gerada com sucesso'
    );
  } catch (error: any) {
    return sendScopedError(res, error, 'Erro ao resetar senha');
  }
});

export default router;
