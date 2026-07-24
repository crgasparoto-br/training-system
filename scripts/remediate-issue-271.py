from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one occurrence, found {count}: {old[:80]!r}")
    write(path, text.replace(old, new, 1))


# Shared runtime validation used by API routes, canonical identity writes and completion.
write(
    "packages/utils/brazilian-cpf.ts",
    """export function normalizeBrazilianCpf(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\\D/g, '') : '';
}

export function isValidBrazilianCpf(value: unknown): boolean {
  const cpf = normalizeBrazilianCpf(value);
  if (!/^\\d{11}$/.test(cpf) || /^(\\d)\\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

export function normalizeIsoDateOnly(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})(?:T.*)?$/.exec(raw);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return '';
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function isValidIsoDateOnly(value: unknown): boolean {
  return normalizeIsoDateOnly(value) !== '';
}
""",
)

utils_index = read("packages/utils/index.ts")
export_line = "export * from './brazilian-cpf.js';"
if export_line not in utils_index:
    if not utils_index.endswith("\n"):
        utils_index += "\n"
    utils_index += f"{export_line}\n"
    write("packages/utils/index.ts", utils_index)

# Public API normalizes formatted CPF and rejects invalid identifiers/dates.
routes_path = "apps/api/src/modules/pre-registration-public/pre-registration-public.routes.ts"
routes = read(routes_path)
routes = routes.replace(
    "import { RegisterSchema, sendError, sendSuccess } from '@corrida/utils';",
    """import {
  RegisterSchema,
  isValidBrazilianCpf,
  normalizeBrazilianCpf,
  normalizeIsoDateOnly,
  sendError,
  sendSuccess,
} from '@corrida/utils';""",
    1,
)
if "const optionalCpfSchema" not in routes:
    marker = "const publicIdentitySchema = z.object({"
    if marker not in routes:
        raise RuntimeError("public identity schema marker not found")
    helpers = """const emptyStringToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const optionalCpfSchema = z.preprocess(
  emptyStringToUndefined,
  z.string()
    .trim()
    .transform(normalizeBrazilianCpf)
    .refine(isValidBrazilianCpf, 'CPF inválido')
    .optional()
);
const optionalBirthDateSchema = z.preprocess(
  emptyStringToUndefined,
  z.string()
    .trim()
    .transform(normalizeIsoDateOnly)
    .refine((value) => value !== '', 'Data de nascimento inválida')
    .optional()
);
const optionalEmailSchema = (message: string) => z.preprocess(
  emptyStringToUndefined,
  z.string().trim().email(message).max(320).optional()
);
"""
    routes = routes.replace(marker, helpers + marker, 1)
replacements = {
    "  email: z.string().trim().email('E-mail inválido').max(320).optional(),":
        "  email: optionalEmailSchema('E-mail inválido'),",
    "  additionalEmail: z.string().trim().email('E-mail alternativo inválido').max(320).optional(),":
        "  additionalEmail: optionalEmailSchema('E-mail alternativo inválido'),",
    "  cpf: z.string().trim().max(20).optional(),": "  cpf: optionalCpfSchema,",
    "  birthDate: z.string().trim().max(40).optional(),": "  birthDate: optionalBirthDateSchema,",
    "  guardianCpf: z.string().trim().max(20).optional(),": "  guardianCpf: optionalCpfSchema,",
    "  guardianEmail: z.string().trim().email('E-mail do responsável inválido').max(320).optional(),":
        "  guardianEmail: optionalEmailSchema('E-mail do responsável inválido'),",
}
for old, new in replacements.items():
    if old not in routes and new not in routes:
        raise RuntimeError(f"route validation line not found: {old}")
    routes = routes.replace(old, new, 1)
write(routes_path, routes)

# Canonical identity writes also validate direct service calls, not only HTTP payloads.
identity_path = "apps/api/src/modules/alunos/student-identity.service.ts"
identity = read(identity_path)
validation_import = """import {
  isValidBrazilianCpf,
  normalizeBrazilianCpf,
  normalizeIsoDateOnly,
} from '@corrida/utils';
"""
if "normalizeBrazilianCpf" not in identity:
    identity = validation_import + identity
if "function normalizePublicPreRegistrationPatch" not in identity:
    marker = "export async function upsertStudentIdentity("
    if marker not in identity:
        raise RuntimeError("upsertStudentIdentity marker not found")
    helper = """function normalizePublicPreRegistrationPatch(
  patch: Record<string, unknown>,
  sourceReference?: string
): void {
  if (!sourceReference?.includes('pre_registration')) return;

  for (const field of ['cpf', 'guardianCpf'] as const) {
    if (!(field in patch)) continue;
    const raw = typeof patch[field] === 'string' ? patch[field].trim() : '';
    if (!raw) {
      delete patch[field];
      continue;
    }
    const normalized = normalizeBrazilianCpf(raw);
    if (!isValidBrazilianCpf(normalized)) {
      throw new Error(field === 'cpf' ? 'CPF inválido.' : 'CPF do responsável inválido.');
    }
    patch[field] = normalized;
  }

  if ('birthDate' in patch) {
    const raw = typeof patch.birthDate === 'string' ? patch.birthDate.trim() : '';
    if (!raw) {
      delete patch.birthDate;
    } else {
      const normalized = normalizeIsoDateOnly(raw);
      if (!normalized) throw new Error('Data de nascimento inválida.');
      patch.birthDate = normalized;
    }
  }
}

"""
    identity = identity.replace(marker, helper + marker, 1)
