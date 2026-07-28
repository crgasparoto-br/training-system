import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONSOLIDATION_BLOCKING_OWNERSHIP_RELATIONS,
  CONSOLIDATION_PRESERVED_SOURCE_HISTORY_RELATIONS,
} from '../src/modules/pre-registration-enrollment/pre-registration-clinical-ownership.service.js';

const root = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read(
  'apps/api/prisma/migrations/20260728081500_issue_274_clinical_ownership_guard/migration.sql'
);
const schema = read('apps/api/prisma/schema.prisma');

const expectedOwnership = {
  agendaBookings: 'AgendaBooking',
  anthropometryAssessments: 'AnthropometryAssessment',
  exerciseProgress: 'AlunoExerciseProgress',
  intakeForm: 'AlunoIntakeForm',
  assessmentPlanItems: 'AlunoAssessmentPlanItem',
  assessments: 'Assessment',
  contracts: 'Contract',
  studentContracts: 'StudentContract',
  fixedSlots: 'FixedScheduleSlot',
  integrations: 'Integration',
  macronutrients: 'Macronutrients',
  nutritionPlans: 'NutritionPlan',
  progressMetrics: 'ProgressMetric',
  executions: 'TrainingExecution',
  trainingPlans: 'TrainingPlan',
  workoutExecutions: 'WorkoutExecution',
  studentHealthIntake: 'StudentHealthIntake',
  studentAssessmentRecords: 'StudentAssessmentRecord',
  studentFinancialProfile: 'StudentFinancialProfile',
  studentExternalAccounts: 'StudentExternalAccount',
  studentExternalActivities: 'StudentExternalActivity',
  parqSubmissions: 'StudentParqSubmission',
  parqDraft: 'StudentParqDraft',
  parqProfessionalReviews: 'StudentParqProfessionalReview',
  parqLegacyRecords: 'StudentParqLegacyRecord',
  prontuarioRecords: 'ProntuarioRecord',
  prontuarioDiscomfortSnapshots: 'ProntuarioDiscomfortSnapshot',
} as const;

const expectedPreservedSourceHistory = [
  'studentProfile',
  'profileReviewSettings',
  'profileReviews',
  'profileAuditLogs',
  'onboarding',
  'lifecycleEvents',
  'preRegistrationInvites',
  'guardianAuthorizations',
] as const;

describe('issue 274 consolidation ownership contract', () => {
  it('keeps the typed preflight inventory aligned with the database trigger', () => {
    expect([...CONSOLIDATION_BLOCKING_OWNERSHIP_RELATIONS].sort()).toEqual(
      Object.keys(expectedOwnership).sort()
    );

    for (const [relation, model] of Object.entries(expectedOwnership)) {
      expect(schema).toContain(`${relation}`);
      expect(schema).toContain(`model ${model} `);
      expect(migration).toContain(`FROM "${model}" WHERE "alunoId" = NEW."id"`);
    }
  });

  it('keeps process and audit relations explicitly classified as source history', () => {
    expect([...CONSOLIDATION_PRESERVED_SOURCE_HISTORY_RELATIONS].sort()).toEqual(
      [...expectedPreservedSourceHistory].sort()
    );
    for (const relation of expectedPreservedSourceHistory) {
      expect(schema).toContain(relation);
      expect(CONSOLIDATION_BLOCKING_OWNERSHIP_RELATIONS).not.toContain(relation);
    }
  });

  it('guards the actual duplicate-discard transition instead of only the later link update', () => {
    expect(migration).toContain(`NEW."status" = 'DISCARDED'`);
    expect(migration).toContain(`COALESCE(NEW."discardReason", '') LIKE 'DUPLICATE_OF:%'`);
    expect(migration).toContain('BEFORE UPDATE OF "status", "discardReason", "canonicalAlunoId"');
    expect(migration).toContain("RAISE EXCEPTION 'CLINICAL_REASSOCIATION_REQUIRED'");
  });
});
