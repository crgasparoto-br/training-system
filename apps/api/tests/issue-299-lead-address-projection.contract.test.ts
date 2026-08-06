import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'prisma/migrations/20260806165000_issue_299_project_lead_address/migration.sql'
);

const migration = readFileSync(migrationPath, 'utf8');

describe('issue #299 address projection migration', () => {
  it('projeta todos os campos do endereço canônico no Profile legado', () => {
    for (const field of [
      'addressStreet',
      'addressNumber',
      'addressComplement',
      'addressNeighborhood',
      'addressCity',
      'addressState',
      'addressZipCode',
    ]) {
      expect(migration).toContain(`"${field}"`);
      expect(migration).toContain(`->>'${field}'`);
    }
  });

  it('restringe o backfill a alunos ativos com vínculo de conta unívoco', () => {
    expect(migration).toContain('student."status" = \'ACTIVE_STUDENT\'');
    expect(migration).toContain('student."userId" IS NOT NULL');
    expect(migration).toContain('linked_student."userId" = student."userId"');
    expect(migration).toMatch(/SELECT COUNT\(\*\)[\s\S]*?\) = 1;/);
  });

  it('lê StudentProfile como origem sem alterar a identidade canônica', () => {
    expect(migration).toContain('JOIN "StudentProfile" AS canonical_profile');
    expect(migration).not.toMatch(/UPDATE\s+"StudentProfile"/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+"StudentProfile"/i);
  });
});
