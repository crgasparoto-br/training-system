from pathlib import Path

ROOT = Path.cwd()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)

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
    '''      gc."publicTokenExpiresAt",
      gc."createdAt" AS "documentCreatedAt"
    FROM "CollaboratorContract" cc
    JOIN "Professor" p ON p."id" = cc."collaboratorId"
    LEFT JOIN "GeneratedContract" gc ON gc."id" = cc."contractId"''',
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
    '''    const patchJson = JSON.stringify(patch);
    await client.$executeRaw(Prisma.sql`
      UPDATE "CollaboratorContract"''',
    '''    const current = await client.collaboratorContract.findUnique({
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
      UPDATE "CollaboratorContract"''',
    "collaborator terminal guard",
)
text = text.replace(
    "    `);\n  },\n};",
    "    `);\n    return client.collaboratorContract.findUnique({ where: { contractId: documentId } });\n  },\n};",
)
path.write_text(text)

path = ROOT / "apps/api/src/modules/contracts/contract-pdf.service.ts"
path.write_text(path.read_text().replace("action: 'GENERATED_PDF' as never", "action: 'PDF_GENERATED'"))
