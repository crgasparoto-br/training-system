import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLINICAL_CONSOLIDATION_OWNERSHIP_RELATIONS } from '../src/modules/pre-registration-enrollment/pre-registration-clinical-ownership.service.js';

const root = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read(
  'apps/api/prisma/migrations/20260728081500_issue_274_clinical_ownership_guard/migration.sql'
);
const schema = read('apps/api/prisma/schema.prisma');

const expectedOwnership = {
  intakeForm: 'AlunoIntakeForm',
  studentHealthIntake: 'StudentHealthIntake',
  parqDraft: 'StudentParqDraft',
  parqSubmissions: 'StudentParqSubmission',
  parqProfessionalReviews: 'StudentParqProfessionalReview',
  parqLegacyRecords: 'StudentParqLegacyRecord',
  prontuarioRecords: 'ProntuarioRecord',
  prontuarioDiscomfortSnapshots: 'ProntuarioDiscomfortSnapshot',
  studentAssessmentRecords: 'StudentAssessmentRecord',
  assessments: 'Assessment',
  anthropometryAssessments: 'AnthropometryAssessment',
  assessmentPlanItems: 'AlunoAssessmentPlanItem',
  progressMetrics: 'ProgressMetric',
  macronutrients: 'Macronutrients',
  nutritionPlans: 'NutritionPlan',
} as const;

describe('issue 274 clinical ownership contract', () => {
  it('keeps the typed preflight inventory aligned with the database trigger', () => {
    expect([...CLINICAL_CONSOLIDATION_OWNERSHIP_RELATIONS].sort()).toEqual(
      Object.keys(expectedOwnership).sort()
    );

    for (const [relation, model] of Object.entries(expectedOwnership)) {
      expect(schema).toContain(`${relation}`);
      expect(schema).toContain(`model ${model} `);
      expect(migration).toContain(`FROM "${model}" WHERE "alunoId" = NEW."id"`);
    }
  });

  it('guards the actual duplicate-discard transition instead of only the later link update', () => {
    expect(migration).toContain(`NEW."status" = 'DISCARDED'`);
    expect(migration).toContain(`COALESCE(NEW."discardReason", '') LIKE 'DUPLICATE_OF:%'`);
    expect(migration).toContain('BEFORE UPDATE OF "status", "discardReason", "canonicalAlunoId"');
    expect(migration).toContain("RAISE EXCEPTION 'CLINICAL_REASSOCIATION_REQUIRED'");
  });
});
