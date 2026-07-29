import { PrismaClient } from '@prisma/client';

const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const prisma = new PrismaClient();

describeDatabase('Issue 275 assessment plan migration compatibility', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exposes lastAssessmentAt in a database created only from migrations', async () => {
    const result = await prisma.alunoAssessmentPlanItem.findFirst({
      select: { lastAssessmentAt: true },
    });

    expect(result === null || Object.prototype.hasOwnProperty.call(result, 'lastAssessmentAt')).toBe(
      true
    );
  });
});
