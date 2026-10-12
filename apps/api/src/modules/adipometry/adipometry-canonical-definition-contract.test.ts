import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertAdipometryProtocolDefinitionSnapshot,
  type AdipometryProtocolApprovalSnapshot,
} from '@corrida/types';

interface PersistedCalculationSnapshotProbe {
  protocolApproval?: {
    id?: unknown;
    protocolReference?: unknown;
    protocolDefinitionSnapshot?: unknown;
  };
}

function readClinicalGovernanceMigration(): string {
  return readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260730224500_add_adipometry_clinical_governance/migration.sql'
    ),
    'utf8'
  );
}

function readCanonicalGuedesDefinition(): unknown {
  const migration = readClinicalGovernanceMigration();
  const match = migration.match(/\$guedes\$(\{.*\})\$guedes\$::JSONB/);
  if (!match?.[1]) {
    throw new Error('canonical GUEDES_1991_ADULT_YOUNG definition not found');
  }
  return JSON.parse(match[1]) as unknown;
}

function readAdipometryMigrationCorpus(): string {
  const migrationsRoot = join(process.cwd(), 'prisma/migrations');
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const migrationPath = join(migrationsRoot, name, 'migration.sql');
      try {
        return readFileSync(migrationPath, 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

function readPersistedCalculationSnapshot(): PersistedCalculationSnapshotProbe {
  const path = process.env.ADIPOMETRY_PERSISTED_SNAPSHOT_PATH;
  if (!path) {
    throw new Error('ADIPOMETRY_PERSISTED_SNAPSHOT_PATH is required for the persisted snapshot control');
  }
  return JSON.parse(readFileSync(path, 'utf8')) as PersistedCalculationSnapshotProbe;
}

const persistedSnapshotTest = process.env.ADIPOMETRY_PERSISTED_SNAPSHOT_PATH ? it : it.skip;

describe('canonical adipometry definition contract', () => {
  it('accepts the persisted schema v3 candidate without embedded contract approval', () => {
    const definition = readCanonicalGuedesDefinition();

    assertAdipometryProtocolDefinitionSnapshot(definition);

    expect(definition.schemaVersion).toBe(3);
    expect('clinicalApproval' in definition).toBe(false);

    const approvalSnapshot = {
      id: 'approval-contract-1',
      responsibilityId: 'responsibility-contract-1',
      approvedAt: '2026-08-01T19:35:00.000Z',
      approvedByProfessorId: 'professor-contract-1',
      approvedByName: 'Responsável clínico',
      approvedByCref: 'CREF-000001-G/SP',
      approvedSpecificationHash: 'a'.repeat(64),
      protocolReference: '10.5433/1679-0367.1991v12n2p61',
      protocolDefinitionSnapshot: definition,
    } satisfies AdipometryProtocolApprovalSnapshot;

    expect(approvalSnapshot.protocolDefinitionSnapshot.schemaVersion).toBe(3);
  });

  it('locks the reconciled Guedes clinical definition and canonical vectors', () => {
    const definition = readCanonicalGuedesDefinition();
    const migration = readClinicalGovernanceMigration();

    assertAdipometryProtocolDefinitionSnapshot(definition);

    expect(migration).toContain("'GUEDES_1991_ADULT_YOUNG'");
    expect(migration).toContain("'DRAFT'");
    expect(migration).toContain('10.5433/1679-0367.1991v12n2p61');
    expect(migration).toContain('CREATE TABLE "AdipometryProtocolApproval"');

    expect(definition.population).toMatchObject({
      ageMinYears: 18,
      ageMaxYears: 30,
      sexCriteria: ['MALE', 'FEMALE'],
      maturationRule: { mode: 'NOT_REQUIRED' },
    });
    expect(definition.calculationSkinfoldsBySex).toEqual({
      MALE: ['tricepsMm', 'suprailiacMm', 'abdominalMm'],
      FEMALE: ['subscapularMm', 'suprailiacMm', 'thighMm'],
    });
    expect(definition.inputUnits).toMatchObject({
      weightKg: 'kg',
      tricepsMm: 'mm',
      subscapularMm: 'mm',
      suprailiacMm: 'mm',
      abdominalMm: 'mm',
      thighMm: 'mm',
    });
    expect(definition.inputScales).toMatchObject({
      weightKg: 2,
      tricepsMm: 1,
      subscapularMm: 1,
      suprailiacMm: 1,
      abdominalMm: 1,
      thighMm: 1,
    });
    expect(definition.limits.blocking).toMatchObject({
      weightKg: { min: 0.01, max: 999.99 },
      tricepsMm: { min: 0.1, max: 80 },
      subscapularMm: { min: 0.1, max: 80 },
      suprailiacMm: { min: 0.1, max: 80 },
      abdominalMm: { min: 0.1, max: 80 },
      thighMm: { min: 0.1, max: 80 },
    });
    expect(definition.precision).toMatchObject({
      resultScale: 2,
      internalScale: 8,
      skinfoldTotalScale: 1,
      bodyDensityScale: 8,
    });
    expect(definition.rounding).toEqual({
      mode: 'HALF_UP',
      stage: 'FINAL_RESULTS_ONLY',
    });

    const vectors = Object.fromEntries(definition.testVectors.map((vector) => [vector.id, vector]));
    expect(vectors['male-25-50mm']?.expectedResults).toEqual({
      skinfoldTotalMm: 50,
      bodyFatPercentage: 18.12,
      fatMassKg: 14.49,
      leanMassKg: 65.51,
    });
    expect(vectors['female-27-60mm']?.expectedResults).toEqual({
      skinfoldTotalMm: 60,
      bodyFatPercentage: 25.55,
      fatMassKg: 16.6,
      leanMassKg: 48.4,
    });
    expect(vectors['male-half-up-87.3mm']?.expectedResults).toEqual({
      skinfoldTotalMm: 87.3,
      bodyFatPercentage: 25.42,
      fatMassKg: 17.79,
      leanMassKg: 52.21,
    });
  });

  it('keeps Slaughter disabled while its definition is incomplete', () => {
    const statements = readAdipometryMigrationCorpus()
      .split(';')
      .filter((statement) => statement.includes("'SLAUGHTER'"));

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("'Slaughter', 'DISABLED'");
    expect(statements[0]).toContain('Variants and applicability criteria are incomplete');
  });
  persistedSnapshotTest('validates the actual PostgreSQL completion snapshot at the runtime boundary', () => {
    const snapshot = readPersistedCalculationSnapshot();
    const approval = snapshot.protocolApproval;

    expect(approval?.id).toBe('issue246-a09-a10-approval');
    expect(approval?.protocolReference).toContain('10.5433/1679-0367.1991v12n2p61');

    const definition = approval?.protocolDefinitionSnapshot;
    assertAdipometryProtocolDefinitionSnapshot(definition);

    expect(definition.schemaVersion).toBe(3);
    expect('clinicalApproval' in definition).toBe(false);
  });

  it('rejects malformed JSON before it reaches the shared snapshot contract', () => {
    expect(() =>
      assertAdipometryProtocolDefinitionSnapshot({
        schemaVersion: 3,
        population: null,
      })
    ).toThrow('population must be an object');
  });
});
