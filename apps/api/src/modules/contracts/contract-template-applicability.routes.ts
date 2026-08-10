import { Router, type Request, type Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { sendError, sendSuccess } from '@corrida/utils';
import { masterMiddleware } from '../auth/auth.middleware.js';
import { contractDocumentService } from './contract-document.service.js';
import {
  assertTemplateVariablesCompatible,
  contractVariableDefinitions,
  type ContractPartyType,
  type ContractTemplateApplicability,
} from './contract-variable-definitions.js';

const router: Router = Router();
const prisma = new PrismaClient();

const parseApplicability = (value: unknown): ContractTemplateApplicability => {
  const normalized = String(value || 'STUDENT').trim().toUpperCase();
  if (normalized === 'STUDENT' || normalized === 'COLLABORATOR' || normalized === 'BOTH') {
    return normalized;
  }
  throw new Error('Aplicabilidade do modelo inválida');
};

const companyContractId = (req: Request) => {
  const value = (req as any).user?.contractId;
  if (!value) throw new Error('Contrato autenticado não encontrado');
  return String(value);
};

async function applicabilityFor(templateId: string, contractId: string) {
  const rows = await prisma.$queryRaw<Array<{ applicability: ContractTemplateApplicability }>>(Prisma.sql`
    SELECT "applicability"::text AS "applicability"
    FROM "ContractTemplate"
    WHERE "id" = ${templateId} AND "contractId" = ${contractId}
    LIMIT 1
  `);
  if (!rows[0]) throw new Error('Modelo de contrato não encontrado');
  return rows[0].applicability;
}

async function assignApplicability(
  templateId: string,
  contractId: string,
  applicability: ContractTemplateApplicability
) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "ContractTemplate"
    SET "applicability" = ${applicability}::"ContractTemplateApplicability",
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${templateId} AND "contractId" = ${contractId}
  `);
}

const htmlPartsFrom = (template: any) => [
  template?.headerHtml,
  template?.footerHtml,
  ...(Array.isArray(template?.clauses) ? template.clauses.map((clause: any) => clause.bodyHtml) : []),
];

async function loadTemplate(contractId: string, templateId: string) {
  const template = (await contractDocumentService.listTemplates(contractId))
    .find((item: any) => item.id === templateId);
  if (!template) throw new Error('Modelo de contrato não encontrado');
  return { ...template, applicability: await applicabilityFor(templateId, contractId) };
}

const withApplicability = async (contractId: string, templates: any[]) => {
  const rows = await prisma.$queryRaw<Array<{ id: string; applicability: ContractTemplateApplicability }>>(Prisma.sql`
    SELECT "id", "applicability"::text AS "applicability"
    FROM "ContractTemplate"
    WHERE "contractId" = ${contractId}
  `);
  const map = new Map(rows.map((row) => [row.id, row.applicability]));
  return templates.map((template) => ({
    ...template,
    applicability: map.get(template.id) || 'STUDENT',
  }));
};

router.get('/variables', (req: Request, res: Response) => {
  try {
    const applicability = req.query.applicability
      ? parseApplicability(req.query.applicability)
      : null;
    const partyType = String(req.query.partyType || '').toUpperCase() as ContractPartyType;
    const filtered = contractVariableDefinitions.filter((variable) => {
      if (applicability === 'BOTH') return variable.applicability.length === 2;
      if (applicability === 'STUDENT' || applicability === 'COLLABORATOR') {
        return variable.applicability.includes(applicability);
      }
      if (partyType === 'STUDENT' || partyType === 'COLLABORATOR') {
        return variable.applicability.includes(partyType);
      }
      return true;
    });
    return sendSuccess(res, filtered, 'Variáveis recuperadas com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao listar variáveis', 400);
  }
});

router.get('/templates', async (req: Request, res: Response) => {
  try {
    const contractId = companyContractId(req);
    let templates = await withApplicability(
      contractId,
      await contractDocumentService.listTemplates(contractId)
    );
    const partyType = String(req.query.partyType || '').toUpperCase();
    if (partyType === 'STUDENT' || partyType === 'COLLABORATOR') {
      templates = templates.filter((template) =>
        template.applicability === 'BOTH' || template.applicability === partyType
      );
    }
    const applicability = req.query.applicability
      ? parseApplicability(req.query.applicability)
      : null;
    if (applicability) {
      templates = templates.filter((template) => template.applicability === applicability);
    }
    return sendSuccess(res, templates, 'Modelos recuperados com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao listar modelos', 500);
  }
});

router.post('/templates', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const contractId = companyContractId(req);
      const applicability = parseApplicability(req.body?.applicability);
      assertTemplateVariablesCompatible(applicability, htmlPartsFrom(req.body));
      const created = await contractDocumentService.createTemplate(
        contractId,
        req.body,
        {
          userId: req.user?.userId,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') || undefined,
        }
      );
      await assignApplicability(created.id, contractId, applicability);
      return sendSuccess(res, { ...created, applicability }, 'Modelo criado com sucesso', 201);
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao criar modelo', 400);
    }
  });
});

router.put('/templates/:templateId', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const contractId = companyContractId(req);
      const current = await loadTemplate(contractId, req.params.templateId);
      const applicability = req.body?.applicability
        ? parseApplicability(req.body.applicability)
        : current.applicability;
      const proposed = {
        ...current,
        ...req.body,
        clauses: req.body?.clauses ?? current.clauses,
      };
      assertTemplateVariablesCompatible(applicability, htmlPartsFrom(proposed));
      const updated = await contractDocumentService.updateTemplate(
        contractId,
        req.params.templateId,
        req.body
      );
      await assignApplicability(updated.id, contractId, applicability);
      return sendSuccess(res, { ...updated, applicability }, 'Modelo atualizado com sucesso');
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao atualizar modelo', 400);
    }
  });
});

router.post('/templates/:templateId/status', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const contractId = companyContractId(req);
      const current = await loadTemplate(contractId, req.params.templateId);
      if (req.body?.status === 'ACTIVE') {
        assertTemplateVariablesCompatible(current.applicability, htmlPartsFrom(current));
      }
      const updated = await contractDocumentService.setTemplateStatus(
        contractId,
        req.params.templateId,
        req.body?.status
      );
      return sendSuccess(res, { ...updated, applicability: current.applicability }, 'Status atualizado com sucesso');
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao atualizar status', 400);
    }
  });
});

router.post('/templates/:templateId/duplicate', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const contractId = companyContractId(req);
      const applicability = await applicabilityFor(req.params.templateId, contractId);
      const duplicated = await contractDocumentService.duplicateTemplate(contractId, req.params.templateId);
      await assignApplicability(duplicated.id, contractId, applicability);
      return sendSuccess(res, { ...duplicated, applicability }, 'Modelo duplicado com sucesso');
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao duplicar modelo', 400);
    }
  });
});

router.post('/templates/:templateId/clauses', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const contractId = companyContractId(req);
      const current = await loadTemplate(contractId, req.params.templateId);
      assertTemplateVariablesCompatible(
        current.applicability,
        htmlPartsFrom({ ...current, clauses: [...current.clauses, req.body] })
      );
      const clause = await contractDocumentService.createClause(contractId, req.params.templateId, req.body);
      return sendSuccess(res, clause, 'Cláusula criada com sucesso', 201);
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao criar cláusula', 400);
    }
  });
});

router.put('/templates/:templateId/clauses/:clauseId', async (req: Request, res: Response) => {
  masterMiddleware(req, res, async () => {
    try {
      const contractId = companyContractId(req);
      const current = await loadTemplate(contractId, req.params.templateId);
      const clauses = current.clauses.map((clause: any) =>
        clause.id === req.params.clauseId ? { ...clause, ...req.body } : clause
      );
      assertTemplateVariablesCompatible(current.applicability, htmlPartsFrom({ ...current, clauses }));
      const clause = await contractDocumentService.updateClause(
        contractId,
        req.params.templateId,
        req.params.clauseId,
        req.body
      );
      return sendSuccess(res, clause, 'Cláusula atualizada com sucesso');
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao atualizar cláusula', 400);
    }
  });
});

export default router;
