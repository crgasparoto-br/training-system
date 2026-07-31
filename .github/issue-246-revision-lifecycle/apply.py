from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(__file__).resolve().parent


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return content.replace(old, new, 1)


# 1. Add the additive, non-destructive lifecycle migration.
migration = "".join(
    part.read_text(encoding="utf-8")
    for part in sorted(SOURCE_DIR.glob("migration.part-*"))
)
if not migration.startswith("BEGIN;") or not migration.rstrip().endswith("COMMIT;"):
    raise RuntimeError("revision migration transport is incomplete")
write(
    "apps/api/prisma/migrations/20260731120000_complete_adipometry_revision_lifecycle/migration.sql",
    migration,
)

# 2. Keep Prisma's model aligned with the persistence authority. Partial unique
# indexes remain expressed only in SQL; regular lookup indexes are represented here.
schema_path = "apps/api/prisma/schema.prisma"
schema = read(schema_path)
schema = replace_once(
    schema,
    '  status                                   String                   @default("DRAFT")\n',
    '  status                                   String                   @default("DRAFT")\n'
    '  revisionStatus                           String                   @default("DRAFT")\n'
    '  rootAssessmentId                         String\n'
    '  revisionNumber                           Int                      @default(1)\n'
    '  previousRevisionId                       String?\n'
    '  correctionCategory                       String?\n'
    '  correctionStartedAt                      DateTime?\n'
    '  correctionCancelledAt                    DateTime?\n'
    '  correctionCancelledByUserId              String?\n'
    '  correctionCancellationReason             String?\n'
    '  protocolChangeConfirmedByUserId           String?\n'
    '  protocolChangeConfirmedAt                 DateTime?\n'
    '  voidedAt                                 DateTime?\n'
    '  voidedByUserId                           String?\n'
    '  voidReason                               String?\n'
    '  beforeSnapshot                           Json?\n'
    '  afterSnapshot                            Json?\n'
    '  changedFields                            Json?\n',
    "Prisma revision fields",
)
schema = replace_once(
    schema,
    '  correctsAssessmentId                     String?                  @unique(map: "AdipometryAssessment_correctsAssessmentId_key")\n',
    '  correctsAssessmentId                     String?\n',
    "Prisma correction cardinality",
)
schema = replace_once(
    schema,
    '  correctedThroughCorrects                 AdipometryAssessment?    @relation("AdipometryCorrects")\n',
    '  correctionRevisions                      AdipometryAssessment[]   @relation("AdipometryCorrects")\n',
    "Prisma correction inverse relation",
)
schema = replace_once(
    schema,
    '  @@unique([correctsAssessmentId, contractId, alunoId], map: "AdptAssess_corrects_contract_aluno_key")\n',
    '  @@index([correctsAssessmentId, contractId, alunoId], map: "AdptAssess_corrects_contract_aluno_idx")\n',
    "Prisma correction relation index",
)
schema = replace_once(
    schema,
    '  @@unique([contractId, alunoId, sequenceNumber], map: "AdipometryAssessment_contractId_alunoId_sequenceNumber_key")\n'
    '  @@unique([contractId, alunoId, code], map: "AdipometryAssessment_contractId_alunoId_code_key")\n',
    '  @@index([contractId, alunoId, sequenceNumber], map: "AdipometryAssessment_contractId_alunoId_sequenceNumber_idx")\n'
    '  @@index([contractId, alunoId, code], map: "AdipometryAssessment_contractId_alunoId_code_idx")\n'
    '  @@unique([rootAssessmentId, revisionNumber], map: "AdipometryAssessment_root_revision_key")\n'
    '  @@index([contractId, alunoId, rootAssessmentId, revisionNumber(sort: Desc)], map: "AdipometryAssessment_revision_history_idx")\n'
    '  @@index([contractId, revisionStatus, assessmentDate(sort: Desc)], map: "AdipometryAssessment_revision_status_idx")\n',
    "Prisma revision indexes",
)
write(schema_path, schema)

