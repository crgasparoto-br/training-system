import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('adipometry capacity confirmation migration', () => {
  it('invalida confirmação persistida quando qualquer entrada clínica muda', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20260804193000_invalidate_adipometry_capacity_confirmation/migration.sql'
      ),
      'utf8'
    );

    for (const column of [
      'assessmentDate',
      'weightKg',
      'tricepsMm',
      'subscapularMm',
      'suprailiacMm',
      'abdominalMm',
      'thighMm',
      'protocolCode',
      'protocolVersion',
      'protocolSex',
      'protocolSexSource',
      'protocolSexOverrideReason',
      'anthropometryAssessmentId',
      'notes',
    ]) {
      expect(sql).toContain(`NEW."${column}" IS DISTINCT FROM OLD."${column}"`);
    }

    expect(sql).toContain('NEW."skinfoldCapacityWarningConfirmedByUserId" := NULL');
    expect(sql).toContain('NEW."skinfoldCapacityWarningConfirmedAt" := NULL');
    expect(sql).toContain('to_regclass(\'"AdipometryAssessment"\') IS NOT NULL');
    expect(sql).toContain('BEFORE UPDATE ON "AdipometryAssessment"');
  });

  it('revalida de forma transacional a elegibilidade completa do responsável', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20260804193000_invalidate_adipometry_capacity_confirmation/migration.sql'
      ),
      'utf8'
    );

    expect(sql).toContain('ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE');
    expect(sql).toContain('professor."contractId" = NEW."contractId"');
    expect(sql).toContain('app_user."isActive" = TRUE');
    expect(sql).toContain('collaborator_function."isActive" = TRUE');
    expect(sql).toContain("LOWER(professor.\"role\"::text) = 'master'");
    expect(sql).toContain('FROM "AccessPermission" screen_permission');
    expect(sql).toContain('screen_permission."blockKey" = \'\'');
    expect(sql).toContain('FROM "AccessPermission" manage_permission');
    expect(sql).toContain(
      'manage_permission."blockKey" = \'physicalAssessment.adpt.actions.manage\''
    );
    expect(sql).toContain('AND to_regclass(\'"AccessPermission"\') IS NOT NULL');
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF "professorId", "contractId"');
  });
});
