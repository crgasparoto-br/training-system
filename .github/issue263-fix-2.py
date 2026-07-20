from pathlib import Path
import re

ROOT = Path.cwd()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)

path = ROOT / "apps/api/src/modules/student-contracts/student-contract.service.ts"
text = path.read_text()
text = replace_once(
    text,
    """    if (!existing) {
      return null;
    }

    const updated = await client.studentContract.update({""",
    """    if (!existing) {
      return null;
    }

    const terminalStatuses: StudentContractStatus[] = ['canceled', 'expired', 'terminated'];
    if (terminalStatuses.includes(existing.status) && existing.status !== status) {
      return existing;
    }

    const updated = await client.studentContract.update({""",
    "student terminal guard",
)
path.write_text(text)

path = ROOT / "apps/api/src/modules/contracts/contract-authoritative-generation.service.ts"
text = path.read_text()
text = text.replace(
    "import { PrismaClient, Prisma, type Prisma as PrismaTypes } from '@prisma/client';",
    "import { PrismaClient, type Prisma, type Prisma as PrismaTypes } from '@prisma/client';",
)
text = re.sub(r"\nasync function loadApplicability\(client: DbClient, templateId: string\) \{.*?\n\}\n", "\n", text, flags=re.S)
text = text.replace(
    "  const [template, applicability, company, aluno] = await Promise.all([",
    "  const [template, company, aluno] = await Promise.all([",
)
text = text.replace("    loadApplicability(client, templateId),\n", "")
text = text.replace(
    "  assertTemplateSupportsParty(applicability, 'STUDENT');",
    "  const applicability: ContractTemplateApplicability = template.applicability ?? 'STUDENT';\n  assertTemplateSupportsParty(applicability, 'STUDENT');",
)
path.write_text(text)

path = ROOT / "apps/api/src/modules/contracts/collaborator-contract.routes.ts"
text = path.read_text()
text = text.replace(
    "import crypto from 'crypto';\n",
    "import crypto from 'crypto';\nimport fs from 'fs/promises';\nimport path from 'path';\n",
)
text = text.replace(
    "import {\n  getMostPermissiveDataScopeForProfessor,\n  screenAccessMiddleware,\n} from '../access-control/index.js';\nimport { blockAccessMiddleware } from '../access-control/access-control.middleware.js';",
    "import { getMostPermissiveDataScopeForProfessor } from '../access-control/index.js';\nimport {\n  blockAccessMiddleware,\n  screenAccessMiddleware,\n} from '../access-control/access-control.middleware.js';",
)
marker = """router.post(
  '/collaborators/:collaboratorId/documents/:documentId/pdf',"""
insert = """router.get(
  '/collaborators/:collaboratorId/documents/:documentId',
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorAccess(req, req.params.collaboratorId);
      await collaboratorContractService.assertDocumentBelongsToCollaborator(
        companyContractId,
        req.params.collaboratorId,
        req.params.documentId
      );
      const document = await contractRecordRepository.findByIdForCompany(
        req.params.documentId,
        companyContractId
      );
      if (!document) throw new Error('Contrato do colaborador não encontrado');
      return sendSuccess(res, document, 'Documento contratual recuperado com sucesso');
    } catch (error) {
      return handleError(res, error, 'Erro ao consultar documento contratual');
    }
  }
);

router.get(
  '/collaborators/:collaboratorId/documents/:documentId/pdf',
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorAccess(req, req.params.collaboratorId);
      await collaboratorContractService.assertDocumentBelongsToCollaborator(
        companyContractId,
        req.params.collaboratorId,
        req.params.documentId
      );
      const document = await contractRecordRepository.findByIdForCompany(
        req.params.documentId,
        companyContractId
      );
      if (!document?.pdfPath) throw new Error('PDF do contrato não encontrado');

      const storageRoot = path.resolve(process.cwd(), 'storage', 'contracts');
      const resolvedPdfPath = path.resolve(document.pdfPath);
      if (!resolvedPdfPath.startsWith(`${storageRoot}${path.sep}`)) {
        throw new Error('PDF do contrato não encontrado');
      }
      const pdf = await fs.readFile(resolvedPdfPath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=contrato-${document.id}.pdf`);
      return res.status(200).send(pdf);
    } catch (error) {
      return handleError(res, error, 'Erro ao consultar PDF do contrato');
    }
  }
);

"""
text = replace_once(text, marker, insert + marker, "collaborator document routes")
path.write_text(text)

path = ROOT / "apps/api/src/modules/contracts/collaborator-contract.service.ts"
text = path.read_text()
text = replace_once(
    text,
    """  publicTokenExpiresAt: Date | null;
  documentCreatedAt: Date | null;
};""",
    """  publicTokenExpiresAt: Date | null;
  documentCreatedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
};""",
    "collaborator view rejection fields",
)
text = replace_once(
    text,
    """      gc."publicTokenExpiresAt",
      gc."createdAt" AS "documentCreatedAt"
    FROM "CollaboratorContract" cc
    JOIN "Professor" p ON p."id" = cc."collaboratorId"
    LEFT JOIN "GeneratedContract" gc ON gc."id" = cc."contractId"""",
    """      gc."publicTokenExpiresAt",
      gc."createdAt" AS "documentCreatedAt",
      rejection."rejectedAt",
      rejection."rejectionReason"
    FROM "CollaboratorContract" cc
    JOIN "Professor" p ON p."id" = cc."collaboratorId"
    LEFT JOIN "GeneratedContract" gc ON gc."id" = cc."contractId"
    LEFT JOIN LATERAL (
      SELECT
        NULLIF(log."details" ->> 'rejectedAt', '')::timestamptz AS "rejectedAt",
        NULLIF(log."details" ->> 'rejectionReason', '') AS "rejectionReason"
      FROM "ContractAuditLog" log
      WHERE log."contractId" = gc."id"
        AND log."action" = 'UPDATED'::"ContractAuditAction"
        AND log."details" ->> 'kind' = 'STUDENT_REJECTION'
      ORDER BY log."createdAt" DESC
      LIMIT 1
    ) rejection ON TRUE""",
    "collaborator rejection query",
)
text = replace_once(
    text,
    """    const patchJson = JSON.stringify(patch);
    await client.$executeRaw(Prisma.sql`
      UPDATE "CollaboratorContract"""",
    """    const current = await client.collaboratorContract.findUnique({
      where: { contractId: documentId },
      select: { status: true },
    });
    if (!current) return null;
    const terminalStatuses = ['canceled', 'expired', 'terminated', 'legacy'] as const;
    if (terminalStatuses.includes(current.status as (typeof terminalStatuses)[number]) && current.status !== status) {
      return current;
    }

    const patchJson = JSON.stringify(patch);
    await client.$executeRaw(Prisma.sql`
      UPDATE "CollaboratorContract"""",
    "collaborator terminal guard",
)
text = text.replace(
    "    `);\n  },\n};",
    "    `);\n    return client.collaboratorContract.findUnique({ where: { contractId: documentId } });\n  },\n};",
)
path.write_text(text)

path = ROOT / "apps/api/src/modules/contracts/contract-pdf.service.ts"
path.write_text(path.read_text().replace("action: 'GENERATED_PDF' as never", "action: 'PDF_GENERATED'"))
