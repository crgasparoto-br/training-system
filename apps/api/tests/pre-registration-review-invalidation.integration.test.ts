import { Prisma, PrismaClient } from '@prisma/client';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const suffix = `issue-274-review-invalidation-${Date.now()}`;
const contractId = `${suffix}-contract`;
let sequence = 0;

type CommercialPatch = {
  origin?: string;
  unit?: string;
  commercialNotes?: string;
};

async function seedCompletedLead(label: string) {
  sequence += 1;
  const aluno = await prisma.aluno.create({
    data: {
      contractId,
      status: 'PRE_REGISTRATION_COMPLETED',
      leadName: `Pessoa ${label} ${sequence}`,
      leadOrigin: 'origem-inicial',
      onboarding: {
        create: {
          contractId,
          version: 2,
          currentStep: 'PRIVACY',
          completedAt: new Date(),
          reviewedAt: null,
          reviewedByProfessorId: null,
        },
      },
    },
  });
  await prisma.studentProfile.create({
    data: {
      alunoId: aluno.id,
      contractId,
      sourceType: 'professional',
      sourceReference: 'issue_274_review_invalidation_fixture',
      identificationData: {
        name: aluno.leadName,
        _leadCommercial: {
          unit: 'Unidade Inicial',
          notes: 'Observação inicial',
        },
      },
    },
  });
  return aluno;
}

async function applyCommercialPatch(alunoId: string, patch: CommercialPatch) {
  await prisma.$transaction(async (tx) => {
    if (patch.origin !== undefined) {
      await tx.aluno.update({
        where: { id: alunoId },
        data: { leadOrigin: patch.origin },
      });
    }
    if (patch.unit !== undefined || patch.commercialNotes !== undefined) {
      const profile = await tx.studentProfile.findUniqueOrThrow({
        where: { alunoId },
        select: { identificationData: true },
      });
      const identity = profile.identificationData as Record<string, unknown>;
      const currentCommercial =
        identity._leadCommercial &&
        typeof identity._leadCommercial === 'object' &&
        !Array.isArray(identity._leadCommercial)
          ? (identity._leadCommercial as Record<string, unknown>)
          : {};
      await tx.studentProfile.update({
        where: { alunoId },
        data: {
          identificationData: {
            ...identity,
            _leadCommercial: {
              ...currentCommercial,
              ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
              ...(patch.commercialNotes !== undefined
                ? { notes: patch.commercialNotes }
                : {}),
            },
          } as Prisma.InputJsonValue,
        },
      });
    }
  });
}

describeDatabase('issue 274 stale commercial review invalidation', () => {
  beforeAll(async () => {
    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: 'academy',
        document: `${Date.now()}27415`,
        name: 'Contrato Issue 274 AUD-274-15',
      },
    });
  });

  afterAll(async () => {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('keeps exactly one authoritative invalidation trigger per projection', async () => {
    const allTriggers = await prisma.$queryRaw<
      Array<{
        tableName: string;
        triggerName: string;
        functionName: string;
        triggerDefinition: string;
        functionDefinition: string;
      }>
    >`
      SELECT relation.relname AS "tableName",
             trigger_definition.tgname AS "triggerName",
             trigger_function.proname AS "functionName",
             pg_get_triggerdef(trigger_definition.oid) AS "triggerDefinition",
             pg_get_functiondef(trigger_function.oid) AS "functionDefinition"
      FROM pg_trigger trigger_definition
      JOIN pg_class relation ON relation.oid = trigger_definition.tgrelid
      JOIN pg_proc trigger_function ON trigger_function.oid = trigger_definition.tgfoid
      WHERE NOT trigger_definition.tgisinternal
        AND relation.relname IN ('Aluno', 'StudentProfile', 'StudentOnboardingProcess')
      ORDER BY relation.relname, trigger_definition.tgname
    `;
    console.info('ISSUE274_TRIGGER_CATALOG', JSON.stringify(allTriggers));

    const invalidationTriggers = allTriggers
      .filter(({ functionName }) => functionName.startsWith('invalidate_pre_registration_review'))
      .map(({ tableName, triggerName, functionName }) => ({
        tableName,
        triggerName,
        functionName,
      }));

    expect(invalidationTriggers).toEqual([
      {
        tableName: 'Aluno',
        triggerName: 'Aluno_invalidate_pre_registration_review',
        functionName: 'invalidate_pre_registration_review_on_identity_change',
      },
      {
        tableName: 'StudentProfile',
        triggerName: 'StudentProfile_invalidate_pre_registration_review',
        functionName: 'invalidate_pre_registration_review_on_commercial_change',
      },
    ]);
  });

  it.each<[string, CommercialPatch]>([
    ['unidade', { unit: 'Unidade Centro' }],
    ['observações', { commercialNotes: 'Contato realizado pela recepção.' }],
    [
      'origem, unidade e observações na mesma transação',
      {
        origin: 'indicação-professor',
        unit: 'Unidade Norte',
        commercialNotes: 'Preferência por atendimento no período da manhã.',
      },
    ],
  ])(
    'incrementa a versão uma única vez para alteração de %s antes da primeira revisão',
    async (label, patch) => {
      const lead = await seedCompletedLead(label);
      const before = await prisma.studentOnboardingProcess.findUniqueOrThrow({
        where: { alunoId: lead.id },
        select: { version: true, reviewedAt: true },
      });
      expect(before.reviewedAt).toBeNull();

      await applyCommercialPatch(lead.id, patch);

      const after = await prisma.studentOnboardingProcess.findUniqueOrThrow({
        where: { alunoId: lead.id },
        select: { version: true, reviewedAt: true, reviewedByProfessorId: true },
      });
      expect(after.version).toBe(before.version + 1);
      expect(after.reviewedAt).toBeNull();
      expect(after.reviewedByProfessorId).toBeNull();
    }
  );
});