if "normalizePublicPreRegistrationPatch(" not in identity[identity.index("export async function upsertStudentIdentity("):]:
    raise RuntimeError("normalization helper was not added")
function_start = identity.index("export async function upsertStudentIdentity(")
body_marker = "): Promise<StudentIdentitySnapshot> {"
body_position = identity.index(body_marker, function_start) + len(body_marker)
call = "\n  normalizePublicPreRegistrationPatch(\n    patch as Record<string, unknown>,\n    options.sourceReference\n  );"
if call.strip() not in identity[body_position:body_position + 500]:
    identity = identity[:body_position] + call + identity[body_position:]
write(identity_path, identity)

# Completion revalidates canonical CPF, guardian CPF and calendar-valid birth date.
completion_path = "apps/api/src/modules/alunos/student-public-pre-registration.service.ts"
completion = read(completion_path)
completion_import = """import {
  isValidBrazilianCpf,
  normalizeIsoDateOnly,
} from '@corrida/utils';
"""
if "isValidBrazilianCpf" not in completion:
    completion = completion_import + completion
completion = completion.replace(
    "      if (!identity.cpf) missing.push('cpf');",
    """      if (!normalizeIsoDateOnly(identity.birthDate)) missing.push('birthDate');
      if (!isValidBrazilianCpf(identity.cpf)) missing.push('cpf');""",
    1,
)
completion = completion.replace(
    "        if (!identity.guardianCpf) missing.push('guardianCpf');",
    "        if (!isValidBrazilianCpf(identity.guardianCpf)) missing.push('guardianCpf');",
    1,
)
write(completion_path, completion)

# Health modules remain outside #271: keep cards informative and remove misleading actions.
web_path = "apps/web/src/pages/PublicPreRegistration/PublicPreRegistration.tsx"
web = read(web_path)
needle = "Consultar conclusão"
if "Disponível em breve" not in web:
    position = web.index(needle)
    button_start = web.rfind("<button", 0, position)
    button_end = web.find("</button>", position)
    if button_start < 0 or button_end < 0:
        raise RuntimeError("health handoff button block not found")
    button_end += len("</button>")
    segment = web[button_start:button_end]
    if "Iniciar" not in segment or "Continuar" not in segment:
        raise RuntimeError("unexpected health handoff button block")
    replacement = """<div
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-4 text-sm font-semibold text-slate-600"
                      role="status"
                    >
                      Disponível em breve
                    </div>"""
    web = web[:button_start] + replacement + web[button_end:]
write(web_path, web)