# 3. Publish explicit shared contracts for the business lifecycle while keeping
# the technical DRAFT/COMPLETED persistence state visible and unambiguous.
types_path = "packages/types/adipometry.ts"
types = read(types_path)
types = replace_once(
    types,
    "export type AdipometryAssessmentStatus = 'DRAFT' | 'COMPLETED';\n",
    "export type AdipometryAssessmentStatus =\n"
    "  | 'DRAFT'\n"
    "  | 'FINALIZED'\n"
    "  | 'SUPERSEDED'\n"
    "  | 'CANCELLED'\n"
    "  | 'VOIDED';\n"
    "export type AdipometryPersistenceStatus = 'DRAFT' | 'COMPLETED';\n"
    "export type AdipometryCorrectionCategory =\n"
    "  | 'MEASUREMENT_OR_TRANSCRIPTION_ERROR'\n"
    "  | 'PROTOCOL_SELECTION_ERROR'\n"
    "  | 'DEMOGRAPHIC_CONFIRMATION_ERROR'\n"
    "  | 'OTHER';\n",
    "shared lifecycle status",
)
types = replace_once(
    types,
    "  return `ADPT-${String(sequenceNumber).padStart(3, '0')}`;\n}\n",
    "  return `ADPT-${String(sequenceNumber).padStart(3, '0')}`;\n}\n\n"
    "export function formatAdipometryRevisionLabel(revisionNumber: number): string {\n"
    "  if (!Number.isSafeInteger(revisionNumber) || revisionNumber <= 0) {\n"
    "    throw new RangeError('Adipometry revision must be a positive safe integer');\n"
    "  }\n\n"
    "  return `R${revisionNumber}`;\n"
    "}\n",
    "revision label helper",
)
types = replace_once(
    types,
    "  status: AdipometryAssessmentStatus;\n",
    "  status: AdipometryPersistenceStatus;\n"
    "  revisionStatus: AdipometryAssessmentStatus;\n"
    "  rootAssessmentId: string;\n"
    "  revisionNumber: number;\n"
    "  previousRevisionId?: string;\n"
    "  correctionCategory?: AdipometryCorrectionCategory;\n"
    "  correctionStartedAt?: string;\n"
    "  correctionCancelledAt?: string;\n"
    "  correctionCancellationReason?: string;\n"
    "  voidedAt?: string;\n"
    "  voidReason?: string;\n",
    "summary revision fields",
)
types = replace_once(
    types,
    "  correctsAssessmentId?: string;\n  notes?: string;\n",
    "  correctsAssessmentId?: string;\n"
    "  beforeSnapshot?: Record<string, unknown>;\n"
    "  afterSnapshot?: Record<string, unknown>;\n"
    "  changedFields?: string[];\n"
    "  notes?: string;\n",
    "detail revision evidence",
)
old_correction = """export interface CorrectAdipometryAssessmentInput {
  reason: string;
  assessmentDate?: string;
  measurements: AdipometryMeasurements;
  protocolCode: string;
  protocolVersion: number;
  anthropometryAssessmentId?: string | null;
  notes?: string | null;
}
"""
new_correction = """export interface StartAdipometryCorrectionInput {
  currentAssessmentId: string;
  category: AdipometryCorrectionCategory;
  reason: string;
}

export interface CorrectAdipometryAssessmentInput extends StartAdipometryCorrectionInput {
  assessmentDate?: string;
  measurements: AdipometryMeasurements;
  protocolCode: string;
  protocolVersion: number;
  confirmProtocolChange?: boolean;
  anthropometryAssessmentId?: string | null;
  notes?: string | null;
}

export interface CancelAdipometryCorrectionInput {
  reason: string;
}

export interface VoidAdipometryAssessmentInput {
  reason: string;
}
"""
types = replace_once(types, old_correction, new_correction, "correction commands")
write(types_path, types)

