from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one occurrence, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


def ensure_absent(path: str, marker: str) -> None:
    if marker in Path(path).read_text():
        raise RuntimeError(f"{path}: marker already present: {marker}")


identity_path = "apps/api/src/modules/alunos/student-identity.service.ts"
ensure_absent(identity_path, "lockStudentIdentityDeduplicationScope")
replace_once(
    identity_path,
    "type DbClient = Prisma.TransactionClient | PrismaClient;\n",
    "type DbClient = Prisma.TransactionClient | PrismaClient;\n\n"
    "export async function lockStudentIdentityDeduplicationScope(\n"
    "  client: Prisma.TransactionClient,\n"
    "  contractId: string\n"
    "): Promise<void> {\n"
    "  await client.$queryRaw<Array<{ locked: unknown }>>`\n"
    "    SELECT pg_advisory_xact_lock(hashtextextended(${contractId}, 27417)) AS \\\"locked\\\"\n"
    "  `;\n"
    "}\n",
)
replace_once(
    identity_path,
    "  let age = referenceDate.getFullYear() - birthDate.getFullYear();\n"
    "  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();\n"
    "  if (\n"
    "    monthDiff < 0 ||\n"
    "    (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())\n"
    "  ) {\n",
    "  let age = referenceDate.getUTCFullYear() - birthDate.getUTCFullYear();\n"
    "  const monthDiff = referenceDate.getUTCMonth() - birthDate.getUTCMonth();\n"
    "  if (\n"
    "    monthDiff < 0 ||\n"
    "    (monthDiff === 0 && referenceDate.getUTCDate() < birthDate.getUTCDate())\n"
    "  ) {\n",
)
replace_once(
    identity_path,
    "const toIsoDate = (value?: string | Date | null): string | null | undefined => {\n"
    "  if (value === undefined) return undefined;\n"
    "  if (value === null || value === '') return null;\n"
    "  const parsed = value instanceof Date ? value : new Date(value);\n"
    "  if (Number.isNaN(parsed.getTime())) {\n"
    "    throw new Error('Data de nascimento inválida');\n"
    "  }\n"
    "  return parsed.toISOString();\n"
    "};\n",
    "export function normalizeStudentBirthDate(\n"
    "  value?: string | Date | null\n"
    "): string | null | undefined {\n"
    "  if (value === undefined) return undefined;\n"
    "  if (value === null || value === '') return null;\n\n"
    "  const civilDate = value instanceof Date\n"
    "    ? value.toISOString().slice(0, 10)\n"
    "    : value.trim().match(/^(\\d{4}-\\d{2}-\\d{2})(?:$|T)/)?.[1];\n"
    "  if (!civilDate) throw new Error('Data de nascimento inválida');\n\n"
    "  const [year, month, day] = civilDate.split('-').map(Number);\n"
    "  const parsed = new Date(Date.UTC(year, month - 1, day));\n"
    "  if (\n"
    "    parsed.getUTCFullYear() !== year ||\n"
    "    parsed.getUTCMonth() !== month - 1 ||\n"
    "    parsed.getUTCDate() !== day\n"
    "  ) {\n"
    "    throw new Error('Data de nascimento inválida');\n"
    "  }\n"
    "  return `${civilDate}T00:00:00.000Z`;\n"
    "}\n\n"
    "const toIsoDate = normalizeStudentBirthDate;\n",
)
replace_once(
    identity_path,
    "  const client = options.client;\n  const aluno = await client.aluno.findFirst({\n",
    "  const client = options.client;\n"
    "  await lockStudentIdentityDeduplicationScope(\n"
    "    client as Prisma.TransactionClient,\n"
    "    contractId\n"
    "  );\n"
    "  const aluno = await client.aluno.findFirst({\n",
)

atomic_path = "apps/api/src/modules/pre-registration-public/pre-registration-public-atomic.service.ts"
replace_once(
    atomic_path,
    "import {\n  loadStudentIdentity,\n  upsertStudentIdentity,\n} from '../alunos/student-identity.service.js';\n",
    "import {\n"
    "  loadStudentIdentity,\n"
    "  lockStudentIdentityDeduplicationScope,\n"
    "  upsertStudentIdentity,\n"
    "} from '../alunos/student-identity.service.js';\n",
)
replace_once(
    atomic_path,
    "        if (input.step === 'IDENTIFICATION' || input.step === 'CONTACT') {\n"
    "          const detection = await detectPreRegistrationDuplicates(tx, {\n",
    "        if (input.step === 'IDENTIFICATION' || input.step === 'CONTACT') {\n"
    "          await lockStudentIdentityDeduplicationScope(tx, access.contractId);\n"
    "          const detection = await detectPreRegistrationDuplicates(tx, {\n",
)

