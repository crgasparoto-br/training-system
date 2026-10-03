import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluatePreWorkoutCheckInRules } from '../src/modules/workout/pre-workout-check-in.service.js';

describe('pre-workout check-in rules (#388)', () => {
  it.each([
    [0, 'green'],
    [2, 'green'],
    [3, 'attention'],
    [4, 'attention'],
    [5, 'alert'],
    [9, 'alert'],
  ])('aplica somente a triagem canônica de dor %s', (painLevel, expected) => {
    const result = evaluatePreWorkoutCheckInRules(painLevel);
    expect(result.painTriage).toBe(expected);
    expect(result.blocksWorkout).toBe(false);
    expect(result.changesWorkoutAutomatically).toBe(false);
  });

  it('mantém schema Prisma e migrations alinhados com as FKs canônicas do check-in', () => {
    const schemas = [
      resolve(__dirname, '../prisma/schema.prisma'),
      resolve(__dirname, '../../../prisma/schema.prisma'),
    ].map((file) => readFileSync(file, 'utf8'));
    const migrations = [
      resolve(__dirname, '../prisma/migrations/20261002223000_issue_388_pre_workout_check_in/migration.sql'),
      resolve(__dirname, '../../../prisma/migrations/20261002223000_issue_388_pre_workout_check_in/migration.sql'),
    ].map((file) => readFileSync(file, 'utf8'));

    for (const schema of schemas) {
      const model = schema.match(/model PreWorkoutCheckIn \{[\s\S]*?\n\}/)?.[0] ?? '';
      expect(model).toMatch(/aluno\s+Aluno\s+@relation\(fields: \[alunoId\], references: \[id\], onDelete: Cascade\)/);
      expect(model).toMatch(/contract\s+Contract\s+@relation\(fields: \[contractId\], references: \[id\], onDelete: Cascade\)/);
      expect(schema.match(/preWorkoutCheckIns\s+PreWorkoutCheckIn\[\]/g)).toHaveLength(2);
    }

    for (const migration of migrations) {
      expect(migration).toContain(
        'CONSTRAINT "PreWorkoutCheckIn_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "GeneratedContract"("id")'
      );
      expect(migration).not.toContain(
        'CONSTRAINT "PreWorkoutCheckIn_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id")'
      );
    }
  });

  it('não inventa alerta nem score quando dor/desconforto não foi informado', () => {
    const result = evaluatePreWorkoutCheckInRules(null);
    expect(result).toMatchObject({
      painTriage: null,
      studentMessage: null,
      technicalMessage: null,
      blocksWorkout: false,
      changesWorkoutAutomatically: false,
    });
    expect(result).not.toHaveProperty('readinessScore');
  });
});
