import type {
  AdipometryExpression,
  AdipometryProtocolDefinitionSnapshot,
  AdipometrySkinfoldField,
} from './adipometry.js';

type JsonRecord = Record<string, unknown>;

const SKINFOLD_FIELDS = [
  'tricepsMm',
  'subscapularMm',
  'suprailiacMm',
  'abdominalMm',
  'thighMm',
] as const satisfies readonly AdipometrySkinfoldField[];
const INPUT_FIELDS = ['weightKg', ...SKINFOLD_FIELDS] as const;
const RESULT_FIELDS = [
  'skinfoldTotalMm',
  'bodyFatPercentage',
  'fatMassKg',
  'leanMassKg',
] as const;
const EXPRESSION_VARIABLES = new Set<string>([
  ...INPUT_FIELDS,
  ...RESULT_FIELDS,
  'ageAtAssessment',
]);

function requireRecord(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
  return value;
}

function requireStringArray(value: unknown, path: string): string[] {
  return requireArray(value, path).map((item, index) =>
    requireNonEmptyString(item, `${path}[${index}]`)
  );
}

function requireAllowedString(
  value: unknown,
  path: string,
  allowed: ReadonlySet<string>
): string {
  const result = requireNonEmptyString(value, path);
  if (!allowed.has(result)) {
    throw new TypeError(`${path} has an unsupported value`);
  }
  return result;
}

function requireNumericFields(
  record: JsonRecord,
  fields: readonly string[],
  path: string
): void {
  for (const field of fields) {
    requireFiniteNumber(record[field], `${path}.${field}`);
  }
}

function requireSkinfoldArray(value: unknown, path: string): void {
  const allowed = new Set<string>(SKINFOLD_FIELDS);
  for (const [index, field] of requireArray(value, path).entries()) {
    requireAllowedString(field, `${path}[${index}]`, allowed);
  }
}

function assertExpression(value: unknown, path: string): asserts value is AdipometryExpression {
  const expression = requireRecord(value, path);
  const op = requireNonEmptyString(expression.op, `${path}.op`);

  switch (op) {
    case 'constant':
      requireFiniteNumber(expression.value, `${path}.value`);
      return;
    case 'variable':
      requireAllowedString(expression.name, `${path}.name`, EXPRESSION_VARIABLES);
      return;
    case 'add':
    case 'multiply': {
      const args = requireArray(expression.args, `${path}.args`);
      if (args.length < 2) {
        throw new TypeError(`${path}.args must contain at least two expressions`);
      }
      args.forEach((item, index) => assertExpression(item, `${path}.args[${index}]`));
      return;
    }
    case 'subtract':
      assertExpression(expression.left, `${path}.left`);
      assertExpression(expression.right, `${path}.right`);
      return;
    case 'divide':
      assertExpression(expression.numerator, `${path}.numerator`);
      assertExpression(expression.denominator, `${path}.denominator`);
      return;
    case 'power':
      assertExpression(expression.base, `${path}.base`);
      assertExpression(expression.exponent, `${path}.exponent`);
      return;
    case 'log10':
    case 'negate':
      assertExpression(expression.value, `${path}.value`);
      return;
    case 'ifEquals': {
      const field = requireNonEmptyString(expression.field, `${path}.field`);
      if (!field.startsWith('profileCriteria.')) {
        throw new TypeError(`${path}.field must reference profileCriteria`);
      }
      const expected = expression.expected;
      if (
        expected !== null &&
        typeof expected !== 'string' &&
        typeof expected !== 'number' &&
        typeof expected !== 'boolean'
      ) {
        throw new TypeError(`${path}.expected must be a scalar JSON value`);
      }
      if (typeof expected === 'number' && !Number.isFinite(expected)) {
        throw new TypeError(`${path}.expected must be finite`);
      }
      assertExpression(expression.then, `${path}.then`);
      assertExpression(expression.else, `${path}.else`);
      return;
    }
    default:
      throw new TypeError(`${path}.op is unsupported`);
  }
}

function assertMeasurements(value: unknown, path: string): void {
  const measurements = requireRecord(value, path);
  requireNumericFields(measurements, INPUT_FIELDS, path);
}

function assertCalculatedResults(value: unknown, path: string): void {
  const results = requireRecord(value, path);
  requireNumericFields(results, RESULT_FIELDS, path);
}

function assertDefinitionTestVectors(value: unknown, path: string): void {
  for (const [index, item] of requireArray(value, path).entries()) {
    const vectorPath = `${path}[${index}]`;
    const vector = requireRecord(item, vectorPath);
    requireNonEmptyString(vector.id, `${vectorPath}.id`);

    const inputs = requireRecord(vector.inputs, `${vectorPath}.inputs`);
    requireFiniteNumber(inputs.ageAtAssessment, `${vectorPath}.inputs.ageAtAssessment`);
    requireRecord(inputs.profileCriteria, `${vectorPath}.inputs.profileCriteria`);
    assertMeasurements(inputs.measurements, `${vectorPath}.inputs.measurements`);
    assertCalculatedResults(vector.expectedResults, `${vectorPath}.expectedResults`);

    const tolerance = requireRecord(vector.tolerance, `${vectorPath}.tolerance`);
    requireNumericFields(tolerance, RESULT_FIELDS, `${vectorPath}.tolerance`);
  }
}

/**
 * Runtime boundary for protocol definitions loaded from JSON/JSONB.
 *
 * The contract intentionally accepts definitions without embedded
 * `clinicalApproval`: contract-scoped approval provenance belongs to
 * `AdipometryProtocolApprovalSnapshot`.
 */
