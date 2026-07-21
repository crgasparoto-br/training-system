from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    target = Path(path)
    source = target.read_text()
    if old not in source:
        raise SystemExit(f"expected snippet not found in {path}: {old[:80]!r}")
    target.write_text(source.replace(old, new, count))


replace(
    "apps/api/prisma/schema.prisma",
    "  cpf                                  String?        @unique\n",
    "  cpf                                  String?\n",
)
replace(
    "apps/api/prisma/schema.prisma",
    "  @@index([legalFinancialValidatedByProfessorId])\n  @@index([bankCode])\n",
    "  @@index([legalFinancialValidatedByProfessorId])\n  @@index([bankCode])\n  @@index([cpf])\n",
)
replace(
    "apps/api/prisma/migrations/20260721120000_student_lifecycle_domain/migration.sql",
    'DROP INDEX IF EXISTS "Aluno_contractId_leadPhoneNormalized_key";\n',
    'DROP INDEX IF EXISTS "Aluno_contractId_leadPhoneNormalized_key";\nDROP INDEX IF EXISTS "Profile_cpf_key";\nCREATE INDEX IF NOT EXISTS "Profile_cpf_idx" ON "Profile"("cpf");\n',
)
replace(
    "apps/api/src/modules/professores/professor.service.ts",
    "  const existingProfile = await prisma.profile.findUnique({\n    where: { cpf },",
    "  const existingProfile = await prisma.profile.findFirst({\n    where: { cpf },",
)
replace(
    "apps/api/src/modules/alunos/student-identity.service.ts",
    "      ...(birthDate ? { age: deriveAgeFromBirthDate(birthDate) } : {}),",
    "      age: birthDate ? deriveAgeFromBirthDate(birthDate) : null,",
)
replace(
    "apps/api/src/modules/alunos/student-identity.service.ts",
    "  if (options.syncLegacyProfile && aluno.userId && aluno.user?.profile) {\n    await client.profile.update({",
    "  const legacyProjectionIsUnambiguous =\n    options.syncLegacyProfile &&\n    aluno.userId &&\n    aluno.user?.profile &&\n    (await client.aluno.count({ where: { userId: aluno.userId } })) === 1;\n\n  if (legacyProjectionIsUnambiguous && aluno.userId && aluno.user?.profile) {\n    await client.profile.update({",
)
replace(
    "apps/api/src/modules/alunos/student-identity.service.ts",
    "  if (\n    identity.email &&\n    normalizeStudentEmail(identity.email) !== normalizeStudentEmail(account.email)\n  ) {\n    mismatches.push('email');\n  }\n",
    "",
)
replace(
    "apps/api/src/modules/alunos/student-lifecycle.service.ts",
    "  progress: {\n    formVersion?: string;\n    privacyNoticeVersion?: string;\n    privacyAcceptedAt?: Date;\n  }\n",
    "  progress: {\n    formVersion?: string;\n    privacyNoticeVersion?: string;\n  }\n",
)
replace(
    "apps/api/tests/profile-review.service.test.ts",
    "it('gera submissão histórica de PAR-Q aprovado usando o contrato atual do aluno'",
    "it('gera submissão histórica de PAR-Q aprovado usando Aluno.contractId como tenant canônico'",
)
replace(
    "apps/api/tests/profile-review.service.test.ts",
    "contractId: 'contract-current',\n            declarationAccepted",
    "contractId: CONTRACT_ID,\n            declarationAccepted",
)

lifecycle_test = Path("apps/api/src/modules/alunos/student-lifecycle.service.test.ts")
source = lifecycle_test.read_text()
anchor = "  it('mantém o mesmo ID no fluxo completo e persiste identidade/consentimento canônicos', async () => {"
cpf_test = """  it('permite o mesmo CPF em contratos diferentes, inclusive nas projeções legadas', async () => {
    const other = await createContract(true);
    const cpf = '321.654.987-00';
    const first = await prepareInProgressLead({
      name: 'CPF Cross Tenant A',
      phone: '11910101010',
    });
    const second = await prepareInProgressLead({
      contractId: other.contractId,
      professorId: other.professorId,
      name: 'CPF Cross Tenant B',
      phone: '11920202020',
    });

    await completeStudentPreRegistration(
      first.lead.id,
      contractId,
      {
        name: 'CPF Cross Tenant A',
        phone: '11910101010',
        cpf,
        birthDate: '1990-01-01',
        privacyNoticeVersion: 'v1',
        privacyAcceptedAt: new Date(),
      },
      first.userId
    );
    await expect(
      completeStudentPreRegistration(
        second.lead.id,
        other.contractId,
        {
          name: 'CPF Cross Tenant B',
          phone: '11920202020',
          cpf,
          birthDate: '1991-01-01',
          privacyNoticeVersion: 'v1',
          privacyAcceptedAt: new Date(),
        },
        second.userId
      )
    ).resolves.toMatchObject({ id: second.lead.id });

    expect(
      await prisma.profile.count({
        where: { cpf },
      })
    ).toBe(2);
  });

"""
if anchor not in source:
    raise SystemExit("CPF cross-tenant test anchor missing")