review_path = "apps/api/src/modules/pre-registration-public/pre-registration-duplicate-review.service.ts"
replace_once(
    review_path,
    "import {\n  loadStudentIdentity,\n  upsertStudentIdentity,\n  type StudentIdentityData,\n} from '../alunos/student-identity.service.js';\n",
    "import {\n"
    "  loadStudentIdentity,\n"
    "  lockStudentIdentityDeduplicationScope,\n"
    "  upsertStudentIdentity,\n"
    "  type StudentIdentityData,\n"
    "} from '../alunos/student-identity.service.js';\n",
)
replace_once(
    review_path,
    "      const proposed = {\n"
    "        ...currentIdentity,\n"
    "        ...publicIdentityFrom(input.data),\n"
    "      };\n"
    "      const detection = await detectPreRegistrationDuplicates(tx, {\n",
    "      const proposed = {\n"
    "        ...currentIdentity,\n"
    "        ...publicIdentityFrom(input.data),\n"
    "      };\n"
    "      await lockStudentIdentityDeduplicationScope(tx, access.contractId);\n"
    "      const detection = await detectPreRegistrationDuplicates(tx, {\n",
)
replace_once(
    review_path,
    "    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });\n  },\n\n  async projectPublicSession(\n",
    "    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });\n  },\n\n  async projectPublicSession(\n",
)

routes_path = "apps/api/src/modules/pre-registration-public/pre-registration-public.routes.ts"
replace_once(
    routes_path,
    "  birthDate: z.string().trim().max(40).optional(),\n",
    "  birthDate: z.string().trim().regex(/^\\d{4}-\\d{2}-\\d{2}$/, 'Use a data no formato AAAA-MM-DD').optional(),\n",
)

persistence_path = Path(
    "apps/api/src/modules/pre-registration-public/pre-registration-claim-review.persistence.ts"
)
if persistence_path.exists():
    raise RuntimeError(f"{persistence_path}: file already exists")
