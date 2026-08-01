import type { AdipometryProtocolDefinitionSnapshot } from './adipometry.js';

type JsonRecord = Record<string, unknown>;

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
  requireArray(population.sexCriteria, 'population.sexCriteria');
  requireNonEmptyString(population.maturationCriteria, 'population.maturationCriteria');

  requireArray(definition.requiredSkinfolds, 'requiredSkinfolds');
  requireRecord(definition.inputUnits, 'inputUnits');
  requireRecord(definition.outputUnits, 'outputUnits');
  requireArray(definition.equations, 'equations');

  const limits = requireRecord(definition.limits, 'limits');
  requireRecord(limits.blocking, 'limits.blocking');
  requireArray(limits.warnings, 'limits.warnings');

  const precision = requireRecord(definition.precision, 'precision');
  requireFiniteNumber(precision.measurementScale, 'precision.measurementScale');
  requireFiniteNumber(precision.resultScale, 'precision.resultScale');
  requireFiniteNumber(precision.internalScale, 'precision.internalScale');

  const rounding = requireRecord(definition.rounding, 'rounding');
  requireNonEmptyString(rounding.mode, 'rounding.mode');
  requireNonEmptyString(rounding.stage, 'rounding.stage');

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
  requireArray(definition.testVectors, 'testVectors');

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
