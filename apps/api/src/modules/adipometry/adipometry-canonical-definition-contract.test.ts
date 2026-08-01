import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertAdipometryProtocolDefinitionSnapshot,
  type AdipometryProtocolApprovalSnapshot,
} from '@corrida/types';

function readCanonicalGuedesDefinition(): unknown {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260730224500_add_adipometry_clinical_governance/migration.sql'
    ),
    'utf8'
  );
  const match = migration.match(/\$guedes\$(\{.*\})\$guedes\$::JSONB/);
  if (!match?.[1]) {
    throw new Error('canonical GUEDES_1991_ADULT_YOUNG definition not found');
  }
  return JSON.parse(match[1]) as unknown;
}

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

  it('rejects malformed JSON before it reaches the shared snapshot contract', () => {
    expect(() =>
      assertAdipometryProtocolDefinitionSnapshot({
        schemaVersion: 3,
        population: null,
      })
    ).toThrow('population must be an object');
  });
});
