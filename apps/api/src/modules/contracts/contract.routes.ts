import { Router, Request, Response } from 'express';
import { contractService } from './contract.service.js';
import {
  adipometryGovernanceService,
  AdipometryGovernanceError,
} from '../adipometry/adipometry-governance.service.js';
import { cloneContractData } from './contract-data.service.js';
import { contractDocumentService } from './contract-document.service.js';
import { authMiddleware, professorMiddleware, masterMiddleware } from '../auth/auth.middleware.js';
import { sendSuccess, sendError } from '@corrida/utils';
import { PrismaClient, type ContractStatus } from '@prisma/client';
import {
  blockAccessMiddleware,
  screenAccessMiddleware,
} from '../access-control/access-control.middleware.js';
import multer from 'multer';
import path from 'path';
import { savePublicAsset } from '../../common/supabase-storage.js';

const router: Router = Router();
const prisma = new PrismaClient();

const normalizeDocument = (document: string) => document.replace(/\D/g, '');
const trimOptional = (value: unknown) =>
  typeof value === 'string' ? value.trim() || null : null;

const logoUpload = multer({
  storage: multer.memoryStorage(),
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

const actorFromRequest = (req: Request) => ({
  userId: req.user?.userId,
  ipAddress: req.ip,
  userAgent: req.get('user-agent') || undefined,
});

const sendAdipometryGovernanceError = (res: Response, error: unknown) => {
  if (error instanceof AdipometryGovernanceError) {
    return sendError(res, error.message, error.statusCode);
  }
  console.error('Erro na governança clínica da adipometria:', error);
  return sendError(res, 'Erro ao processar a responsabilidade técnica da adipometria', 500);
};

router.get('/public/:token', async (req: Request, res: Response) => {
  try {
    const contract = await contractDocumentService.openPublic(req.params.token, actorFromRequest(req));
    return sendSuccess(res, {
      id: contract.id,
      title: contract.title,
      status: contract.status,
      renderedHtml: contract.renderedHtml,
      signedAt: contract.signedAt,
    }, 'Contrato recuperado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Contrato não encontrado', 404);
  }
});

router.post('/public/:token/sign', async (req: Request, res: Response) => {
  try {
    const signature = await contractDocumentService.signPublic(req.params.token, req.body, actorFromRequest(req));
    return sendSuccess(res, signature, 'Contrato assinado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao assinar contrato', 400);
  }
});

router.use(authMiddleware);
router.use(professorMiddleware);

router.get(
  '/available-for-student',
  screenAccessMiddleware(['students.contracts.manage', 'students.contracts.renew']),
  async (req: Request, res: Response) => {
    try {
      const companyContractId = (req as any).user.contractId as string | undefined;

      if (!companyContractId) {
        return sendError(res, 'Contrato não encontrado', 404);
      }

      const serviceId = typeof req.query.serviceId === 'string' ? req.query.serviceId : undefined;
      const alunoId = typeof req.query.alunoId === 'string' ? req.query.alunoId : undefined;
      const onlyUnlinked = req.query.onlyUnlinked !== 'false';

      const parsedStatuses =
        typeof req.query.status === 'string' && req.query.status.trim().length > 0
          ? req.query.status
              .split(',')
              .map((item) => item.trim().toUpperCase())
              .filter((item): item is ContractStatus =>
                ['DRAFT', 'GENERATED', 'SENT', 'VIEWED', 'SIGNED', 'CANCELLED', 'EXPIRED'].includes(item)
              )
          : [];

      const statusFilter: ContractStatus[] =
        parsedStatuses.length > 0 ? parsedStatuses : ['GENERATED', 'SENT', 'VIEWED', 'SIGNED'];

      const contracts = await prisma.contract.findMany({
        where: {
          companyContractId,
          status: {
            in: statusFilter,
          },
          ...(serviceId ? { serviceId } : {}),
          ...(alunoId ? { alunoId } : {}),
          ...(onlyUnlinked
            ? {
                studentContracts: {
                  none: {},
                },
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          status: true,
          alunoId: true,
          serviceId: true,
          createdAt: true,
          signedAt: true,
          cancelledAt: true,
          service: {
            select: {
              id: true,
              name: true,
              code: true,
              description: true,
              monthlyPrice: true,
              isActive: true,
            },
          },
          studentContracts: {
            select: {
              id: true,
              alunoId: true,
              status: true,
            },
            take: 1,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return sendSuccess(res, contracts, 'Contratos disponíveis para vínculo recuperados com sucesso');
    } catch (error: any) {
      console.error('Erro ao listar contratos disponíveis para aluno:', error);
      return sendError(res, error?.message || 'Erro ao listar contratos disponíveis', 500);
    }
  }
);

router.get('/variables', async (_req: Request, res: Response) => {
  return sendSuccess(res, contractDocumentService.listVariables(), 'Variáveis recuperadas com sucesso');
});

router.get('/templates', async (req: Request, res: Response) => {
  try {
    const templates = await contractDocumentService.listTemplates((req as any).user.contractId);
    return sendSuccess(res, templates, 'Modelos recuperados com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao listar modelos', 500);
  }
});

router.post('/templates', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const template = await contractDocumentService.createTemplate((req as any).user.contractId, req.body, actorFromRequest(req));
      return sendSuccess(res, template, 'Modelo criado com sucesso', 201);
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao criar modelo', 400);
    }
  });
});

router.put('/templates/:templateId', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const template = await contractDocumentService.updateTemplate((req as any).user.contractId, req.params.templateId, req.body);
      return sendSuccess(res, template, 'Modelo atualizado com sucesso');
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao atualizar modelo', 400);
    }
  });
});