# 4. Replace the legacy correction fixture with discriminating revision tests.
verification_path = "scripts/verify-adipometry-foundation-v2.sh"
verification = read(verification_path)
pattern = re.compile(
    r'cat > "\$TMP_DIR/correction\.sql" <<\'SQL\'\n.*?'
    r'echo "positive-control OK: immutable history and audited correction"\n',
    re.DOTALL,
)
revision_block = (SOURCE_DIR / "revision-test-block.txt").read_text(encoding="utf-8")
verification, count = pattern.subn(revision_block.rstrip() + "\n", verification, count=1)
if count != 1:
    raise RuntimeError(f"revision verification block: expected one match, found {count}")
verification = replace_once(
    verification,
    "Completed adipometry assessments cannot be physically deleted",
    "Historical adipometry revisions cannot be physically deleted",
    "revision deletion message",
)
write(verification_path, verification)

# The protocol validator must reject a forged expected result, proving that all
# vectors are actually executed rather than only counted.
governance_verify_path = "scripts/verify-adipometry-clinical-governance.sh"
governance_verify = read(governance_verify_path)
governance_anchor = """  IF v_definition IS NULL OR NOT \"isValidAdipometryContractProtocolDefinition\"(v_definition) THEN
    RAISE EXCEPTION 'canonical Guedes candidate is absent or invalid';
  END IF;
"""
governance_verify = replace_once(
    governance_verify,
    governance_anchor,
    governance_anchor
    + """
  IF \"isValidAdipometryContractProtocolDefinition\"(
    JSONB_SET(
      v_definition,
      '{testVectors,0,expectedResults,bodyFatPercentage}',
      '99'::JSONB
    )
  ) THEN
    RAISE EXCEPTION 'forged clinical vector was accepted';
  END IF;
""",
    "adversarial vector validation",
)
write(governance_verify_path, governance_verify)

# Both migration-path harnesses intentionally defer the ADPT chain so they can
# inject legacy data before hardening. Keep the new lifecycle migration in that
# ordered chain rather than letting Prisma apply it before its prerequisites.
for migration_harness_path, classifier_anchor, loop_anchor in [
    (
        "scripts/verify-adipometry-migration-existing-data.sh",
        "    20260730224500_add_adipometry_clinical_governance)\n",
        "  20260730224500_add_adipometry_clinical_governance\n",
    ),
    (
        "scripts/verify-adipometry-migration-full-chain.sh",
        "    20260730224500_add_adipometry_clinical_governance)\n",
        "  20260730224500_add_adipometry_clinical_governance\n",
    ),
]:
    harness = read(migration_harness_path)
    harness = replace_once(
        harness,
        classifier_anchor,
        "    20260730224500_add_adipometry_clinical_governance|\\\n"
        "    20260731120000_complete_adipometry_revision_lifecycle)\n",
        f"{migration_harness_path} classifier order",
    )
    harness = replace_once(
        harness,
        loop_anchor,
        "  20260730224500_add_adipometry_clinical_governance \\\n"
        "  20260731120000_complete_adipometry_revision_lifecycle\n",
        f"{migration_harness_path} execution order",
    )
    write(migration_harness_path, harness)

# 5. Add a focused executable contract test for the shared revision label.
write(
    "apps/api/src/modules/adipometry/adipometry-revision-contract.test.ts",
    """import { formatAdipometryRevisionLabel } from '@corrida/types';

describe('adipometry revision contract', () => {
  it('formats revisions without imposing an artificial upper bound', () => {
    expect(formatAdipometryRevisionLabel(1)).toBe('R1');
    expect(formatAdipometryRevisionLabel(1000)).toBe('R1000');
  });

  it('rejects invalid revision identities', () => {
    expect(() => formatAdipometryRevisionLabel(0)).toThrow(RangeError);
    expect(() => formatAdipometryRevisionLabel(1.5)).toThrow(RangeError);
  });
});
""",
)