persistence_path.write_text(
    """import { Prisma } from '@prisma/client';
import { loadStudentIdentity } from '../alunos/student-identity.service.js';
import { detectPreRegistrationDuplicates } from '../pre-registration-enrollment/pre-registration-enrollment.service.js';

type DetectionResult = Awaited<ReturnType<typeof detectPreRegistrationDuplicates>>;
type EventMetadata = Record<string, unknown>;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function metadataOf(value: Prisma.JsonValue | null): EventMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as EventMetadata;
}

function reviewFields(detection: DetectionResult): string[] {
  const fields = new Set<string>();
  for (const signal of detection.candidates.flatMap((candidate) => candidate.signals)) {
    if (signal.code === 'CPF_EXACT') fields.add('cpf');
    if (signal.code === 'EMAIL_EXACT') fields.add('email');
    if (signal.code === 'PHONE_EXACT') fields.add('phone');
    if (signal.code === 'NAME_AND_BIRTH_DATE') {
      fields.add('name');
      fields.add('birthDate');
    }
    if (signal.code === 'ACCOUNT_ALREADY_LINKED' || signal.code === 'ACCOUNT_INCOMPATIBLE') {
      fields.add('account');
    }
  }
  return [...fields].sort();
}

function reviewSections(fields: readonly string[]): string[] {
  return [
    ...(fields.some((field) => ['cpf', 'name', 'birthDate'].includes(field))
      ? ['identification']
      : []),
    ...(fields.some((field) => ['email', 'phone'].includes(field)) ? ['contact'] : []),
    ...(fields.includes('account') ? ['access'] : []),
  ];
}

export async function recordClaimDuplicateReviewInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    alunoId: string;
    contractId: string;
    detection: DetectionResult;
  }
): Promise<void> {
  const { userId, alunoId, contractId, detection } = input;
  if (
    detection.classification !== 'REVIEW_REQUIRED' &&
    detection.classification !== 'BLOCKING'
  ) {
    return;
  }

  const fields = reviewFields(detection);
  const sections = reviewSections(fields);
  const identity = await loadStudentIdentity(alunoId, contractId, tx);
  const existing = await tx.studentProfileReview.findFirst({
    where: {
      alunoId,
      requestedByUserId: userId,
      status: 'pending',
      requiresApproval: true,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      changedFields: true,
      sectionsRequested: true,
    },
  });

  if (existing) {
    await tx.studentProfileReview.update({
      where: { id: existing.id },
      data: {
        requestedAt: new Date(),
        changedFields: asJson([
          ...new Set([...stringArray(existing.changedFields), ...fields]),
        ]),
        sectionsRequested: asJson([
          ...new Set([...stringArray(existing.sectionsRequested), ...sections]),
        ]),
        requiresApproval: true,
      },
    });
  } else {
    await tx.studentProfileReview.create({
      data: {
        alunoId,
        requestedByUserId: userId,
        sectionsRequested: asJson(sections),
        snapshotBefore: asJson(identity),
        snapshotAfter: asJson(identity),
        changedFields: asJson(fields),
        requiresApproval: true,
      },
    });
  }

  const priorEvents = await tx.studentLifecycleEvent.findMany({
    where: { alunoId, contractId, eventType: 'ADMIN_REVIEWED' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { metadata: true },
  });
  const alreadyAudited = priorEvents.some(({ metadata }) => {
    const value = metadataOf(metadata);
    return (
      value.source === 'public_pre_registration_claim' &&
      value.fingerprint === detection.fingerprint &&
      Number(value.reviewedRecordVersion) === detection.recordVersion
    );
  });
  if (alreadyAudited) return;

  await tx.studentLifecycleEvent.create({
    data: {
      alunoId,
      contractId,
      eventType: 'ADMIN_REVIEWED',
      actorUserId: userId,
      metadata: {
        source: 'public_pre_registration_claim',
        action: 'duplicate_review_requested',
        classification: detection.classification,
        fields,
        signalCodes: [
          ...new Set(
            detection.candidates.flatMap((candidate) =>
              candidate.signals.map((signal) => signal.code)
            )
          ),
        ],
        fingerprint: detection.fingerprint,
        reviewedRecordVersion: detection.recordVersion,
        publicDisclosure: 'NONE',
      },
    },
  });
}
"""
)

public_path = "apps/api/src/modules/pre-registration-public/pre-registration-public.service.ts"
replace_once(
    public_path,
    "import {\n"
    "  findStudentAccountIdentityMismatches,\n"
    "  loadStudentIdentity,\n"
    "  normalizeStudentEmail,\n"
    "  upsertStudentIdentity,\n"
    "} from '../alunos/student-identity.service.js';\n",
    "import {\n"
    "  findStudentAccountIdentityMismatches,\n"
    "  loadStudentIdentity,\n"
    "  lockStudentIdentityDeduplicationScope,\n"
    "  normalizeStudentEmail,\n"
    "  upsertStudentIdentity,\n"
    "} from '../alunos/student-identity.service.js';\n",
)
replace_once(
    public_path,
    "import { PRE_REGISTRATION_PRIVACY_NOTICE_VERSION } from './pre-registration-policy.js';\n",
    "import { PRE_REGISTRATION_PRIVACY_NOTICE_VERSION } from './pre-registration-policy.js';\n"
    "import { recordClaimDuplicateReviewInTransaction } from './pre-registration-claim-review.persistence.js';\n",
)
replace_once(
    public_path,
    "  await detectPreRegistrationDuplicates(tx, {\n"
    "    contractId: invite.contractId,\n"
    "    alunoId: invite.alunoId,\n"
    "    overrides: {\n"
    "      userId,\n"
    "      name: user.profile?.name,\n"
    "      email: user.email,\n"
    "    },\n"
    "  });\n",
    "  await lockStudentIdentityDeduplicationScope(tx, invite.contractId);\n"
    "  const claimDetection = await detectPreRegistrationDuplicates(tx, {\n"
    "    contractId: invite.contractId,\n"
    "    alunoId: invite.alunoId,\n"
    "    overrides: {\n"
    "      userId,\n"
    "      name: user.profile?.name,\n"
    "      email: user.email,\n"
    "    },\n"
    "  });\n",
)
replace_once(
    public_path,
    "  if (!wasAlreadyClaimed) {\n"
    "    await tx.studentLifecycleEvent.create({\n"
    "      data: {\n"
    "        alunoId: invite.alunoId,\n"
    "        contractId: invite.contractId,\n"
    "        eventType: 'ACCOUNT_LINKED',\n"
    "        actorUserId: userId,\n"
    "        metadata: {\n"
    "          source: 'public_pre_registration',\n"
    "          role,\n"
    "          guardianAuthorizationStatus: role === 'GUARDIAN' ? 'PENDING' : undefined,\n"
    "        },\n"
    "      },\n"
    "    });\n"
    "  }\n\n"
    "  return invite.alunoId;\n",
    "  if (!wasAlreadyClaimed) {\n"
    "    await tx.studentLifecycleEvent.create({\n"
    "      data: {\n"
    "        alunoId: invite.alunoId,\n"
    "        contractId: invite.contractId,\n"
    "        eventType: 'ACCOUNT_LINKED',\n"
    "        actorUserId: userId,\n"
    "        metadata: {\n"
    "          source: 'public_pre_registration',\n"
    "          role,\n"
    "          guardianAuthorizationStatus: role === 'GUARDIAN' ? 'PENDING' : undefined,\n"
    "        },\n"
    "      },\n"
    "    });\n"
    "  }\n\n"
    "  await recordClaimDuplicateReviewInTransaction(tx, {\n"
    "    userId,\n"
    "    alunoId: invite.alunoId,\n"
    "    contractId: invite.contractId,\n"
    "    detection: claimDetection,\n"
    "  });\n\n"
    "  return invite.alunoId;\n",
)

