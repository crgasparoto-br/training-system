import fs from 'fs';
import path from 'path';

const migrationRelativePath = path.join(
  'prisma',
  'migrations',
  '20260720213000_issue_263_generalize_contract_parties',
  'migration.sql'
);

const resolveMigrationPath = () => {
  const packagePath = path.resolve(process.cwd(), migrationRelativePath);
  if (fs.existsSync(packagePath)) return packagePath;
  return path.resolve(process.cwd(), 'apps', 'api', migrationRelativePath);
};

const migration = fs.readFileSync(resolveMigrationPath(), 'utf8');

describe('issue 263 collaborator contract migration', () => {
  it('represents exactly one typed party on generated documents', () => {
    expect(migration).toContain('"GeneratedContract_exactly_one_party_check"');
    expect(migration).toContain('"partyType" = \'STUDENT\'');
    expect(migration).toContain('"partyType" = \'COLLABORATOR\'');
    expect(migration).toContain('"collaboratorId" IS NOT NULL');
  });

  it('enforces one active contract per student and per collaborator', () => {
    expect(migration).toContain('"StudentContract_one_active_per_aluno_key"');
    expect(migration).toContain('"CollaboratorContract_one_active_per_collaborator_key"');
    expect(migration.match(/WHERE "status" = 'active'/gu)).toHaveLength(3);
  });

  it('protects tenant, template and party combinations in the database', () => {
    expect(migration).toContain('validate_generated_contract_party');
    expect(migration).toContain('Template and generated contract must belong to the same tenant');
    expect(migration).toContain('Student and generated contract must belong to the same tenant');
    expect(migration).toContain('Collaborator and generated contract must belong to the same tenant');
    expect(migration).toContain('validate_student_contract_document_party');
    expect(migration).toContain('validate_collaborator_contract_document_party');
  });

  it('backfills legacy records idempotently without creating electronic evidence', () => {
    expect(migration).toContain('ON CONFLICT ("legacySourceKey") DO UPDATE');
    expect(migration).toContain("'LEGACY_PDF'");
    expect(migration).toContain("'LEGACY_DECLARATION'");
    expect(migration).not.toMatch(/INSERT INTO "ContractSignature"/u);
    expect(migration).not.toMatch(/"publicTokenHash"/u);
    expect(migration).not.toMatch(/"documentHash"/u);
  });

  it('keeps legacy records outside the electronic lifecycle', () => {
    expect(migration).toContain('"CollaboratorContract_origin_shape_check"');
    expect(migration).toContain('"origin" = \'ELECTRONIC\' AND "contractId" IS NOT NULL');
    expect(migration).toContain('"status" = \'legacy\'');
  });
});