source = source.replace(anchor, cpf_test + anchor, 1)
anchor = "  it('claim concorrente não sobrescreve o vencedor e gera um único evento', async () => {"
claim_tests = """  it('não confunde e-mail de contato tenant-scoped com e-mail global de login', async () => {
    const name = 'Contato Diferente';
    const phone = '11988886666';
    const lead = await createStudentLead({
      contractId,
      name,
      phone,
      email: 'contato.operacional@example.com',
      origin: 'test-suite',
    });
    const account = await createMatchingStudentAccount(name, phone);

    await expect(
      claimAccountForStudentLead(lead.id, contractId, account.id)
    ).resolves.toMatchObject({ userId: account.id });
  });

  it('não sobrescreve Profile global quando a conta possui múltiplos tenants', async () => {
    const other = await createContract(false);
    const name = 'Conta Compartilhada';
    const phone = '11933334444';
    const account = await createMatchingStudentAccount(name, phone);

    const first = await createStudentLead({ contractId, name, phone, origin: 'test-suite' });
    const second = await createStudentLead({
      contractId: other.contractId,
      name,
      phone,
      origin: 'test-suite',
    });
    await claimAccountForStudentLead(first.id, contractId, account.id);
    await claimAccountForStudentLead(second.id, other.contractId, account.id);
    await recordStudentInvitationCreated(second.id, other.contractId, {
      invitationId: `invite-${unique()}`,
      actor: {},
    });
    await startStudentPreRegistration(second.id, other.contractId, account.id);

    await completeStudentPreRegistration(
      second.id,
      other.contractId,
      {
        name: 'Nome Tenant Dois',
        phone: '11999990000',
        cpf: '987.654.321-00',
        birthDate: '1992-02-02',
        privacyNoticeVersion: 'v1',
        privacyAcceptedAt: new Date(),
      },
      account.id
    );

    const globalProfile = await prisma.profile.findUniqueOrThrow({
      where: { userId: account.id },
    });
    expect(globalProfile.name).toBe(name);
    expect(globalProfile.phone).toBe(phone);
    expect(globalProfile.cpf).toBeNull();

    const tenantIdentity = await loadStudentIdentity(second.id, other.contractId);
    expect(tenantIdentity.name).toBe('Nome Tenant Dois');
    expect(tenantIdentity.phone).toBe('11999990000');
    expect(tenantIdentity.cpf).toBe('987.654.321-00');
  });

"""
if anchor not in source:
    raise SystemExit("claim tests anchor missing")
lifecycle_test.write_text(source.replace(anchor, claim_tests + anchor, 1))

replace(
    "docs/architecture/student-lifecycle-data-ownership.md",
    "Durante o rollout, o service atualiza `Profile` como projeção de\ncompatibilidade quando há conta vinculada;",
    "Durante o rollout, o service atualiza `Profile` como projeção de\ncompatibilidade somente quando a conta possui um único vínculo de aluno; contas\ncompartilhadas entre tenants nunca recebem sobrescrita por dados tenant-scoped;",
)
replace(
    "docs/architecture/student-lifecycle-data-ownership.md",
    "| CPF/documento | `StudentProfile.identificationData.cpf` | `Aluno.leadCpf` e normalizado, `Profile.cpf` | CPF normalizado é bloqueante somente dentro do tenant por `@@unique([contractId, leadCpfNormalized])` |",
    "| CPF/documento | `StudentProfile.identificationData.cpf` | `Aluno.leadCpf` e normalizado, `Profile.cpf` | CPF normalizado é bloqueante somente dentro do tenant; `Profile.cpf` não possui unicidade global |",
)
replace(
    "docs/architecture/student-lifecycle-data-ownership.md",
    "`ACCOUNT_DATA_MISMATCH` quando há divergência, sem reconciliar\n   silenciosamente;",
    "`ACCOUNT_DATA_MISMATCH` quando nome, telefone, CPF ou nascimento disponíveis\n   divergem, sem confundir e-mail de contato com e-mail global de login e sem\n   reconciliar silenciosamente;",
)

plan = Path("docs/execution-plans/active/2026-07-issue-268-audit-corrections.md")
plan_source = plan.read_text()
if "## Passagem adversarial adicional" not in plan_source:
    plan_source += """

## Passagem adversarial adicional

- removida a unicidade global de `Profile.cpf`, preservando validação de CPF de colaboradores no service;
- e-mail de contato tenant-scoped deixou de ser comparado ao e-mail global de login no claim;
- projeção legada em `Profile` é omitida para contas com múltiplos vínculos, evitando sobrescrita cross-tenant;
- limpeza de nascimento também limpa a idade derivada.
"""
plan.write_text(plan_source)
