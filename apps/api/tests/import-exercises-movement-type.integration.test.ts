import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ContractType, PrismaClient } from '@prisma/client';

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const contractId = 'issue-426-import-movement-types';
const importedNames = {
  alternating: 'Auditoria Movimento Alternado',
  unsupportedB: 'Auditoria Movimento B',
  unsupportedDash: 'Auditoria Movimento Traco',
};

async function cleanupFixtures() {
  await prisma.exerciseLibrary.deleteMany({ where: { contractId } });
  await prisma.companyContract.deleteMany({ where: { id: contractId } });
}

describeDatabase('import-exercises movementType', () => {
  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('aceita A e persiste B e - como ausentes, sem coerção silenciosa', async () => {
    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: '42600000000001',
        name: 'Contrato teste importação movementType',
      },
    });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-426-import-'));
    const fixturePath = path.join(tempDir, 'exercises.json');
    fs.writeFileSync(
      fixturePath,
      JSON.stringify([
        { name: importedNames.alternating, movementType: 'A' },
        { name: importedNames.unsupportedB, movementType: 'B' },
        { name: importedNames.unsupportedDash, movementType: '-' },
      ]),
      'utf8'
    );

    const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const result = spawnSync(
      pnpmCommand,
      ['exec', 'tsx', 'src/scripts/import-exercises.ts', fixturePath],
      {
        cwd: process.cwd(),
        env: { ...process.env, CONTRACT_ID: contractId },
        encoding: 'utf8',
      }
    );

    try {
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    const imported = await prisma.exerciseLibrary.findMany({
      where: {
        contractId,
        name: { in: Object.values(importedNames) },
      },
      select: { name: true, movementType: true },
    });
    const movementByName = new Map(imported.map((item) => [item.name, item.movementType]));

    expect(movementByName.get(importedNames.alternating)).toBe('A');
    expect(movementByName.get(importedNames.unsupportedB)).toBeNull();
    expect(movementByName.get(importedNames.unsupportedDash)).toBeNull();
  });
});