router.post('/templates/:templateId/duplicate', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const template = await contractDocumentService.duplicateTemplate((req as any).user.contractId, req.params.templateId);
      return sendSuccess(res, template, 'Modelo duplicado com sucesso');
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao duplicar modelo', 400);
    }
  });
});

router.post('/templates/:templateId/status', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const template = await contractDocumentService.setTemplateStatus((req as any).user.contractId, req.params.templateId, req.body.status);
      return sendSuccess(res, template, 'Status atualizado com sucesso');
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao atualizar status', 400);
    }
  });
});

router.get('/templates/:templateId/clauses', async (req: Request, res: Response) => {
  try {
    const clauses = await contractDocumentService.listClauses((req as any).user.contractId, req.params.templateId);
    return sendSuccess(res, clauses, 'Cláusulas recuperadas com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao listar cláusulas', 400);
  }
});

router.post('/templates/:templateId/clauses', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const clause = await contractDocumentService.createClause((req as any).user.contractId, req.params.templateId, req.body);
      return sendSuccess(res, clause, 'Cláusula criada com sucesso', 201);
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao criar cláusula', 400);
    }
  });
});

router.put('/templates/:templateId/clauses/:clauseId', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const clause = await contractDocumentService.updateClause((req as any).user.contractId, req.params.templateId, req.params.clauseId, req.body);
      return sendSuccess(res, clause, 'Cláusula atualizada com sucesso');
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao atualizar cláusula', 400);
    }
  });
});

router.delete('/templates/:templateId/clauses/:clauseId', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      await contractDocumentService.removeClause((req as any).user.contractId, req.params.templateId, req.params.clauseId);
      return sendSuccess(res, null, 'Cláusula removida com sucesso');
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao remover cláusula', 400);
    }
  });
});

router.post('/templates/:templateId/clauses/reorder', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const clauses = await contractDocumentService.reorderClauses((req as any).user.contractId, req.params.templateId, req.body.clauseIds || []);
      return sendSuccess(res, clauses, 'Cláusulas reordenadas com sucesso');
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao reordenar cláusulas', 400);
    }
  });
});

router.post('/preview', async (req: Request, res: Response) => {
  try {
    const preview = await contractDocumentService.preview((req as any).user.contractId, req.body);
    return sendSuccess(res, preview, 'Prévia gerada com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao gerar prévia', 400);
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const contract = await contractDocumentService.generate((req as any).user.contractId, req.body, actorFromRequest(req));
    return sendSuccess(res, contract, 'Contrato gerado com sucesso', 201);
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao gerar contrato', 400);
  }
});

router.get('/alunos/:alunoId', async (req: Request, res: Response) => {
  try {
    const contracts = await contractDocumentService.listByAluno((req as any).user.contractId, req.params.alunoId);
    return sendSuccess(res, contracts, 'Contratos do aluno recuperados com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao listar contratos', 500);
  }
});