# Regression tests: invalid identifiers/date, formatted CPF normalization and honest handoff.
integration_path = "apps/api/tests/pre-registration-public.integration.test.ts"
integration = read(integration_path)
if "rejects malformed canonical CPF during completion" not in integration:
    insertion = r"""

  it('rejects malformed canonical CPF during completion', async () => {
    const account = await createUser({
      label: 'invalid-cpf-completion-account',
      name: 'Aluno CPF Inválido',
    });
    const invited = await createInvitedAluno({
      label: 'invalid-cpf-completion-student',
      name: 'Aluno CPF Inválido',
      email: account.email,
      birthDate: '1991-02-03',
      cpf: '1',
    });

    await preRegistrationPublicService.claim(account.id, {
      token: invited.token,
      role: 'STUDENT',
    });
    let session = await preRegistrationPublicService.getSession(account.id, invited.alunoId);
    session = await preRegistrationPublicService.saveStep(account.id, invited.alunoId, {
      expectedVersion: session.version,
      step: 'CONTACT',
      data: { phone: '15999990000', email: account.email },
    });

    await expect(
      preRegistrationPublicService.complete(account.id, invited.alunoId, {
        expectedVersion: session.version,
        privacyAccepted: true,
      })
    ).rejects.toMatchObject({
      code: 'MISSING_REQUIRED_FIELDS',
      details: { fields: expect.arrayContaining(['cpf']) },
    });
  });

  it('normalizes a formatted valid CPF and rejects an impossible birth date', async () => {
    const account = await createUser({
      label: 'cpf-normalization-account',
      name: 'Aluno CPF Normalizado',
    });
    const invited = await createInvitedAluno({
      label: 'cpf-normalization-student',
      name: 'Aluno CPF Normalizado',
      email: account.email,
      birthDate: '1990-04-05',
    });

    await preRegistrationPublicService.claim(account.id, {
      token: invited.token,
      role: 'STUDENT',
    });
    const initial = await preRegistrationPublicService.getSession(account.id, invited.alunoId);
    const normalized = await preRegistrationPublicService.saveStep(account.id, invited.alunoId, {
      expectedVersion: initial.version,
      step: 'IDENTIFICATION',
      data: {
        name: 'Aluno CPF Normalizado',
        birthDate: '1990-04-05',
        cpf: '529.982.247-25',
      },
    });
    expect(normalized.identity.cpf).toBe('52998224725');

    await expect(
      preRegistrationPublicService.saveStep(account.id, invited.alunoId, {
        expectedVersion: normalized.version,
        step: 'IDENTIFICATION',
        data: { birthDate: '2026-02-31' },
      })
    ).rejects.toThrow('Data de nascimento inválida');
  });

  it('rejects an invalid guardian CPF in direct service writes', async () => {
    const guardian = await createUser({
      label: 'invalid-guardian-cpf-account',
      name: 'Responsável CPF Inválido',
    });
    const invited = await createInvitedAluno({
      label: 'invalid-guardian-cpf-student',
      name: 'Menor CPF Responsável Inválido',
      birthDate: '2013-05-10',
      cpf: '11144477735',
    });

    await preRegistrationPublicService.claim(guardian.id, {
      token: invited.token,
      role: 'GUARDIAN',
    });
    const session = await preRegistrationPublicService.confirmGuardianAuthorization(
      guardian.id,
      invited.alunoId,
      { relationship: 'Mãe', declarationAccepted: true }
    );

    await expect(
      preRegistrationPublicService.saveStep(guardian.id, invited.alunoId, {
        expectedVersion: session.version,
        step: 'GUARDIAN',
        data: { guardianName: 'Responsável CPF Inválido', guardianCpf: '1' },
      })
    ).rejects.toThrow('CPF do responsável inválido');
  });
"""
    close = integration.rfind("\n});")
    if close < 0:
        raise RuntimeError("integration describe terminator not found")
    integration = integration[:close] + insertion + integration[close:]
    write(integration_path, integration)

behavior_path = "apps/web/src/pages/PublicPreRegistration/PublicPreRegistration.behavior.test.tsx"
behavior = read(behavior_path)
if "does not advertise unavailable health module actions" not in behavior:
    insertion = r"""

  it('does not advertise unavailable health module actions', async () => {
    mocks.getSession.mockResolvedValueOnce({
      ...baseSession,
      status: 'PRE_REGISTRATION_COMPLETED',
      completedAt: '2026-07-24T00:00:00.000Z',
      nextSteps: [
        {
          key: 'ANAMNESIS',
          title: 'Responder Anamnese Inicial',
          description: 'Conte informações importantes para orientar seu acompanhamento.',
          optional: true,
          status: 'NOT_STARTED',
          action: 'START',
          href: '/pre-cadastro/anamnese',
        },
        {
          key: 'PARQ',
          title: 'Responder PAR-Q',
          description: 'Responda o questionário de prontidão para atividade física.',
          optional: true,
          status: 'IN_PROGRESS',
          action: 'CONTINUE',
          href: '/pre-cadastro/par-q',
        },
      ],
    });

    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    expect(await screen.findByText('Responder Anamnese Inicial')).toBeInTheDocument();
    expect(screen.getByText('Responder PAR-Q')).toBeInTheDocument();
    expect(screen.getAllByText('Disponível em breve')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^Iniciar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Continuar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Consultar conclusão/i })).not.toBeInTheDocument();
  });
"""
    close = behavior.rfind("\n});")
    if close < 0:
        raise RuntimeError("behavior describe terminator not found")
    behavior = behavior[:close] + insertion + behavior[close:]
    write(behavior_path, behavior)

# Document the resolved audit findings.
doc_path = "docs/execution-plans/active/issue-271-public-pre-registration.md"
doc = read(doc_path)
section = """

## Correções da segunda auditoria independente de 24/07/2026

- CPF do aluno e do responsável usam validação algorítmica compartilhada, normalização para 11 dígitos e rejeição também em chamadas diretas ao serviço;
- datas de nascimento impossíveis são rejeitadas antes de atualizar a identidade canônica;
- a conclusão revalida CPF, CPF do responsável e data canônica, sem aceitar apenas presença textual;
- campos opcionais vazios são tratados como ausentes no contrato HTTP;
- enquanto as issues #272 e #273 não entregarem os módulos, os cards de Anamnese e PAR-Q permanecem informativos e exibem `Disponível em breve`, sem ações enganosas;
- testes discriminantes cobrem CPF malformado na conclusão, CPF formatado válido, data impossível, CPF inválido de responsável e handoff indisponível.
"""
if "## Correções da segunda auditoria independente" not in doc:
    if not doc.endswith("\n"):
        doc += "\n"
    doc += section.lstrip("\n")
    write(doc_path, doc)

print("Issue 271 remediation applied successfully")
