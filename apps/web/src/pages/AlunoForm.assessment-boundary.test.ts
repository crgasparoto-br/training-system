import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./AlunoForm.tsx', import.meta.url)), 'utf8');

const assessmentIdentifiers = [
  'weight',
  'height',
  'bodyFatPercentage',
  'vo2Max',
  'anaerobicThreshold',
  'maxHeartRate',
  'restingHeartRate',
  'systolicPressure',
  'diastolicPressure',
  'macronutrients',
  'carbohydratesPercentage',
  'proteinsPercentage',
  'lipidsPercentage',
  'dailyCalories',
  'assessmentDate',
] as const;

const removedHeadings = [
  'Antropometria e composição corporal',
  'Avaliação metabólica e cardiovascular',
  'Aporte energético e macronutrientes',
  'IMC Calculado',
] as const;

const preservedAnamnesisFields = [
  'mainGoal',
  'trainingBackground',
  'medicalHistory',
  'currentMedications',
  'injuriesHistory',
  'observations',
] as const;

describe('AlunoForm assessment boundary', () => {
  it.each(assessmentIdentifiers)('does not keep assessment identifier %s in the registration form', (identifier) => {
    expect(source).not.toMatch(new RegExp(`\b${identifier}\b`));
  });

  it.each(removedHeadings)('does not render removed assessment section %s', (heading) => {
    expect(source).not.toContain(heading);
  });

  it.each(preservedAnamnesisFields)('keeps anamnesis field %s in the form', (field) => {
    expect(source).toContain(`register('intakeForm.${field}')`);
  });

  it('keeps PDF prefill restricted to registration and anamnesis fields', () => {
    expect(source).toContain("setValue('birthDate'");
    expect(source).toContain("setValue('intakeForm.trainingBackground'");
    expect(source).toContain("setValue('intakeForm.observations'");
    expect(source).not.toContain('sourceAssessmentDate');
  });
});
