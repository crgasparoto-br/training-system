import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { assertTenantPageScanIsProportional } from '../scripts/issue-275-performance-proportionality.js';

const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const prisma = new PrismaClient();

function planNodes(root: Record<string, unknown>): Record<string, unknown>[] {
  const result = [root];
  const children = root.Plans;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        result.push(...planNodes(child as Record<string, unknown>));
      }
    }
  }
  return result;
}

describeDatabase('Issue 275 tenant-scoped pre-registration list plan', () => {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let contractId = '';

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `issue-275-list-plan-${suffix}`,
        name: 'Academia Issue 275 List Plan',
      },
    });
    contractId = contract.id;

    const orderingBase = Date.now();
    await prisma.aluno.createMany({
      data: [
        ...Array.from({ length: 2_000 }, (_, index) => ({
          contractId,
          status: 'ACTIVE_STUDENT' as const,
          leadName: `Aluno ativo ${index}`,
          lastActivityAt: new Date(orderingBase - index * 1000),
        })),
        ...Array.from({ length: 2_000 }, (_, index) => ({
          contractId,
          status: index % 2 === 0 ? ('LEAD' as const) : ('INVITED' as const),
          leadName: `Pré-matrícula ${index}`,
          lastActivityAt: new Date(orderingBase - (2_000 + index) * 1000),
        })),
      ],
    });
    await prisma.$executeRawUnsafe('ANALYZE "Aluno"');
  });

  afterAll(async () => {
    if (contractId) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('uses the partial ordering index and does not scan active students first', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': unknown }>>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT "id", "status"
       FROM "Aluno"
       WHERE "contractId" = $1
         AND "status" <> 'ACTIVE_STUDENT'
       ORDER BY "lastActivityAt" DESC, "id" DESC
       LIMIT 20`,
      contractId
    );
    const value = rows[0]?.['QUERY PLAN'];
    expect(Array.isArray(value)).toBe(true);
    const root = (value as Array<Record<string, unknown>>)[0]?.Plan as
      | Record<string, unknown>
      | undefined;
    expect(root).toBeDefined();

    const nodes = planNodes(root!);
    const alunoNodes = nodes.filter((node) => node['Relation Name'] === 'Aluno');
    expect(alunoNodes.length).toBeGreaterThan(0);
    expect(
      nodes.some((node) => node['Index Name'] === 'Aluno_pre_registration_list_idx')
    ).toBe(true);

    const scannedRows = Math.max(
      ...alunoNodes.map(
        (node) =>
          Number(node['Actual Rows'] ?? 0) + Number(node['Rows Removed by Filter'] ?? 0)
      )
    );
    const [tenantCandidateRows, tenantTotalRows] = await Promise.all([
      prisma.aluno.count({
        where: { contractId, status: { not: 'ACTIVE_STUDENT' } },
      }),
      prisma.aluno.count({ where: { contractId } }),
    ]);

    expect(tenantCandidateRows).toBe(2_000);
    expect(tenantTotalRows).toBe(4_000);
    expect(() =>
      assertTenantPageScanIsProportional({
        pageSize: 20,
        scannedRows,
        tenantCandidateRows,
      })
    ).not.toThrow();
  });
});