# 6. Append canonical documentation once. These sections distinguish technical
# persistence state from the product lifecycle and define the current-revision rule.
doc_sections = {
    "docs/product/adipometry-protocol.md": """

## Ciclo canônico de revisões

A identidade funcional de uma avaliação é o par `rootAssessmentId` + código `ADPT-###`. A revisão é exibida como `R1`, `R2`, `R3` e assim por diante; não existe limite funcional para o número da revisão.

- `DRAFT`: revisão editável e ainda não clínica;
- `FINALIZED`: revisão concluída e vigente;
- `SUPERSEDED`: revisão concluída substituída por uma correção posterior;
- `CANCELLED`: rascunho de correção abandonado, preservado sem alterar a revisão vigente;
- `VOIDED`: revisão vigente invalidada auditavelmente, sem exclusão física.

O campo técnico `status` continua restrito a `DRAFT`/`COMPLETED` para o pipeline de cálculo. `revisionStatus` é a autoridade do ciclo de negócio. Correções reutilizam código e sequência da avaliação raiz, incrementam somente `revisionNumber` e nunca consomem a sequência de uma nova avaliação.

Somente uma correção pode permanecer aberta por cadeia. A finalização da correção calcula novamente no banco, preserva `beforeSnapshot`, `afterSnapshot` e `changedFields`, marca a revisão anterior como `SUPERSEDED` e torna a nova revisão `FINALIZED` na mesma transação. Mudança de protocolo exige categoria `PROTOCOL_SELECTION_ERROR` e confirmação explícita do ator autenticado. Comparações e Central do Aluno consultam `AdipometryCurrentAssessment`, que expõe apenas a revisão `FINALIZED` vigente. Revisões canceladas, substituídas ou anuladas não retornam como atuais.
""",
    "docs/database/adipometry-governance.md": """

## Persistência de revisões ADPT

A migration `20260731120000_complete_adipometry_revision_lifecycle` adiciona a autoridade histórica de revisão sem reescrever avaliações existentes. O backfill é determinístico: registros sem predecessor tornam-se `R1`; cadeias antigas de correção recebem números crescentes e preservam os vínculos existentes.

A persistência aplica as seguintes garantias:

- identidade raiz e revisão únicas por `rootAssessmentId`;
- código e sequência únicos somente para avaliações raiz, permitindo que revisões os reutilizem;
- no máximo um rascunho de correção aberto por cadeia;
- no máximo um sucessor finalizado para cada revisão;
- transições terminais imutáveis e proibição de exclusão física do histórico;
- cancelamento e anulação com ator, data e motivo;
- snapshots antes/depois e campos alterados calculados no banco;
- view `AdipometryCurrentAssessment` como fonte da revisão clínica vigente;
- validação efetiva de todos os vetores clínicos antes de uma aprovação por contrato.

As funções `startAdipometryCorrection`, `cancelAdipometryCorrection`, `confirmAdipometryCorrectionProtocolChange` e `voidAdipometryAssessment` exigem o contexto autenticado de ator e preservam isolamento por contrato/aluno.
""",
    "docs/execution-plans/active/issue-246-adipometry-governance-delta.md": """

## Fechamento do ciclo de correção

O delta final acrescenta o lifecycle completo `DRAFT → FINALIZED → SUPERSEDED`, além dos terminais `CANCELLED` e `VOIDED`. A validação obrigatória cobre concorrência de rascunhos, reutilização de código/sequência, numeração monotônica após cancelamento, snapshots e diferenças, seleção da revisão vigente, anulação auditável e rejeição de correção sem mudança material.
""",
}
for path, section in doc_sections.items():
    current = read(path)
    heading = section.strip().splitlines()[0]
    if heading not in current:
        write(path, current.rstrip() + "\n" + section.strip() + "\n")

print("Issue #246 revision lifecycle delta applied")
