from pathlib import Path
import re

ROOT = Path.cwd()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)

path = ROOT / "apps/api/tests/legacy-collaborator-contract.middleware.test.ts"
text = path.read_text().replace("import { describe, expect, it, vi } from 'vitest';\n", "")
path.write_text(text.replace("vi.fn()", "jest.fn()"))

path = ROOT / "apps/api/tests/collaborator-contract-migration.contract.test.ts"
path.write_text(path.read_text().replace(
    "    expect(migration.match(/WHERE \"status\" = 'active'/gu)).toHaveLength(3);\n",
    "    expect(migration.match(/WHERE \"status\" = 'active'/gu)).toHaveLength(2);\n",
))

path = ROOT / "apps/api/tests/collaborator-contract-lifecycle.integration.test.ts"
text = path.read_text()
text = text.replace(
    "import { studentContractLifecycleService } from '../src/modules/student-contracts/student-contract-lifecycle.service.js';",
    "import { studentContractLifecycleService } from '../src/modules/student-contracts/student-contract-lifecycle.service.js';\n"
    "import { collaboratorContractService } from '../src/modules/contracts/collaborator-contract.service.js';",
)
cleanup = """async function cleanupFixtures() {
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "CollaboratorContract"
    WHERE "collaboratorId" IN (
      SELECT "id" FROM "Professor"
      WHERE "contractId" IN (${companyContractId}, ${otherCompanyContractId})
    )
  `);
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "GeneratedContract"
    WHERE "companyContractId" IN (${companyContractId}, ${otherCompanyContractId})
  `);
  await prisma.companyContract.deleteMany({
    where: { id: { in: [companyContractId, otherCompanyContractId] } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: emailPrefix } },
  });
}

"""
text = replace_once(
    text,
    "describeDatabase('collaborator contract lifecycle with PostgreSQL', () => {",
    cleanup + "describeDatabase('collaborator contract lifecycle with PostgreSQL', () => {",
    "cleanup helper",
)
text = re.sub(
    r"  beforeEach\(async \(\) => \{\n    sequence = 0;\n    await prisma\.companyContract\.deleteMany\(\{.*?\n  \}\);",
    "  beforeEach(async () => {\n    sequence = 0;\n    await cleanupFixtures();\n  });",
    text,
    count=1,
    flags=re.S,
)
text = re.sub(
    r"  afterEach\(async \(\) => \{\n    await prisma\.companyContract\.deleteMany\(\{.*?\n  \}\);",
    """  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "test_delay_collaborator_signature_claim" ON "GeneratedContract"'
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS "test_delay_collaborator_signature_claim_update"()'
    );
    await cleanupFixtures();
  });""",
    text,
    count=1,
    flags=re.S,
)
text = text.replace(
    "    await prisma.companyContract.delete({ where: { id: companyContractId } });\n"
    "    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });",
    "    await cleanupFixtures();",
)
text = replace_once(
    text,
    """    expect(rejectedLifecycle.links.find((item) => item.id === rejectedFixture.candidateLinkId)?.status)
      .toBe('canceled');
    expect(rejectedLifecycle.links.filter((item) => item.status === 'active')).toHaveLength(1);

    await cleanupFixtures();""",
    """    expect(rejectedLifecycle.links.find((item) => item.id === rejectedFixture.candidateLinkId)?.status)
      .toBe('canceled');
    expect(rejectedLifecycle.links.filter((item) => item.status === 'active')).toHaveLength(1);
    const rejectedSummary = await collaboratorContractService.summary(
      companyContractId,
      rejectedFixture.collaborator.id
    );
    const rejectedCandidate = rejectedSummary.history.find(
      (item) => item.id === rejectedFixture.candidateLinkId
    );
    expect(rejectedCandidate?.rejectedAt).toBeInstanceOf(Date);
    expect(rejectedCandidate?.rejectionReason).toBe('Não concordo com as condições');

    await cleanupFixtures();""",
    "rejection summary assertions",
)
race = """
  it('allows only the signature to win against a concurrent collaborator rejection', async () => {
    const fixture = await createFixture();

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "test_delay_collaborator_signature_claim_update"()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."id" = '${fixture.candidateDocumentId}' AND NEW."status" = 'SIGNED' THEN
          PERFORM pg_sleep(0.4);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "test_delay_collaborator_signature_claim"
      BEFORE UPDATE ON "GeneratedContract"
      FOR EACH ROW EXECUTE FUNCTION "test_delay_collaborator_signature_claim_update"()
    `);

    const signing = studentContractLifecycleService.signPublicContract(
      fixture.token,
      { signerName: 'Colaborador Teste', signerCpf: '12345678901' }
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const rejecting = request(app)
      .post(`/contracts/public/${fixture.token}/reject`)
      .send({ reason: 'Recusa concorrente' });

    const [signatureResult, rejectionResponse] = await Promise.all([signing, rejecting]);
    const [document, lifecycle, rejectionAuditCount] = await Promise.all([
      prisma.contract.findUniqueOrThrow({ where: { id: fixture.candidateDocumentId } }),
      readLifecycle(fixture.collaborator.id),
      prisma.contractAuditLog.count({
        where: {
          contractId: fixture.candidateDocumentId,
          action: 'UPDATED',
          details: { path: ['kind'], equals: 'STUDENT_REJECTION' },
        },
      }),
    ]);

    expect(signatureResult.activation.partyType).toBe('COLLABORATOR');
    expect([400, 404]).toContain(rejectionResponse.status);
    expect(rejectionResponse.body.error).toBe('Link inválido ou já utilizado');
    expect(document.status).toBe('SIGNED');
    expect(document.publicTokenHash).toBeNull();
    expect(lifecycle.professor?.currentCollaboratorContractId).toBe(fixture.candidateLinkId);
    expect(lifecycle.links.filter((item) => item.status === 'active')).toHaveLength(1);
    expect(rejectionAuditCount).toBe(0);
  });

"""
text = replace_once(
    text,
    "  it('rejects template and collaborator combinations from different tenants', async () => {",
    race + "  it('rejects template and collaborator combinations from different tenants', async () => {",
    "collaborator sign-reject race",
)
path.write_text(text)
