from pathlib import Path
import re

path = Path('apps/web/src/pages/AlunoForm.tsx')
text = path.read_text(encoding='utf-8-sig')


def replace_once(old: str, new: str = '') -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one occurrence, found {count}: {old[:100]!r}')
    text = text.replace(old, new, 1)


replace_once("""const numberOrUndefined = (value: unknown) =>
  typeof value === 'number' && Number.isNaN(value) ? undefined : value;

const optionalNumberSchema = (schema: z.ZodNumber) =>
  z.preprocess(numberOrUndefined, schema.optional());

""")

replace_once("""  weight: optionalNumberSchema(z.number().positive('Peso deve ser positivo')),
  height: optionalNumberSchema(z.number().positive('Altura deve ser positiva')),
  bodyFatPercentage: optionalNumberSchema(z.number().min(0).max(100)),
  vo2Max: optionalNumberSchema(z.number().positive('VO2 Max deve ser positivo')),
  anaerobicThreshold: optionalNumberSchema(z.number().positive('Limiar anaeróbico deve ser positivo')),
  maxHeartRate: optionalNumberSchema(z.number().int().min(100, 'FC máxima mínima: 100 bpm').max(220, 'FC máxima máxima: 220 bpm')),
  restingHeartRate: optionalNumberSchema(z.number().int().min(30, 'FC de repouso mínima: 30 bpm').max(100, 'FC de repouso máxima: 100 bpm')),
  systolicPressure: optionalNumberSchema(z.number().int().min(80).max(240)),
  diastolicPressure: optionalNumberSchema(z.number().int().min(40).max(160)),
  macronutrients: z.object({
    carbohydratesPercentage: optionalNumberSchema(z.number().min(0).max(100)),
    proteinsPercentage: optionalNumberSchema(z.number().min(0).max(100)),
    lipidsPercentage: optionalNumberSchema(z.number().min(0).max(100)),
    dailyCalories: optionalNumberSchema(z.number().int().positive()),
  }),
""")

replace_once("    assessmentDate: z.string().optional(),\n")

replace_once("""      macronutrients: {
        carbohydratesPercentage: undefined,
        proteinsPercentage: undefined,
        lipidsPercentage: undefined,
        dailyCalories: undefined,
      },
""")
replace_once("        assessmentDate: '',\n")

replace_once("""  const weight = watch('weight');
  const height = watch('height');
""")
replace_once("""  const bmi = weight && height ? alunoService.calculateBMI(weight, height) : 0;
  const bmiClass = bmi ? alunoService.getBMIClassification(bmi) : '';
""")

pattern = re.compile(
    r"  const applyAssessmentPrefill = \(prefill: AlunoAssessmentPrefill\) => \{.*?\n  \};\n\n  const handleAssessmentPrefill",
    re.DOTALL,
)
replacement = """  const applyAssessmentPrefill = (prefill: AlunoAssessmentPrefill) => {
    if (!isEditMode && prefill.name) setValue('name', prefill.name);
    if (prefill.birthDate) setValue('birthDate', formatDateForInput(prefill.birthDate));
    if (prefill.gender) setValue('gender', prefill.gender);
    if (prefill.age !== undefined) setValue('age', prefill.age);
    if (prefill.intakeForm?.trainingBackground) {
      setValue('intakeForm.trainingBackground', prefill.intakeForm.trainingBackground);
    }
    if (prefill.intakeForm?.observations) {
      setValue('intakeForm.observations', prefill.intakeForm.observations);
    }
  };

  const handleAssessmentPrefill"""
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'Expected to replace applyAssessmentPrefill once, found {count}')

replace_once("""      const summaryParts = [
        prefill.extractedPreview?.sourceName ? `Nome identificado: ${prefill.extractedPreview.sourceName}` : null,
        prefill.extractedPreview?.sourceAssessmentDate
          ? `Data da avaliação: ${formatDateForInput(prefill.extractedPreview.sourceAssessmentDate)}`
          : null,
      ].filter(Boolean);
""", """      const summaryParts = [
        prefill.extractedPreview?.sourceName ? `Nome identificado: ${prefill.extractedPreview.sourceName}` : null,
      ].filter(Boolean);
""")

