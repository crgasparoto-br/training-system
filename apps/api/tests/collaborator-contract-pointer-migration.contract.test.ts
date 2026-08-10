import fs from 'fs';
import path from 'path';

const migrationRelativePath = path.join(
  'prisma',
  'migrations',
  '20260720224500_issue_263_contract_pointer_integrity',
  'migration.sql'
);

const resolveMigrationPath = () => {
  const packagePath = path.resolve(process.cwd(), migrationRelativePath);
  if (fs.existsSync(packagePath)) return packagePath;
  return path.resolve(process.cwd(), 'apps', 'api', migrationRelativePath);
};

const migration = fs.readFileSync(resolveMigrationPath(), 'utf8');

describe('issue 263 collaborator current contract pointer integrity', () => {
  it('preserves collaborator contract history when a professor deletion is attempted', () => {
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(migration).toContain('"GeneratedContract_collaboratorId_fkey"');
    expect(migration).toContain('"CollaboratorContract_collaboratorId_fkey"');
  });

  it('requires the current pointer to reference the same collaborator and an active link', () => {
    expect(migration).toContain('validate_professor_current_collaborator_contract');
    expect(migration).toContain('cc."collaboratorId" = NEW."id"');
    expect(migration).toContain('cc."status" = \'active\'');
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
  });

  it('prevents one current contract pointer from being shared by two collaborators', () => {
    expect(migration).toContain('"Professor_currentCollaboratorContractId_key"');
    expect(migration).toContain('WHERE "currentCollaboratorContractId" IS NOT NULL');
  });
});