export function assertAdipometryProtocolDefinitionSnapshot(
  value: unknown
): asserts value is AdipometryProtocolDefinitionSnapshot {
  const definition = requireRecord(value, 'adipometry protocol definition');
  requireFiniteNumber(definition.schemaVersion, 'schemaVersion');

  const population = requireRecord(definition.population, 'population');
  requireFiniteNumber(population.ageMinYears, 'population.ageMinYears');
  requireFiniteNumber(population.ageMaxYears, 'population.ageMaxYears');
  requireStringArray(population.sexCriteria, 'population.sexCriteria');
  requireNonEmptyString(population.maturationCriteria, 'population.maturationCriteria');

  requireSkinfoldArray(definition.requiredSkinfolds, 'requiredSkinfolds');
  if (definition.calculationSkinfoldsBySex !== undefined) {
    const bySex = requireRecord(definition.calculationSkinfoldsBySex, 'calculationSkinfoldsBySex');
    requireSkinfoldArray(bySex.MALE, 'calculationSkinfoldsBySex.MALE');
    requireSkinfoldArray(bySex.FEMALE, 'calculationSkinfoldsBySex.FEMALE');
  }

  const inputUnits = requireRecord(definition.inputUnits, 'inputUnits');
  requireAllowedString(inputUnits.weightKg, 'inputUnits.weightKg', new Set(['kg']));
  for (const field of SKINFOLD_FIELDS) {
    requireAllowedString(inputUnits[field], `inputUnits.${field}`, new Set(['mm']));
  }

  if (definition.inputScales !== undefined) {
    requireNumericFields(requireRecord(definition.inputScales, 'inputScales'), INPUT_FIELDS, 'inputScales');
  }

  const outputUnits = requireRecord(definition.outputUnits, 'outputUnits');
  requireAllowedString(outputUnits.skinfoldTotalMm, 'outputUnits.skinfoldTotalMm', new Set(['mm']));
  requireAllowedString(
    outputUnits.bodyFatPercentage,
    'outputUnits.bodyFatPercentage',
    new Set(['percent'])
  );
  requireAllowedString(outputUnits.fatMassKg, 'outputUnits.fatMassKg', new Set(['kg']));
  requireAllowedString(outputUnits.leanMassKg, 'outputUnits.leanMassKg', new Set(['kg']));

  const equationOutputs = new Set(['bodyFatPercentage', 'fatMassKg', 'leanMassKg']);
  for (const [index, item] of requireArray(definition.equations, 'equations').entries()) {
    const equationPath = `equations[${index}]`;
    const equation = requireRecord(item, equationPath);
    requireNonEmptyString(equation.id, `${equationPath}.id`);
    requireAllowedString(equation.output, `${equationPath}.output`, equationOutputs);
    assertExpression(equation.expression, `${equationPath}.expression`);
  }

  const limits = requireRecord(definition.limits, 'limits');
  const blocking = requireRecord(limits.blocking, 'limits.blocking');
  for (const field of INPUT_FIELDS) {
    const limit = requireRecord(blocking[field], `limits.blocking.${field}`);
    requireFiniteNumber(limit.min, `limits.blocking.${field}.min`);
    requireFiniteNumber(limit.max, `limits.blocking.${field}.max`);
  }

  const warningFields = new Set<string>([...INPUT_FIELDS, ...RESULT_FIELDS]);
  for (const [index, item] of requireArray(limits.warnings, 'limits.warnings').entries()) {
    const warningPath = `limits.warnings[${index}]`;
    const warning = requireRecord(item, warningPath);
    requireAllowedString(warning.field, `${warningPath}.field`, warningFields);
    requireNonEmptyString(warning.message, `${warningPath}.message`);
    if (warning.min !== undefined) requireFiniteNumber(warning.min, `${warningPath}.min`);
    if (warning.max !== undefined) requireFiniteNumber(warning.max, `${warningPath}.max`);
  }

  const precision = requireRecord(definition.precision, 'precision');
  requireFiniteNumber(precision.measurementScale, 'precision.measurementScale');
  requireFiniteNumber(precision.resultScale, 'precision.resultScale');
  requireFiniteNumber(precision.internalScale, 'precision.internalScale');

  const rounding = requireRecord(definition.rounding, 'rounding');
  requireAllowedString(rounding.mode, 'rounding.mode', new Set(['HALF_UP', 'HALF_EVEN']));
  requireAllowedString(rounding.stage, 'rounding.stage', new Set(['FINAL_RESULTS_ONLY']));

  const missingDataBehavior = requireRecord(
    definition.missingDataBehavior,
    'missingDataBehavior'
  );
  requireNonEmptyString(
    missingDataBehavior.missingRequired,
    'missingDataBehavior.missingRequired'
  );
  requireNonEmptyString(
    missingDataBehavior.incompatibleProfile,
    'missingDataBehavior.incompatibleProfile'
  );
  assertDefinitionTestVectors(definition.testVectors, 'testVectors');

  if (definition.clinicalApproval !== undefined) {
    const approval = requireRecord(definition.clinicalApproval, 'clinicalApproval');
    if (approval.status !== 'approved') {
      throw new TypeError('clinicalApproval.status must be approved');
    }
    requireNonEmptyString(approval.approverUserId, 'clinicalApproval.approverUserId');
    requireNonEmptyString(approval.approvedAt, 'clinicalApproval.approvedAt');
    requireNonEmptyString(approval.approvalRecordId, 'clinicalApproval.approvalRecordId');
    requireNonEmptyString(approval.artifactSha256, 'clinicalApproval.artifactSha256');
  }
}