router.get('/documents/:contractDocumentId', async (req: Request, res: Response) => {
  try {
    const contract = await contractDocumentService.getForContract((req as any).user.contractId, req.params.contractDocumentId);
    return sendSuccess(res, contract, 'Contrato recuperado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Contrato não encontrado', 404);
  }
});

router.post('/documents/:contractDocumentId/pdf', async (req: Request, res: Response) => {
  try {
    const contract = await contractDocumentService.generatePdf((req as any).user.contractId, req.params.contractDocumentId, actorFromRequest(req));
    return sendSuccess(res, contract, 'PDF gerado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao gerar PDF', 500);
  }
});

router.post('/documents/:contractDocumentId/send', async (req: Request, res: Response) => {
  try {
    const result = await contractDocumentService.sendForSignature((req as any).user.contractId, req.params.contractDocumentId, actorFromRequest(req));
    return sendSuccess(res, result, 'Contrato enviado para assinatura');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao enviar contrato', 400);
  }
});

router.post('/documents/:contractDocumentId/cancel', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const contract = await contractDocumentService.cancel((req as any).user.contractId, req.params.contractDocumentId, actorFromRequest(req));
      return sendSuccess(res, contract, 'Contrato cancelado com sucesso');
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao cancelar contrato', 400);
    }
  });
});

router.get('/documents/:contractDocumentId/download', async (req: Request, res: Response) => {
  try {
    const contract = await contractDocumentService.getForContract((req as any).user.contractId, req.params.contractDocumentId);
    if (!contract.pdfPath) {
      return sendError(res, 'PDF ainda não foi gerado', 404);
    }
    return res.download(path.resolve(process.cwd(), contract.pdfPath.replace(/^\/+/, '')));
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao baixar PDF', 404);
  }
});

router.get('/documents/:contractDocumentId/audit', async (req: Request, res: Response) => {
  try {
    const logs = await contractDocumentService.auditLogs((req as any).user.contractId, req.params.contractDocumentId);
    return sendSuccess(res, logs, 'Auditoria recuperada com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao consultar auditoria', 400);
  }
});

/**
 * GET /api/v1/contracts/me
 * Obter contrato do professor master
 */
router.get(
  '/adipometry-governance',
  screenAccessMiddleware('settings.contract'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const governance = await adipometryGovernanceService.getGovernance(
        user.contractId,
        user.professorId,
        user.professorRole === 'master'
      );
      return sendSuccess(res, governance, 'Governança clínica da adipometria recuperada com sucesso');
    } catch (error) {
      return sendAdipometryGovernanceError(res, error);
    }
  }
);

router.put(
  '/adipometry-governance/responsible',
  screenAccessMiddleware('settings.contract'),
  async (req: Request, res: Response) => {
    masterMiddleware(req, res, async () => {
      try {
        const user = (req as any).user;
        const governance = await adipometryGovernanceService.designate(
          user.contractId,
          user.userId,
          user.professorId,
          req.body
        );
        return sendSuccess(res, governance, 'Responsável técnico atualizado com sucesso');
      } catch (error) {
        return sendAdipometryGovernanceError(res, error);
      }
    });
  }
);

router.post(
  '/adipometry-governance/protocols/:code/:version/approve',
  screenAccessMiddleware('settings.contract'),
  blockAccessMiddleware('settings.contract.adipometryProtocolApproval'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const governance = await adipometryGovernanceService.approve(
        user.contractId,
        user.userId,
        user.professorId,
        req.params.code,
        Number(req.params.version),
        req.body,
        user.professorRole === 'master'
      );
      return sendSuccess(res, governance, 'Versão clínica aprovada com sucesso');
    } catch (error) {
      return sendAdipometryGovernanceError(res, error);
    }
  }
);

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

        const asset = await savePublicAsset({
          folder: 'contracts/logos',
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
        });

        return sendSuccess(res, { url: asset.url }, 'Logotipo enviado com sucesso');
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

    let resolvedSourceId = sourceContractId;

    if (!resolvedSourceId) {
      const firstSource = await contractService.getFirstSourceContract(
        contractId,
        process.env.DEFAULT_CONTRACT_ID
      );
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