replace_once("""      setValue('weight', aluno.weight ?? undefined);
      setValue('height', aluno.height ?? undefined);
      setValue('bodyFatPercentage', aluno.bodyFatPercentage ?? undefined);
      setValue('vo2Max', aluno.vo2Max ?? undefined);
      setValue('anaerobicThreshold', aluno.anaerobicThreshold ?? undefined);
      setValue('maxHeartRate', aluno.maxHeartRate ?? undefined);
      setValue('restingHeartRate', aluno.restingHeartRate ?? undefined);
      setValue('systolicPressure', aluno.systolicPressure);
      setValue('diastolicPressure', aluno.diastolicPressure);
      setValue('macronutrients.carbohydratesPercentage', aluno.macronutrients?.carbohydratesPercentage);
      setValue('macronutrients.proteinsPercentage', aluno.macronutrients?.proteinsPercentage);
      setValue('macronutrients.lipidsPercentage', aluno.macronutrients?.lipidsPercentage);
      setValue('macronutrients.dailyCalories', aluno.macronutrients?.dailyCalories);
      setValue('intakeForm.assessmentDate', formatDateForInput(aluno.intakeForm?.assessmentDate));
""")

assessment_payload = """        weight: data.weight,
        height: data.height,
        bodyFatPercentage: data.bodyFatPercentage,
        vo2Max: data.vo2Max,
        anaerobicThreshold: data.anaerobicThreshold,
        maxHeartRate: data.maxHeartRate,
        restingHeartRate: data.restingHeartRate,
        systolicPressure: data.systolicPressure,
        diastolicPressure: data.diastolicPressure,
        macronutrients: data.macronutrients,
"""
if text.count(assessment_payload) != 2:
    raise SystemExit(f'Expected two assessment payload blocks, found {text.count(assessment_payload)}')
text = text.replace(assessment_payload, '')

assessment_date_payload = "          assessmentDate: data.intakeForm.assessmentDate || undefined,\n"
if text.count(assessment_date_payload) != 2:
    raise SystemExit(f'Expected two assessment date payload fields, found {text.count(assessment_date_payload)}')
text = text.replace(assessment_date_payload, '')

invalid_errors_pattern = re.compile(
    r"\n    const hasAssessmentTabErrors =.*?\n      !!formErrors\.intakeForm\?\.assessmentDate;\n",
    re.DOTALL,
)
text, count = invalid_errors_pattern.subn('', text, count=1)
if count != 1:
    raise SystemExit(f'Expected to remove assessment validation routing once, found {count}')

replace_once("""
    if (hasAssessmentTabErrors) {
      setActiveTab('identificacao');
      return;
    }
""")

sections_pattern = re.compile(
    r"\n                <section className=\"space-y-4 border-t border-border pt-6\">\n"
    r".*?Antropometria e composição corporal.*?"
    r"<h2 className=\"text-lg font-semibold text-foreground\">Aporte energético e macronutrientes</h2>.*?"
    r"\n                </section>",
    re.DOTALL,
)
text, count = sections_pattern.subn('', text, count=1)
if count != 1:
    raise SystemExit(f'Expected to remove the three assessment sections once, found {count}')

for identifier in [
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
]:
    if re.search(rf'\b{re.escape(identifier)}\b', text):
        raise SystemExit(f'Assessment identifier still present in AlunoForm.tsx: {identifier}')

for heading in [
    'Antropometria e composição corporal',
    'Avaliação metabólica e cardiovascular',
    'Aporte energético e macronutrientes',
    'IMC Calculado',
]:
    if heading in text:
        raise SystemExit(f'Assessment heading still present in AlunoForm.tsx: {heading}')

path.write_text(text, encoding='utf-8-sig')

Path('apps/web/src/pages/AlunoForm.assessment-boundary.test.ts').write_text("""import { readFileSync } from 'node:fs';
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
    expect(source).not.toMatch(new RegExp(`\\b${identifier}\\b`));
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
""", encoding='utf-8')
