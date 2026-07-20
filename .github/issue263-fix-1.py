from pathlib import Path
import re

ROOT = Path.cwd()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


def patch_schema(path: Path) -> None:
    text = path.read_text()
    if "currentCollaboratorContractId" not in text:
        text = replace_once(
            text,
            "  currentStatus                   String?\n",
            "  currentStatus                   String?\n  currentCollaboratorContractId   String?                    @unique\n",
            f"{path}: current pointer",
        )
    if "generatedCollaboratorContracts" not in text:
        text = replace_once(
            text,
            "  generatedContracts              Contract[]\n",
            "  generatedContracts              Contract[]                  @relation(\"ContractResponsibleProfessor\")\n"
            "  generatedCollaboratorContracts  Contract[]                  @relation(\"ContractCollaborator\")\n"
            "  collaboratorContracts           CollaboratorContract[]      @relation(\"CollaboratorContracts\")\n"
            "  currentCollaboratorContract     CollaboratorContract?       @relation(\"CurrentCollaboratorContract\", fields: [currentCollaboratorContractId], references: [id], onDelete: SetNull)\n",
            f"{path}: professor relations",
        )
    if "@@index([currentCollaboratorContractId])" not in text:
        text = replace_once(
            text,
            "  @@index([responsibleManagerId])\n",
            "  @@index([responsibleManagerId])\n  @@index([currentCollaboratorContractId])\n",
            f"{path}: pointer index",
        )
    if "applicability ContractTemplateApplicability" not in text:
        text = replace_once(
            text,
            "  status      ContractTemplateStatus   @default(DRAFT)\n",
            "  status      ContractTemplateStatus   @default(DRAFT)\n  applicability ContractTemplateApplicability @default(STUDENT)\n",
            f"{path}: template applicability",
        )
    if "collaboratorId       String?" not in text:
        text = replace_once(
            text,
            "  alunoId              String\n",
            "  alunoId              String?\n  collaboratorId       String?\n  partyType            ContractPartyType @default(STUDENT)\n  origin               ContractLinkOrigin @default(ELECTRONIC)\n",
            f"{path}: typed contract fields",
        )
    if '@relation("ContractCollaborator"' not in text:
        text = replace_once(
            text,
            "  aluno                Aluno               @relation(fields: [alunoId], references: [id], onDelete: Cascade)\n",
            "  aluno                Aluno?              @relation(fields: [alunoId], references: [id], onDelete: Cascade)\n"
            "  collaborator         Professor?          @relation(\"ContractCollaborator\", fields: [collaboratorId], references: [id], onDelete: Restrict)\n",
            f"{path}: collaborator relation",
        )
    if '@relation("ContractResponsibleProfessor"' not in text:
        text = replace_once(
            text,
            "  professor            Professor?          @relation(fields: [professorId], references: [id], onDelete: SetNull)\n",
            "  professor            Professor?          @relation(\"ContractResponsibleProfessor\", fields: [professorId], references: [id], onDelete: SetNull)\n",
            f"{path}: responsible relation",
        )
    if "collaboratorContract CollaboratorContract?" not in text:
        text = replace_once(
            text,
            "  studentContracts     StudentContract[]\n",
            "  studentContracts     StudentContract[]\n  collaboratorContract CollaboratorContract?\n",
            f"{path}: generated document link",
        )
    start = text.index("model Contract {")
    end = text.index("model ContractSignature {")
    block = text[start:end]
    if "@@index([collaboratorId])" not in block:
        block = replace_once(
            block,
            "  @@index([alunoId])\n",
            "  @@index([alunoId])\n  @@index([collaboratorId])\n  @@index([partyType])\n",
            f"{path}: typed indexes",
        )
        text = text[:start] + block + text[end:]
    if "model CollaboratorContract {" not in text:
        model = '''model CollaboratorContract {
  id                 String                     @id @default(cuid())
  collaboratorId     String
  contractId         String?                    @unique
  status             CollaboratorContractStatus @default(draft)
  origin             ContractLinkOrigin         @default(ELECTRONIC)
  startDate          DateTime?
  endDate            DateTime?
  signedAt           DateTime?
  canceledAt         DateTime?
  cancellationReason String?
  notes              String?
  legacyDocumentUrl  String?
  legacySourceKey    String?                    @unique
  createdAt          DateTime                   @default(now())
  updatedAt          DateTime                   @updatedAt

  collaborator        Professor  @relation("CollaboratorContracts", fields: [collaboratorId], references: [id], onDelete: Restrict)
  contract            Contract?  @relation(fields: [contractId], references: [id], onDelete: Cascade)
  currentForProfessor Professor? @relation("CurrentCollaboratorContract")

  @@index([collaboratorId])
  @@index([status])
  @@index([startDate])
  @@index([endDate])
}

'''
        text = replace_once(text, "model ContractSignature {", model + "model ContractSignature {", f"{path}: collaborator model")
    if "enum ContractPartyType {" not in text:
        enums = '''enum ContractPartyType {
  STUDENT
  COLLABORATOR
}

enum ContractTemplateApplicability {
  STUDENT
  COLLABORATOR
  BOTH
}

enum ContractLinkOrigin {
  ELECTRONIC
  LEGACY_PDF
  LEGACY_DECLARATION
}

enum CollaboratorContractStatus {
  draft
  pending_signature
  active
  expired
  canceled
  terminated
  legacy
}

'''
        text = replace_once(text, "enum ContractStatus {", enums + "enum ContractStatus {", f"{path}: enums")
    path.write_text(text)


for relative in ("apps/api/prisma/schema.prisma", "prisma/schema.prisma"):
    patch_schema(ROOT / relative)

if (ROOT / "apps/api/prisma/schema.prisma").read_text() != (ROOT / "prisma/schema.prisma").read_text():
    raise RuntimeError("Canonical Prisma schemas differ")

validation_path = ROOT / "packages/utils/validations.ts"
validation = validation_path.read_text()
validation = re.sub(r"^\s*hasSignedContract:\s*z\.boolean\(\)\.optional\(\),\n", "", validation, flags=re.M)
validation = re.sub(r"^\s*signedContractDocumentUrl:\s*optional(?:Nullable)?UrlSchema,\n", "", validation, flags=re.M)
validation = re.sub(r"^\s*signedContractDocumentUrl:\s*optionalString\(500\),\n", "", validation, flags=re.M)
validation = re.sub(
    r"\}\)\.superRefine\(\(data, ctx\) => \{\n\s*if \(data\.hasSignedContract && !data\.signedContractDocumentUrl\) \{\n\s*ctx\.addIssue\(\{\n\s*code: z\.ZodIssueCode\.custom,\n\s*path: \['signedContractDocumentUrl'\],\n\s*message: 'Envie o PDF do contrato assinado',?\n\s*\}\);\n\s*\}\n\}\);",
    "});",
    validation,
)
validation_path.write_text(validation)

access_path = ROOT / "packages/types/access-control.ts"
access = access_path.read_text().replace(
    "label: 'Acao: Upload de contrato assinado do colaborador'",
    "label: 'Acao: Gerenciar contrato do colaborador'",
)
access_path.write_text(access)