index_path = "apps/api/src/modules/pre-registration-public/index.ts"
replace_once(index_path, "import './pre-registration-claim-review.adapter.js';\n\n", "")

for path in [public_path, atomic_path, review_path]:
    file = Path(path)
    text = file.read_text()
    text = text.replace(
        "now.getFullYear() - birthDate.getFullYear()",
        "now.getUTCFullYear() - birthDate.getUTCFullYear()",
    )
    text = text.replace(
        "now.getMonth() - birthDate.getMonth()",
        "now.getUTCMonth() - birthDate.getUTCMonth()",
    )
    text = text.replace(
        "now.getDate() < birthDate.getDate()",
        "now.getUTCDate() < birthDate.getUTCDate()",
    )
    file.write_text(text)

docs_path = "docs/architecture/pre-registration-enrollment.md"
docs = Path(docs_path).read_text()
docs = docs.replace(
    "- `apps/api/src/modules/pre-registration-public/pre-registration-public.service.ts`: aplica o detector no claim, depois do lock do convite e antes de qualquer vínculo; o resultado não cria uma resposta pública diferenciada.",
    "- `apps/api/src/modules/pre-registration-public/pre-registration-public.service.ts`: aplica o detector no claim, depois do lock do convite e antes de qualquer vínculo; a pendência privada e a auditoria são persistidas na mesma transação do vínculo, sem resposta pública diferenciada.",
)
docs = docs.replace(
    "A deduplicação pública ocorre após autorização e bloqueio do onboarding e antes de `upsertStudentIdentity`, eliminando a janela entre checagem e gravação.",
    "A deduplicação pública ocorre após autorização e bloqueio do onboarding. Escritas de identidade adquirem um advisory lock transacional por tenant antes da detecção e do `upsertStudentIdentity`, serializando identificadores concorrentes.",
)
if "## Data civil" not in docs:
    docs += (
        "\n\n## Data civil\n\n"
        "`birthDate` é um valor civil. A API pública aceita somente `YYYY-MM-DD`; "
        "a fronteira canônica valida o calendário, preserva o prefixo civil sem converter "
        "offsets e persiste meia-noite UTC apenas como representação técnica. Cálculos de "
        "idade usam componentes UTC para não deslocar o dia por timezone.\n"
    )
Path(docs_path).write_text(docs)

exit_code = Path(".audit/issue-loop-engineer/issue-274-remediation-exit-code.txt")
if exit_code.exists():
    exit_code.unlink()
