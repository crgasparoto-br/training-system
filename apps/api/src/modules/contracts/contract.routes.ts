import { Router, Request, Response } from 'express';
import { contractService } from './contract.service.js';
import { cloneContractData } from './contract-data.service.js';
import { authMiddleware, professorMiddleware, masterMiddleware } from '../auth/auth.middleware.js';
import { sendSuccess, sendError } from '@corrida/utils';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router: Router = Router();
const logoUploadRoot = path.resolve(process.cwd(), 'uploads', 'contracts', 'logos');

router.use(authMiddleware);
router.use(professorMiddleware);

const normalizeDocument = (document: string) => document.replace(/\D/g, '');
const trimOptional = (value: unknown) =>
  typeof value === 'string' ? value.trim() || null : null;

const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(logoUploadRoot);
    cb(null, logoUploadRoot);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Envie uma imagem válida para o logotipo'));
    }

    cb(null, true);
  },
});

const uploadLogoFile = (req: Request, res: Response, next: any) => {
  logoUpload.single('file')(req, res, (err: any) => {
    if (err) {
      return sendError(res, err.message || 'Erro ao fazer upload do logotipo', 400);
    }

    next();
  });
};

/**
 * GET /api/v1/contracts/me
 * Obter contrato do professor master
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId;

    if (!contractId) {
      return sendError(res, 'Contrato nÃ£o encontrado', 404);
    }

    const contract = await contractService.getById(contractId);

    if (!contract) {
      return sendError(res, 'Contrato nÃ£o encontrado', 404);
    }

    return sendSuccess(res, contract, 'Contrato recuperado com sucesso');
  } catch (error) {
    console.error('Erro ao buscar contrato:', error);
    return sendError(res, 'Erro ao buscar contrato', 500);
  }
});

/**
 * PUT /api/v1/contracts/me
 * Atualizar contrato do professor master
 */
router.put('/me', async (req: Request, res: Response) => {
  try {
    masterMiddleware(req, res, async () => {
    const contractId = (req as any).user.contractId;

    if (!contractId) {
      return sendError(res, 'Contrato nÃ£o encontrado', 404);
    }

    const contract = await contractService.getById(contractId);

    if (!contract) {
      return sendError(res, 'Contrato nÃ£o encontrado', 404);
    }

    const {
      name,
      document,
      tradeName,
      cref,
      addressStreet,
      addressNumber,
      addressNeighborhood,
      addressCity,
      addressState,
      addressComplement,
      addressZipCode,
      logoUrl,
    } = req.body as {
      name?: string;
      document?: string;
      tradeName?: string | null;
      cref?: string | null;
      addressStreet?: string | null;
      addressNumber?: string | null;
      addressNeighborhood?: string | null;
      addressCity?: string | null;
      addressState?: string | null;
      addressComplement?: string | null;
      addressZipCode?: string | null;
      logoUrl?: string | null;
    };
    const updateData: {
      name?: string;
      document?: string;
      tradeName?: string | null;
      cref?: string | null;
      addressStreet?: string | null;
      addressNumber?: string | null;
      addressNeighborhood?: string | null;
      addressCity?: string | null;
      addressState?: string | null;
      addressComplement?: string | null;
      addressZipCode?: string | null;
      logoUrl?: string | null;
    } = {};

    if (typeof name === 'string' && name.trim().length > 0) {
      updateData.name = name.trim();
    }

    if (tradeName !== undefined) {
      updateData.tradeName = trimOptional(tradeName);
    }

    if (typeof document === 'string' && document.trim().length > 0) {
      const normalized = normalizeDocument(document);
      const expectedLength = contract.type === 'academy' ? 14 : 11;

      if (normalized.length !== expectedLength) {
        return sendError(
          res,
          contract.type === 'academy' ? 'CNPJ invÃ¡lido' : 'CPF invÃ¡lido',
          400
        );
      }

      updateData.document = normalized;
    }

    if (cref !== undefined) {
      updateData.cref = trimOptional(cref);
    }

    if (addressStreet !== undefined) {
      updateData.addressStreet = trimOptional(addressStreet);
    }

    if (addressNumber !== undefined) {
      updateData.addressNumber = trimOptional(addressNumber);
    }

    if (addressNeighborhood !== undefined) {
      updateData.addressNeighborhood = trimOptional(addressNeighborhood);
    }

    if (addressCity !== undefined) {
      updateData.addressCity = trimOptional(addressCity);
    }

    if (addressState !== undefined) {
      updateData.addressState = trimOptional(addressState);
    }

    if (addressComplement !== undefined) {
      updateData.addressComplement = trimOptional(addressComplement);
    }

    if (addressZipCode !== undefined) {
      updateData.addressZipCode = trimOptional(addressZipCode);
    }

    if (logoUrl !== undefined) {
      updateData.logoUrl = trimOptional(logoUrl);
    }

    const updated = await contractService.update(contractId, updateData);

    return sendSuccess(res, updated, 'Contrato atualizado com sucesso');
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return sendError(res, 'Documento jÃ¡ estÃ¡ registrado', 400);
    }
    console.error('Erro ao atualizar contrato:', error);
    return sendError(res, 'Erro ao atualizar contrato', 500);
  }
});

router.post('/logo-upload', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    uploadLogoFile(req, res, async () => {
      try {
        if (!req.file) {
          return sendError(res, 'Selecione uma imagem para upload', 400);
        }

        const host = req.get('host');
        if (!host) {
          return sendError(res, 'Não foi possível montar a URL do logotipo', 500);
        }

        const fileUrl = `${req.protocol}://${host}/uploads/contracts/logos/${req.file.filename}`;

        return sendSuccess(res, { url: fileUrl }, 'Logotipo enviado com sucesso');
      } catch (error: any) {
        return sendError(res, error.message || 'Erro ao enviar logotipo', 400);
      }
    });
  });
});

/**
 * POST /api/v1/contracts/clone-data
 * Clonar parÃ¢metros e exercÃ­cios para o contrato atual
 */
router.post('/clone-data', async (req: Request, res: Response) => {
  try {
    masterMiddleware(req, res, async () => {
    const contractId = (req as any).user.contractId as string | undefined;
    const professorId = (req as any).user.professorId as string | undefined;

    if (!contractId) {
      return sendError(res, 'Contrato nÃ£o encontrado', 404);
    }

    const {
      sourceContractId,
      copyParameters = true,
      copyExercises = true,
      copyAssessmentTypes = true,
    } = req.body as {
      sourceContractId?: string;
      copyParameters?: boolean;
      copyExercises?: boolean;
      copyAssessmentTypes?: boolean;
    };

    let resolvedSourceId = sourceContractId || process.env.DEFAULT_CONTRACT_ID;

    if (!resolvedSourceId) {
      const firstSource = await contractService.getFirstSourceContract(contractId);
      if (!firstSource) {
        return sendError(
          res,
          'Nenhum contrato de origem disponÃ­vel para clonagem',
          404
        );
      }
      resolvedSourceId = firstSource.id;
    }

    if (resolvedSourceId === contractId) {
      return sendError(
        res,
        'Contrato de origem deve ser diferente do contrato atual',
        400
      );
    }

    const result = await cloneContractData({
      sourceContractId: resolvedSourceId,
      targetContractId: contractId,
      professorId,
      copyParameters,
      copyExercises,
      copyAssessmentTypes,
    });

    return sendSuccess(res, result, 'Dados clonados com sucesso');
    });
  } catch (error: any) {
    console.error('Erro ao clonar dados:', error);
    return sendError(res, error.message || 'Erro ao clonar dados', 500);
  }
});

export default router;

