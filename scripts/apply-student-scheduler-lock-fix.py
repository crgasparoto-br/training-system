from pathlib import Path

path = Path('apps/api/src/modules/student-contracts/student-contract-lifecycle.service.ts')
source = path.read_text()
source = source.replace(
    'const prisma = new PrismaClient();\n',
    'const prisma = new PrismaClient();\nconst STUDENT_SCHEDULER_LOCK_ID = 742703001;\n',
    1,
)
old = '''  async activateDueSignedContracts(now = new Date()) {
    const studentCandidates = await prisma.studentContract.findMany({
      where: {
        status: 'pending_signature',
        signedAt: { not: null },
        startDate: { lte: now },
        contract: { status: 'SIGNED' },
      },
      select: { id: true },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });
    const collaboratorCandidates = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT cc."id"
      FROM "CollaboratorContract" cc
      JOIN "GeneratedContract" gc ON gc."id" = cc."contractId"
      WHERE cc."status" = 'pending_signature'::"CollaboratorContractStatus"
        AND cc."signedAt" IS NOT NULL
        AND cc."startDate" <= ${now}
        AND gc."status" = 'SIGNED'::"ContractStatus"
      ORDER BY cc."startDate" ASC, cc."createdAt" ASC
    `);

    let activated = 0;
    const failures: Array<{ partyType: 'STUDENT' | 'COLLABORATOR'; linkId: string; error: string }> = [];

    for (const candidate of studentCandidates) {
      try {
        const result = await prisma.$transaction((tx) =>
          prepareOrActivateStudentContractInTransaction(tx, candidate.id, now)
        );
        if (result.reason === 'activated') activated += 1;
      } catch (error) {
        failures.push({
          partyType: 'STUDENT',
          linkId: candidate.id,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    for (const candidate of collaboratorCandidates) {
      try {
        const result = await prisma.$transaction((tx) =>
          prepareOrActivateCollaboratorContractInTransaction(tx, candidate.id, now)
        );
        if (result.reason === 'activated') activated += 1;
      } catch (error) {
        failures.push({
          partyType: 'COLLABORATOR',
          linkId: candidate.id,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    return {
      checked: studentCandidates.length + collaboratorCandidates.length,
      activated,
      failures,
    };
  },
'''
new = '''  async activateDueSignedContracts(now = new Date()) {
    const studentCycle = await prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>(Prisma.sql`
          SELECT pg_try_advisory_xact_lock(
            CAST(${STUDENT_SCHEDULER_LOCK_ID} AS bigint)
          ) AS "acquired"
        `);
        if (!lock?.acquired) {
          return {
            checked: 0,
            activated: 0,
            failures: [] as Array<{
              partyType: 'STUDENT';
              linkId: string;
              error: string;
            }>,
          };
        }

        const studentCandidates = await tx.studentContract.findMany({
          where: {
            status: 'pending_signature',
            signedAt: { not: null },
            startDate: { lte: now },
            contract: { status: 'SIGNED' },
          },
          select: { id: true },
          orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
        });
        let activated = 0;
        const failures: Array<{
          partyType: 'STUDENT';
          linkId: string;
          error: string;
        }> = [];

        for (const candidate of studentCandidates) {
          try {
            const result = await prepareOrActivateStudentContractInTransaction(
              tx,
              candidate.id,
              now
            );
            if (result.reason === 'activated') activated += 1;
          } catch (error) {
            failures.push({
              partyType: 'STUDENT',
              linkId: candidate.id,
              error: error instanceof Error ? error.message : 'Erro desconhecido',
            });
          }
        }

        return {
          checked: studentCandidates.length,
          activated,
          failures,
        };
      },
      { timeout: 30_000 }
    );

    const collaboratorCandidates = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT cc."id"
      FROM "CollaboratorContract" cc
      JOIN "GeneratedContract" gc ON gc."id" = cc."contractId"
      WHERE cc."status" = 'pending_signature'::"CollaboratorContractStatus"
        AND cc."signedAt" IS NOT NULL
        AND cc."startDate" <= ${now}
        AND gc."status" = 'SIGNED'::"ContractStatus"
      ORDER BY cc."startDate" ASC, cc."createdAt" ASC
    `);

    let activated = studentCycle.activated;
    const failures: Array<{
      partyType: 'STUDENT' | 'COLLABORATOR';
      linkId: string;
      error: string;
    }> = [...studentCycle.failures];

    for (const candidate of collaboratorCandidates) {
      try {
        const result = await prisma.$transaction((tx) =>
          prepareOrActivateCollaboratorContractInTransaction(tx, candidate.id, now)
        );
        if (result.reason === 'activated') activated += 1;
      } catch (error) {
        failures.push({
          partyType: 'COLLABORATOR',
          linkId: candidate.id,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    return {
      checked: studentCycle.checked + collaboratorCandidates.length,
      activated,
      failures,
    };
  },
'''
if old not in source:
    raise SystemExit('Scheduler block not found')
path.write_text(source.replace(old, new, 1))
