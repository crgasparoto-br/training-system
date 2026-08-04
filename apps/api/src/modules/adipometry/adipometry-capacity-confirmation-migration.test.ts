import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('adipometry capacity confirmation migration', () => {
  const readMigration = () => readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260804193000_invalidate_adipometry_capacity_confirmation/migration.sql'
    ),
    'utf8'
  );

  it('invalida confirmação persistida quando qualquer entrada clínica muda', () => {
    const sql = readMigration();

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

  it('mantém a elegibilidade do responsável bloqueada durante toda mutação clínica', () => {
    const sql = readMigration();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION "assertAdipometryResponsibleProfessorAvailable"');
    expect(sql).toContain('RETURNS BOOLEAN');
    expect(sql).toContain('RETURN TRUE;');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = pg_catalog, public');
    expect(sql).toContain('professor."contractId" = p_contract_id');
    expect(sql).toContain('app_user."isActive" = TRUE');
    expect(sql).toContain('collaborator_function."isActive" = TRUE');
    expect(sql).toContain('FOR SHARE OF professor, app_user, collaborator_function');
    expect(sql).toContain('FROM "AccessPermission" screen_permission');
    expect(sql).toContain('screen_permission."blockKey" = \'\'');
    expect(sql).toContain('FROM "AccessPermission" manage_permission');
    expect(sql).toContain(
      'manage_permission."blockKey" = \'physicalAssessment.adpt.actions.manage\''
    );
    expect(sql.match(/FOR SHARE;/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain('ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE');
    expect(sql).toContain('BEFORE INSERT OR UPDATE ON "AdipometryAssessment"');
  });
});
