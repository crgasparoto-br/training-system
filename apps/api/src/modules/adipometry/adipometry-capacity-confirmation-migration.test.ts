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
    expect(sql).toContain('BEFORE UPDATE ON "AdipometryAssessment"');
    expect(sql).toContain('ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE');
    expect(sql).toContain('professor."contractId" = NEW."contractId"');
    expect(sql).toContain('app_user."isActive" = TRUE');
    expect(sql).toContain('collaborator_function."isActive" = TRUE');
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF "professorId", "contractId"');
  });
});
