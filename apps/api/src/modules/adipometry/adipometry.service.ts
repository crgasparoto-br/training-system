import { createHash, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  AdipometryAssessmentDetail,
  AdipometryAssessmentSummary,
  AdipometryCalculatedResults,
  AdipometryCalculationSnapshot,
  AdipometryComparison,
  AdipometryCorrectionCategory,
  AdipometryExpression,
  AdipometryMeasurements,
  AdipometryProtocolCompatibility,
  AdipometryProtocolDefinitionSnapshot,
  AdipometryProtocolSex,
  AdipometryProtocolSexSource,
  AdipometryResultField,
  AdipometrySkinfoldField,
  CreateAdipometryDraftInput,
  UpdateAdipometryDraftInput,
} from '@corrida/types';
import { assertAdipometryProtocolDefinitionSnapshot } from '@corrida/types';

const prisma = new PrismaClient();
type DbClient = PrismaClient | Prisma.TransactionClient;

type AssessmentRow = Record<string, any>;
type AdipometryDraftMutationInput = CreateAdipometryDraftInput | UpdateAdipometryDraftInput;

type ProfileSnapshot = {
  birthDate: string | null;
  profileSex: 'male' | 'female' | 'other' | null;
};

type ApprovedProtocolRow = {
  protocolId: string;
  protocolCode: string;
  protocolVersion: number;
  protocolName: string;
  protocolStatus: 'DRAFT' | 'APPROVED' | 'DISABLED';
  protocolReference: string;
  definitionSnapshot: unknown;
  approvalId: string;
  responsibilityId: string;
  approvedAt: Date;
  approvedByProfessorId: string;
  approvedByName: string;
  approvedByCref: string;
  approvedSpecificationHash: string;
};

export type AdipometryCalculationContext = {
  assessmentId: string;
  alunoId: string;
  assessmentDate: string;
  measurements: AdipometryMeasurements;
  protocolSex: AdipometryProtocolSex | null;
  protocolSexSource: AdipometryProtocolSexSource | null;
  protocolSexOverrideReason: string | null;
  profile: ProfileSnapshot;
  protocol: ApprovedProtocolRow;
  capacityWarningConfirmed: boolean;
  actorUserId: string;
  calculatedAt?: Date;
};

export type AdipometryPreviewResult = {
  protocol: {
    code: string;
    name: string;
    version: number;
    status: 'APPROVED';
    compatibility: AdipometryProtocolCompatibility;
  };
  normalizedMeasurements: AdipometryMeasurements;
  usedSkinfolds: AdipometrySkinfoldField[];
  compatibility: AdipometryProtocolCompatibility;
  results?: AdipometryCalculatedResults;
  calculationSnapshot?: AdipometryCalculationSnapshot;
  inputFingerprint: string;
  canFinalize: boolean;
  anthropometrySupport: {
    latestEligible: null | {
      anthropometryAssessmentId: string;
      assessmentCode: string;
      assessmentDate: string;
    };
    linked: null | {
      anthropometryAssessmentId: string;
      assessmentCode: string;
      assessmentDate: string;
    };
  };
};

export class AdipometryServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: 400 | 403 | 404 | 409 | 500 = 400
  ) {
    super(message);
    this.name = 'AdipometryServiceError';
  }
}

const SERIALIZABLE_TRANSACTION_RETRY_LIMIT = 3;

function isSerializableTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

async function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= SERIALIZABLE_TRANSACTION_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!isSerializableTransactionConflict(error) || attempt === SERIALIZABLE_TRANSACTION_RETRY_LIMIT) {
        throw error;
      }
    }
  }

  throw lastError;
}

export function normalizeAdipometryDateOnly(value: Date | string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new AdipometryServiceError(
        'A data da avaliação é inválida.',
        'ADIPOMETRY_INVALID_DATE'
      );
    }
    return value.toISOString().slice(0, 10);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new AdipometryServiceError(
      'A data da avaliação é inválida.',
      'ADIPOMETRY_INVALID_DATE'
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new AdipometryServiceError(
      'A data da avaliação é inválida.',
      'ADIPOMETRY_INVALID_DATE'
    );
  }
  return value;
}

function dateOnlyToDate(value: string): Date {
  return new Date(`${normalizeAdipometryDateOnly(value)}T00:00:00.000Z`);
}

function decimalToNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof (value as any)?.toNumber === 'function') return (value as any).toNumber();
  return Number(value);
}

function toFiniteNumber(value: unknown, field: string): number {
  const numeric = decimalToNumber(value);
  if (numeric === undefined || !Number.isFinite(numeric)) {
    throw new AdipometryServiceError(
      `Informe um valor numérico válido para ${field}.`,
      'ADIPOMETRY_INVALID_NUMBER'
    );
  }
  return numeric;
}

function hasScale(value: number, scale: number): boolean {
  const multiplier = 10 ** scale;
  return Math.abs(value * multiplier - Math.round(value * multiplier)) < 1e-8;
}

function roundAdipometryValue(
  value: number,
  scale: number,
  mode: AdipometryProtocolDefinitionSnapshot['rounding']['mode']
): number {
  const roundingMode = mode === 'HALF_EVEN'
    ? Prisma.Decimal.ROUND_HALF_EVEN
    : Prisma.Decimal.ROUND_HALF_UP;
  return new Prisma.Decimal(value).toDecimalPlaces(scale, roundingMode).toNumber();
}

function roundHalfUp(value: number, scale: number): number {
  return roundAdipometryValue(value, scale, 'HALF_UP');
}

function calculateAge(birthDate: string, assessmentDate: string): number {
  const birth = dateOnlyToDate(birthDate);
  const assessment = dateOnlyToDate(assessmentDate);
  let age = assessment.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = assessment.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && assessment.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

function canonicalProfileSex(value: unknown): ProfileSnapshot['profileSex'] {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'male' || normalized === 'masculino') return 'male';
  if (normalized === 'female' || normalized === 'feminino') return 'female';
  if (normalized) return 'other';
  return null;
}

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)])
      );
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

export function buildAdipometryInputFingerprint(input: {
  assessmentId: string;
  assessmentDate: string;
  measurements: AdipometryMeasurements;
  protocolSex: AdipometryProtocolSex | null;
  protocolSexSource: AdipometryProtocolSexSource | null;
  protocolSexOverrideReason: string | null;
  protocolCode: string;
  protocolVersion: number;
  approvalId: string;
  capacityWarningConfirmed: boolean;
}): string {
  return createHash('sha256').update(stableJson(input)).digest('hex');
}

function readExpressionPath(context: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, context);
}

function evaluateAdipometryExpression(
  expression: AdipometryExpression,
  context: Record<string, unknown>
): number {
  const evaluate = (child: AdipometryExpression) => evaluateAdipometryExpression(child, context);
  let result: number;

  switch (expression.op) {
    case 'constant':
      result = expression.value;
      break;
    case 'variable': {
      const value = readExpressionPath(context, expression.name);
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new AdipometryServiceError(
          `A variável clínica ${expression.name} não possui valor numérico.`,
          'ADIPOMETRY_PROTOCOL_VARIABLE_NOT_NUMERIC'
        );
      }
      result = value;
      break;
    }
    case 'add':
      result = expression.args.reduce((sum, child) => sum + evaluate(child), 0);
      break;
    case 'subtract':
      result = evaluate(expression.left) - evaluate(expression.right);
      break;
    case 'multiply':
      result = expression.args.reduce((product, child) => product * evaluate(child), 1);
      break;
    case 'divide': {
      const denominator = evaluate(expression.denominator);
      if (denominator === 0) {
        throw new AdipometryServiceError(
          'A equação clínica tentou dividir por zero.',
          'ADIPOMETRY_PROTOCOL_DIVISION_BY_ZERO'
        );
      }
      result = evaluate(expression.numerator) / denominator;
      break;
    }
    case 'power':
      result = evaluate(expression.base) ** evaluate(expression.exponent);
      break;
    case 'log10': {
      const value = evaluate(expression.value);
      if (value <= 0) {
        throw new AdipometryServiceError(
          'A equação clínica exige logaritmo de um valor positivo.',
          'ADIPOMETRY_PROTOCOL_LOG10_NON_POSITIVE'
        );
      }
      result = Math.log10(value);
      break;
    }
    case 'negate':
      result = -evaluate(expression.value);
      break;
    case 'ifEquals':
      result = readExpressionPath(context, expression.field) === expression.expected
        ? evaluate(expression.then)
        : evaluate(expression.else);
      break;
    default: {
      const unsupported: never = expression;
      throw new AdipometryServiceError(
        `Operador clínico não suportado: ${String((unsupported as any)?.op ?? 'desconhecido')}.`,
        'ADIPOMETRY_PROTOCOL_OPERATOR_UNSUPPORTED'
      );
    }
  }

  if (!Number.isFinite(result)) {
    throw new AdipometryServiceError(
      'A equação clínica produziu um resultado não finito.',
      'ADIPOMETRY_INVALID_CALCULATION'
    );
  }
  return result;
}

function executeApprovedProtocol(
  definition: AdipometryProtocolDefinitionSnapshot,
  ageAtAssessment: number,
  protocolSex: AdipometryProtocolSex,
  normalizedMeasurements: AdipometryMeasurements,
  usedSkinfolds: Array<keyof AdipometryMeasurements>
): {
  rawResults: Record<AdipometryResultField, number>;
  results: AdipometryCalculatedResults;
  skinfoldTotalRaw: number;
} {
  const skinfoldTotalRaw = usedSkinfolds
    .map((field) => toFiniteNumber(normalizedMeasurements[field], String(field)))
    .reduce((sum, value) => sum + value, 0);
  if (skinfoldTotalRaw <= 0) {
    throw new AdipometryServiceError(
      'A soma das dobras deve ser positiva.',
      'ADIPOMETRY_INVALID_SKINFOLD_TOTAL'
    );
  }

  const expressionContext: Record<string, unknown> = {
    ...normalizedMeasurements,
    ageAtAssessment,
    skinfoldTotalMm: skinfoldTotalRaw,
    profileCriteria: {
      sex: protocolSex === 'male' ? 'MALE' : 'FEMALE',
    },
  };
  const rawResults = {} as Record<AdipometryResultField, number>;
  const seenOutputs = new Set<AdipometryResultField>();

  for (const equation of definition.equations) {
    if (seenOutputs.has(equation.output)) {
      throw new AdipometryServiceError(
        `O protocolo repete a saída clínica ${equation.output}.`,
        'ADIPOMETRY_PROTOCOL_DUPLICATE_OUTPUT'
      );
    }
    const value = evaluateAdipometryExpression(equation.expression, expressionContext);
    rawResults[equation.output] = value;
    expressionContext[equation.output] = value;
    seenOutputs.add(equation.output);
  }

  for (const requiredOutput of ['bodyFatPercentage', 'fatMassKg', 'leanMassKg'] as const) {
    if (!seenOutputs.has(requiredOutput)) {
      throw new AdipometryServiceError(
        `O protocolo não calcula a saída clínica ${requiredOutput}.`,
        'ADIPOMETRY_PROTOCOL_OUTPUT_MISSING'
      );
    }
  }

  if (
    rawResults.bodyFatPercentage < 0 ||
    rawResults.bodyFatPercentage > 100 ||
    rawResults.fatMassKg < 0 ||
    rawResults.leanMassKg < 0
  ) {
    throw new AdipometryServiceError(
      'As medidas não produziram um resultado matematicamente válido.',
      'ADIPOMETRY_INVALID_CALCULATION'
    );
  }

  const precision = definition.precision as typeof definition.precision & {
    skinfoldTotalScale?: number;
  };
  const results: AdipometryCalculatedResults = {
    skinfoldTotalMm: roundAdipometryValue(
      skinfoldTotalRaw,
      precision.skinfoldTotalScale ?? precision.measurementScale,
      definition.rounding.mode
    ),
    bodyFatPercentage: roundAdipometryValue(
      rawResults.bodyFatPercentage,
      precision.resultScale,
      definition.rounding.mode
    ),
    fatMassKg: roundAdipometryValue(
      rawResults.fatMassKg,
      precision.resultScale,
      definition.rounding.mode
    ),
    leanMassKg: roundAdipometryValue(
      rawResults.leanMassKg,
      precision.resultScale,
      definition.rounding.mode
    ),
  };

  return { rawResults, results, skinfoldTotalRaw };
}

function validateProtocolSexDecision(context: AdipometryCalculationContext, compatibility: AdipometryProtocolCompatibility) {
  if (!context.protocolSex || !context.protocolSexSource) {
    compatibility.reasons.push({
      code: 'MISSING_PROTOCOL_SEX_CONFIRMATION',
      field: 'protocolSex',
      message: 'Confirme o sexo de referência utilizado pelo protocolo.',
    });
    return;
  }

  if (
    context.profile.profileSex &&
    context.profile.profileSex !== 'other' &&
    context.profile.profileSex !== context.protocolSex &&
    (context.protocolSexSource !== 'professional_override' || !context.protocolSexOverrideReason?.trim())
  ) {
    compatibility.reasons.push({
      code: 'PROTOCOL_SEX_DIVERGENCE_REQUIRES_REASON',
      field: 'protocolSexOverrideReason',
      message: 'Informe o motivo da divergência entre cadastro e sexo de referência.',
    });
  }
}

function validateMeasurement(
  compatibility: AdipometryProtocolCompatibility,
  measurements: AdipometryMeasurements,
  field: keyof AdipometryMeasurements,
  label: string,
  scale: number,
  min: number,
  max: number,
  required: boolean
): number | undefined {
  const raw = measurements[field];
  if (raw === undefined || raw === null) {
    if (required) {
      compatibility.reasons.push({
        code: 'MISSING_MEASUREMENT',
        field,
        message: `Informe ${label}.`,
      });
    }
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || !hasScale(value, scale)) {
    compatibility.reasons.push({
      code: 'MEASUREMENT_OUT_OF_RANGE',
      field,
      message: `${label} deve possuir no máximo ${scale} casa(s) decimal(is).`,
    });
    return undefined;
  }
  if (value < min || value > max) {
    compatibility.reasons.push({
      code: 'MEASUREMENT_OUT_OF_RANGE',
      field,
      message: `${label} deve estar entre ${min} e ${max}.`,
    });
    return undefined;
  }
  return value;
}

export function calculateAdipometry(context: AdipometryCalculationContext): {
  compatibility: AdipometryProtocolCompatibility;
  results?: AdipometryCalculatedResults;
  calculationSnapshot?: AdipometryCalculationSnapshot;
} {
  assertAdipometryProtocolDefinitionSnapshot(context.protocol.definitionSnapshot);
  const definition = context.protocol.definitionSnapshot;
  const compatibility: AdipometryProtocolCompatibility = { compatible: true, reasons: [], warnings: [] };

  if (!context.profile.birthDate) {
    compatibility.reasons.push({
      code: 'MISSING_BIRTH_DATE',
      field: 'birthDate',
      message: 'Cadastre a data de nascimento antes de calcular a adipometria.',
    });
  }

  const age = context.profile.birthDate
    ? calculateAge(context.profile.birthDate, context.assessmentDate)
    : null;
  if (
    age !== null &&
    (age < definition.population.ageMinYears || age > definition.population.ageMaxYears)
  ) {
    compatibility.reasons.push({
      code: 'AGE_NOT_APPLICABLE',
      field: 'assessmentDate',
      message: `O protocolo aceita idade entre ${definition.population.ageMinYears} e ${definition.population.ageMaxYears} anos na data da avaliação.`,
    });
  }

  validateProtocolSexDecision(context, compatibility);

  const sexKey = context.protocolSex === 'female' ? 'FEMALE' : 'MALE';
  const requiredFields = context.protocolSex
    ? definition.calculationSkinfoldsBySex?.[sexKey]
    : undefined;
  if (context.protocolSex && (!requiredFields || requiredFields.length === 0)) {
    throw new AdipometryServiceError(
      `O protocolo não define as dobras de cálculo para ${sexKey}.`,
      'ADIPOMETRY_PROTOCOL_SKINFOLDS_MISSING'
    );
  }

  const labels: Record<keyof AdipometryMeasurements, string> = {
    weightKg: 'o peso',
    tricepsMm: 'a dobra tricipital',
    subscapularMm: 'a dobra subescapular',
    suprailiacMm: 'a dobra suprailíaca',
    abdominalMm: 'a dobra abdominal',
    thighMm: 'a dobra da coxa',
  };
  const inputScales = definition.inputScales ?? {};
  const weightLimit = definition.limits.blocking.weightKg;
  const weight = validateMeasurement(
    compatibility,
    context.measurements,
    'weightKg',
    labels.weightKg,
    inputScales.weightKg ?? 2,
    weightLimit.min,
    weightLimit.max,
    true
  );

  const normalized: AdipometryMeasurements = {};
  if (weight !== undefined) normalized.weightKg = weight;
  const skinfoldFields = [
    'tricepsMm',
    'subscapularMm',
    'suprailiacMm',
    'abdominalMm',
    'thighMm',
  ] as const;
  let capacityWarningPresent = false;

  for (const field of skinfoldFields) {
    const limit = definition.limits.blocking[field];
    const value = validateMeasurement(
      compatibility,
      context.measurements,
      field,
      labels[field],
      inputScales[field] ?? definition.precision.measurementScale,
      limit.min,
      limit.max,
      requiredFields?.includes(field) ?? false
    );
    if (value !== undefined) normalized[field] = value;

    if (value !== undefined) {
      for (const warning of definition.limits.warnings.filter((item) => item.field === field)) {
        const aboveMinimum = warning.min === undefined || value >= warning.min;
        const belowMaximum = warning.max === undefined || value <= warning.max;
        if (aboveMinimum && belowMaximum) {
          capacityWarningPresent = true;
          compatibility.warnings.push({
            code: 'SKINFOLD_CAPACITY_WARNING',
            field,
            message: warning.message,
          });
        }
      }
    }
  }

  if (capacityWarningPresent && !context.capacityWarningConfirmed) {
    compatibility.reasons.push({
      code: 'SKINFOLD_CAPACITY_WARNING_CONFIRMATION_REQUIRED',
      message: 'Confirme o alerta de capacidade do adipômetro antes de concluir.',
    });
  }

  compatibility.compatible = compatibility.reasons.length === 0;
  if (
    !compatibility.compatible ||
    !context.protocolSex ||
    !requiredFields ||
    weight === undefined ||
    age === null
  ) {
    return { compatibility };
  }

  const execution = executeApprovedProtocol(
    definition,
    age,
    context.protocolSex,
    normalized,
    requiredFields
  );
  const { results } = execution;
  const calculatedAt = context.calculatedAt ?? new Date();
  const profileSexSnapshot = context.profile.profileSex ?? 'other';
  const protocolSexDecision = {
    protocolSex: context.protocolSex,
    profileSexSnapshot,
    source: context.protocolSexSource!,
    confirmedByUserId: context.actorUserId,
    confirmedAt: calculatedAt.toISOString(),
    overrideReason: context.protocolSexOverrideReason,
  } as const;

  const calculationSnapshot = {
    protocol: { code: context.protocol.protocolCode, version: context.protocol.protocolVersion },
    protocolApproval: {
      id: context.protocol.approvalId,
      responsibilityId: context.protocol.responsibilityId,
      approvedAt: context.protocol.approvedAt.toISOString(),
      approvedByProfessorId: context.protocol.approvedByProfessorId,
      approvedByName: context.protocol.approvedByName,
      approvedByCref: context.protocol.approvedByCref,
      approvedSpecificationHash: context.protocol.approvedSpecificationHash,
      protocolReference: context.protocol.protocolReference,
      protocolDefinitionSnapshot: definition,
    },
    assessmentDate: context.assessmentDate,
    ageAtAssessment: age,
    profileCriteria: {
      sex: context.protocolSex === 'male' ? 'MALE' : 'FEMALE',
      protocolSex: context.protocolSex,
    },
    protocolSexDecision,
    inputs: context.protocolSex === 'male'
      ? {
          weightKg: weight,
          tricepsMm: normalized.tricepsMm!,
          suprailiacMm: normalized.suprailiacMm!,
          abdominalMm: normalized.abdominalMm!,
          subscapularMm: normalized.subscapularMm ?? null,
          thighMm: normalized.thighMm ?? null,
        }
      : {
          weightKg: weight,
          subscapularMm: normalized.subscapularMm!,
          suprailiacMm: normalized.suprailiacMm!,
          thighMm: normalized.thighMm!,
          tricepsMm: normalized.tricepsMm ?? null,
          abdominalMm: normalized.abdominalMm ?? null,
        },
    rules: {
      equations: definition.equations,
      limits: definition.limits,
      precision: definition.precision,
      rounding: definition.rounding,
      rawResults: execution.rawResults,
      skinfoldTotalRaw: execution.skinfoldTotalRaw,
      usedSkinfolds: requiredFields,
      capacityWarningConfirmed: context.capacityWarningConfirmed,
    },
    results,
    implementationVersion: 'issue-247-v2-contract-runtime',
    calculatedAt: calculatedAt.toISOString(),
  } as AdipometryCalculationSnapshot;

  return { compatibility, results, calculationSnapshot };
}

function serializeSummary(row: AssessmentRow): AdipometryAssessmentSummary {
  return {
    id: row.id,
    contractId: row.contractId,
    alunoId: row.alunoId,
    professorId: row.professorId,
    code: row.code,
    sequenceNumber: row.sequenceNumber,
    assessmentDate: normalizeAdipometryDateOnly(row.assessmentDate),
    status: row.status,
    revisionStatus: row.revisionStatus,
    rootAssessmentId: row.rootAssessmentId,
    revisionNumber: row.revisionNumber,
    ...(row.previousRevisionId ? { previousRevisionId: row.previousRevisionId } : {}),
    ...(row.correctionCategory ? { correctionCategory: row.correctionCategory } : {}),
    ...(row.correctionStartedAt ? { correctionStartedAt: row.correctionStartedAt.toISOString() } : {}),
    ...(row.correctionCancelledAt ? { correctionCancelledAt: row.correctionCancelledAt.toISOString() } : {}),
    ...(row.correctionCancellationReason ? { correctionCancellationReason: row.correctionCancellationReason } : {}),
    ...(row.voidedAt ? { voidedAt: row.voidedAt.toISOString() } : {}),
    ...(row.voidReason ? { voidReason: row.voidReason } : {}),
    ...(row.protocolCode ? { protocolCode: row.protocolCode } : {}),
    ...(row.protocolVersion ? { protocolVersion: row.protocolVersion } : {}),
    ...(row.protocolSex ? { protocolSex: row.protocolSex } : {}),
    ...(row.profileSexSnapshot ? { profileSexSnapshot: row.profileSexSnapshot } : {}),
    ...(row.protocolSexSource ? { protocolSexSource: row.protocolSexSource } : {}),
    ...(row.protocolSexConfirmedByUserId ? { protocolSexConfirmedByUserId: row.protocolSexConfirmedByUserId } : {}),
    ...(row.protocolSexConfirmedAt ? { protocolSexConfirmedAt: row.protocolSexConfirmedAt.toISOString() } : {}),
    ...(row.protocolSexOverrideReason ? { protocolSexOverrideReason: row.protocolSexOverrideReason } : {}),
    ...(row.skinfoldCapacityWarningConfirmedByUserId
      ? { skinfoldCapacityWarningConfirmedByUserId: row.skinfoldCapacityWarningConfirmedByUserId }
      : {}),
    ...(row.skinfoldCapacityWarningConfirmedAt
      ? { skinfoldCapacityWarningConfirmedAt: row.skinfoldCapacityWarningConfirmedAt.toISOString() }
      : {}),
    ...(row.bodyFatPercentage !== null && row.bodyFatPercentage !== undefined
      ? { bodyFatPercentage: decimalToNumber(row.bodyFatPercentage)! }
      : {}),
    ...(row.correctedByAssessmentId ? { correctedByAssessmentId: row.correctedByAssessmentId } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeDetail(row: AssessmentRow): AdipometryAssessmentDetail {
  return {
    ...serializeSummary(row),
    measurements: {
      ...(row.weightKg !== null && row.weightKg !== undefined ? { weightKg: decimalToNumber(row.weightKg) } : {}),
      ...(row.tricepsMm !== null && row.tricepsMm !== undefined ? { tricepsMm: decimalToNumber(row.tricepsMm) } : {}),
      ...(row.subscapularMm !== null && row.subscapularMm !== undefined ? { subscapularMm: decimalToNumber(row.subscapularMm) } : {}),
      ...(row.suprailiacMm !== null && row.suprailiacMm !== undefined ? { suprailiacMm: decimalToNumber(row.suprailiacMm) } : {}),
      ...(row.abdominalMm !== null && row.abdominalMm !== undefined ? { abdominalMm: decimalToNumber(row.abdominalMm) } : {}),
      ...(row.thighMm !== null && row.thighMm !== undefined ? { thighMm: decimalToNumber(row.thighMm) } : {}),
    },
    ...(row.skinfoldTotalMm !== null && row.skinfoldTotalMm !== undefined
      ? {
          results: {
            skinfoldTotalMm: decimalToNumber(row.skinfoldTotalMm)!,
            bodyFatPercentage: decimalToNumber(row.bodyFatPercentage)!,
            fatMassKg: decimalToNumber(row.fatMassKg)!,
            leanMassKg: decimalToNumber(row.leanMassKg)!,
          },
        }
      : {}),
    ...(row.calculationSnapshot ? { calculationSnapshot: row.calculationSnapshot } : {}),
    ...(row.anthropometryAssessment
      ? {
          anthropometryReference: {
            anthropometryAssessmentId: row.anthropometryAssessment.id,
            assessmentCode: row.anthropometryAssessment.code,
            assessmentDate: normalizeAdipometryDateOnly(row.anthropometryAssessment.assessmentDate),
          },
        }
      : {}),
    ...(row.correctsAssessmentId ? { correctsAssessmentId: row.correctsAssessmentId } : {}),
    ...(row.beforeSnapshot ? { beforeSnapshot: row.beforeSnapshot } : {}),
    ...(row.afterSnapshot ? { afterSnapshot: row.afterSnapshot } : {}),
    ...(Array.isArray(row.changedFields) ? { changedFields: row.changedFields } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
  };
}

async function setActor(client: DbClient, actorUserId: string) {
  await client.$executeRaw(Prisma.sql`
    SELECT set_config('app.adipometry_actor_user_id', ${actorUserId}, TRUE)
  `);
}

async function requireAluno(client: DbClient, contractId: string, alunoId: string) {
  const aluno = await client.aluno.findFirst({ where: { id: alunoId, contractId }, select: { id: true } });
  if (!aluno) {
    throw new AdipometryServiceError('Avaliação não encontrada.', 'ADIPOMETRY_RESOURCE_NOT_FOUND', 404);
  }
}

async function getProfile(client: DbClient, contractId: string, alunoId: string): Promise<ProfileSnapshot> {
  const rows = await client.$queryRaw<Array<{ birthDate: string | null; profileSex: string | null }>>(Prisma.sql`
    SELECT
      COALESCE(
        student_profile."identificationData" ->> 'birthDate',
        TO_CHAR(aluno."birthDate", 'YYYY-MM-DD'),
        TO_CHAR(profile."birthDate", 'YYYY-MM-DD')
      ) AS "birthDate",
      COALESCE(
        student_profile."identificationData" ->> 'gender',
        profile.gender::TEXT
      ) AS "profileSex"
    FROM "Aluno" aluno
    LEFT JOIN "StudentProfile" student_profile
      ON student_profile."alunoId" = aluno.id
     AND student_profile."contractId" = aluno."contractId"
    LEFT JOIN "Profile" profile ON profile."userId" = aluno."userId"
    WHERE aluno.id = ${alunoId}
      AND aluno."contractId" = ${contractId}
    LIMIT 1
  `);
  if (!rows[0]) {
    throw new AdipometryServiceError('Avaliação não encontrada.', 'ADIPOMETRY_RESOURCE_NOT_FOUND', 404);
  }
  return {
    birthDate: rows[0].birthDate ? normalizeAdipometryDateOnly(rows[0].birthDate) : null,
    profileSex: canonicalProfileSex(rows[0].profileSex),
  };
}

async function getApprovedProtocol(
  client: DbClient,
  contractId: string,
  protocolCode: string,
  protocolVersion: number,
  lockApproval = false
): Promise<ApprovedProtocolRow> {
  const lock = lockApproval ? Prisma.sql`FOR SHARE OF approval` : Prisma.empty;
  const rows = await client.$queryRaw<ApprovedProtocolRow[]>(Prisma.sql`
    SELECT
      protocol.id AS "protocolId",
      protocol.code AS "protocolCode",
      protocol.version AS "protocolVersion",
      protocol.name AS "protocolName",
      protocol.status AS "protocolStatus",
      approval."protocolReferenceSnapshot" AS "protocolReference",
      approval."protocolDefinitionSnapshot" AS "definitionSnapshot",
      approval.id AS "approvalId",
      approval."responsibilityId",
      approval."approvedAt",
      approval."approvedByProfessorId",
      approval."approvedByNameSnapshot" AS "approvedByName",
      approval."approvedByCrefSnapshot" AS "approvedByCref",
      approval."approvedSpecificationHash"
    FROM "AdipometryProtocol" protocol
    JOIN "AdipometryProtocolApproval" approval
      ON approval."protocolId" = protocol.id
     AND approval."protocolCode" = protocol.code
     AND approval."protocolVersion" = protocol.version
    WHERE approval."contractId" = ${contractId}
      AND approval."revokedAt" IS NULL
      AND protocol.code = ${protocolCode}
      AND protocol.version = ${protocolVersion}
      AND protocol.status <> 'DISABLED'
    LIMIT 1
    ${lock}
  `);
  const protocol = rows[0];
  if (!protocol) {
    throw new AdipometryServiceError(
      'O protocolo não possui aprovação clínica ativa para este contrato.',
      'PROTOCOL_NOT_APPROVED_FOR_CONTRACT',
      409
    );
  }
  assertAdipometryProtocolDefinitionSnapshot(protocol.definitionSnapshot);
  return protocol;
}

async function getAssessmentRow(
  client: DbClient,
  contractId: string,
  assessmentId: string,
  lock = false
): Promise<AssessmentRow> {
  const rows = await client.$queryRaw<AssessmentRow[]>(Prisma.sql`
    SELECT assessment.*
    FROM "AdipometryAssessment" assessment
    WHERE assessment.id = ${assessmentId}
      AND assessment."contractId" = ${contractId}
    ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `);
  if (!rows[0]) {
    throw new AdipometryServiceError('Avaliação não encontrada.', 'ADIPOMETRY_RESOURCE_NOT_FOUND', 404);
  }
  return rows[0];
}

async function getDetail(client: DbClient, contractId: string, assessmentId: string) {
  const row = await client.adipometryAssessment.findFirst({
    where: { id: assessmentId, contractId },
    include: { anthropometryAssessment: { select: { id: true, code: true, assessmentDate: true } } },
  });
  if (!row) {
    throw new AdipometryServiceError('Avaliação não encontrada.', 'ADIPOMETRY_RESOURCE_NOT_FOUND', 404);
  }
  const detail = serializeDetail(row as any) as AdipometryAssessmentDetail & {
    revisionHistory?: AdipometryAssessmentSummary[];
    auditEvents?: Array<Record<string, unknown>>;
  };
  const [history, auditEvents] = await Promise.all([
    client.adipometryAssessment.findMany({
      where: { contractId, rootAssessmentId: row.rootAssessmentId },
      orderBy: { revisionNumber: 'asc' },
    }),
    client.adipometryAuditEvent.findMany({
      where: { contractId, assessmentId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        actorUserId: true,
        action: true,
        reason: true,
        beforeSnapshot: true,
        afterSnapshot: true,
        createdAt: true,
      },
    }),
  ]);
  detail.revisionHistory = history.map((item) => serializeSummary(item as any));
  detail.auditEvents = auditEvents.map((event) => ({
    ...event,
    createdAt: event.createdAt.toISOString(),
  }));
  return detail;
}

async function validateAnthropometryReference(
  client: DbClient,
  contractId: string,
  alunoId: string,
  assessmentDate: string,
  anthropometryAssessmentId: string | null | undefined
) {
  if (!anthropometryAssessmentId) return null;
  const reference = await client.anthropometryAssessment.findFirst({
    where: {
      id: anthropometryAssessmentId,
      contractId,
      alunoId,
      assessmentDate: { lte: dateOnlyToDate(assessmentDate) },
    },
    select: { id: true, code: true, assessmentDate: true },
  });
  if (!reference) {
    throw new AdipometryServiceError(
      'A avaliação antropométrica de apoio não está disponível para este aluno e data.',
      'ADIPOMETRY_ANTHROPOMETRY_REFERENCE_NOT_FOUND',
      404
    );
  }
  return reference;
}

async function getAnthropometrySupport(
  client: DbClient,
  contractId: string,
  alunoId: string,
  assessmentDate: string,
  linkedId: string | null
) {
  const [latestEligible, linked] = await Promise.all([
    client.anthropometryAssessment.findFirst({
      where: { contractId, alunoId, assessmentDate: { lte: dateOnlyToDate(assessmentDate) } },
      orderBy: [{ assessmentDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, code: true, assessmentDate: true },
    }),
    linkedId
      ? client.anthropometryAssessment.findFirst({
          where: { id: linkedId, contractId, alunoId },
          select: { id: true, code: true, assessmentDate: true },
        })
      : Promise.resolve(null),
  ]);
  const serialize = (item: typeof latestEligible) => item
    ? {
        anthropometryAssessmentId: item.id,
        assessmentCode: item.code,
        assessmentDate: normalizeAdipometryDateOnly(item.assessmentDate),
      }
    : null;
  return { latestEligible: serialize(latestEligible), linked: serialize(linked) };
}

function measurementsFromRow(row: AssessmentRow): AdipometryMeasurements {
  const result: AdipometryMeasurements = {};
  for (const field of ['weightKg', 'tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm', 'thighMm'] as const) {
    const value = decimalToNumber(row[field]);
    if (value !== undefined) result[field] = value;
  }
  return result;
}

async function buildPreview(
  client: DbClient,
  contractId: string,
  actorUserId: string,
  row: AssessmentRow,
  options: { capacityWarningConfirmed?: boolean; lockApproval?: boolean } = {}
): Promise<AdipometryPreviewResult> {
  if (row.revisionStatus !== 'DRAFT' || row.status !== 'DRAFT') {
    throw new AdipometryServiceError(
      'Somente um rascunho pode ser calculado.',
      'ADIPOMETRY_INVALID_STATE',
      409
    );
  }
  if (!row.protocolCode || !row.protocolVersion) {
    throw new AdipometryServiceError(
      'Selecione um protocolo antes de calcular.',
      'ADIPOMETRY_PROTOCOL_REQUIRED'
    );
  }
  const [profile, protocol, anthropometrySupport] = await Promise.all([
    getProfile(client, contractId, row.alunoId),
    getApprovedProtocol(client, contractId, row.protocolCode, row.protocolVersion, options.lockApproval),
    getAnthropometrySupport(
      client,
      contractId,
      row.alunoId,
      normalizeAdipometryDateOnly(row.assessmentDate),
      row.anthropometryAssessmentId
    ),
  ]);
  const capacityWarningConfirmed = Boolean(
    row.skinfoldCapacityWarningConfirmedAt || options.capacityWarningConfirmed
  );
  const calculationContext: AdipometryCalculationContext = {
    assessmentId: row.id,
    alunoId: row.alunoId,
    assessmentDate: normalizeAdipometryDateOnly(row.assessmentDate),
    measurements: measurementsFromRow(row),
    protocolSex: row.protocolSex,
    protocolSexSource: row.protocolSexSource,
    protocolSexOverrideReason: row.protocolSexOverrideReason,
    profile,
    protocol,
    capacityWarningConfirmed,
    actorUserId,
  };
  const calculated = calculateAdipometry(calculationContext);
  const definition = protocol.definitionSnapshot as AdipometryProtocolDefinitionSnapshot;
  const sexKey = calculationContext.protocolSex === 'female' ? 'FEMALE' : 'MALE';
  const usedSkinfolds = calculationContext.protocolSex
    ? [...(definition.calculationSkinfoldsBySex?.[sexKey] ?? [])]
    : [];
  const inputFingerprint = buildAdipometryInputFingerprint({
    assessmentId: row.id,
    assessmentDate: calculationContext.assessmentDate,
    measurements: calculationContext.measurements,
    protocolSex: calculationContext.protocolSex,
    protocolSexSource: calculationContext.protocolSexSource,
    protocolSexOverrideReason: calculationContext.protocolSexOverrideReason,
    protocolCode: protocol.protocolCode,
    protocolVersion: protocol.protocolVersion,
    approvalId: protocol.approvalId,
    capacityWarningConfirmed,
  });
  return {
    protocol: {
      code: protocol.protocolCode,
      name: protocol.protocolName,
      version: protocol.protocolVersion,
      status: 'APPROVED',
      compatibility: calculated.compatibility,
    },
    normalizedMeasurements: calculationContext.measurements,
    usedSkinfolds,
    compatibility: calculated.compatibility,
    ...(calculated.results ? { results: calculated.results } : {}),
    ...(calculated.calculationSnapshot ? { calculationSnapshot: calculated.calculationSnapshot } : {}),
    inputFingerprint,
    canFinalize: calculated.compatibility.compatible,
    anthropometrySupport,
  };
}

function buildDraftUpdate(
  input: AdipometryDraftMutationInput,
  actorUserId: string,
  profile: ProfileSnapshot
) {
  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.assessmentDate !== undefined) data.assessmentDate = dateOnlyToDate(input.assessmentDate);
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.anthropometryAssessmentId !== undefined) {
    data.anthropometryAssessmentId = input.anthropometryAssessmentId;
  }
  if (input.protocolCode !== undefined) data.protocolCode = input.protocolCode;
  if (input.protocolVersion !== undefined) data.protocolVersion = input.protocolVersion;
  if (input.protocolSex !== undefined) {
    data.protocolSex = input.protocolSex;
    data.profileSexSnapshot = profile.profileSex ?? 'other';
    data.protocolSexSource = input.protocolSexSource ?? 'professional_confirmation';
    data.protocolSexConfirmedByUserId = actorUserId;
    data.protocolSexConfirmedAt = new Date();
    data.protocolSexOverrideReason = input.protocolSexOverrideReason ?? null;
  }
  if (input.measurements) {
    for (const field of ['weightKg', 'tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm', 'thighMm'] as const) {
      if (Object.prototype.hasOwnProperty.call(input.measurements, field)) {
        data[field] = input.measurements[field] ?? null;
      }
    }
  }
  return data;
}

export const adipometryService = {
  async listAvailableProtocols(contractId: string, alunoId: string, assessmentDate?: string) {
    await requireAluno(prisma, contractId, alunoId);
    const date = normalizeAdipometryDateOnly(assessmentDate ?? new Date());
    const profile = await getProfile(prisma, contractId, alunoId);
    const rows = await prisma.$queryRaw<ApprovedProtocolRow[]>(Prisma.sql`
      SELECT
        protocol.id AS "protocolId",
        protocol.code AS "protocolCode",
        protocol.version AS "protocolVersion",
        protocol.name AS "protocolName",
        protocol.status AS "protocolStatus",
        approval."protocolReferenceSnapshot" AS "protocolReference",
        approval."protocolDefinitionSnapshot" AS "definitionSnapshot",
        approval.id AS "approvalId",
        approval."responsibilityId",
        approval."approvedAt",
        approval."approvedByProfessorId",
        approval."approvedByNameSnapshot" AS "approvedByName",
        approval."approvedByCrefSnapshot" AS "approvedByCref",
        approval."approvedSpecificationHash"
      FROM "AdipometryProtocol" protocol
      JOIN "AdipometryProtocolApproval" approval
        ON approval."protocolId" = protocol.id
       AND approval."protocolCode" = protocol.code
       AND approval."protocolVersion" = protocol.version
      WHERE approval."contractId" = ${contractId}
        AND approval."revokedAt" IS NULL
        AND protocol.status <> 'DISABLED'
      ORDER BY protocol.code, protocol.version DESC
    `);
    return rows.map((protocol) => {
      assertAdipometryProtocolDefinitionSnapshot(protocol.definitionSnapshot);
      const reasons: AdipometryProtocolCompatibility['reasons'] = [];
      if (!profile.birthDate) {
        reasons.push({ code: 'MISSING_BIRTH_DATE', field: 'birthDate', message: 'Cadastre a data de nascimento.' });
      } else {
        const age = calculateAge(profile.birthDate, date);
        if (
          age < protocol.definitionSnapshot.population.ageMinYears ||
          age > protocol.definitionSnapshot.population.ageMaxYears
        ) {
          reasons.push({
            code: 'AGE_NOT_APPLICABLE',
            field: 'assessmentDate',
            message: `Idade fora da faixa de ${protocol.definitionSnapshot.population.ageMinYears} a ${protocol.definitionSnapshot.population.ageMaxYears} anos.`,
          });
        }
      }
      return {
        code: protocol.protocolCode,
        name: protocol.protocolName,
        version: protocol.protocolVersion,
        status: 'APPROVED' as const,
        compatibility: { compatible: reasons.length === 0, reasons, warnings: [] },
      };
    });
  },

  async listAssessments(contractId: string, alunoId: string) {
    await requireAluno(prisma, contractId, alunoId);
    const rows = await prisma.adipometryAssessment.findMany({
      where: {
        contractId,
        alunoId,
        revisionStatus: { in: ['DRAFT', 'FINALIZED'] },
        correctedByAssessmentId: null,
      },
      orderBy: [
        { assessmentDate: 'desc' },
        { revisionNumber: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    });
    return rows.map((row) => serializeSummary(row as any));
  },

  async getLastAssessment(contractId: string, alunoId: string) {
    await requireAluno(prisma, contractId, alunoId);
    const row = await prisma.adipometryAssessment.findFirst({
      where: { contractId, alunoId, revisionStatus: 'FINALIZED', correctedByAssessmentId: null },
      orderBy: [{ assessmentDate: 'desc' }, { completedAt: 'desc' }, { id: 'desc' }],
    });
    return row ? serializeSummary(row as any) : null;
  },

  async getAssessment(contractId: string, assessmentId: string) {
    return getDetail(prisma, contractId, assessmentId);
  },

  async createDraft(
    contractId: string,
    alunoId: string,
    actorUserId: string,
    actorProfessorId: string,
    input: CreateAdipometryDraftInput
  ) {
    return prisma.$transaction(async (tx) => {
      await requireAluno(tx, contractId, alunoId);
      const assessmentDate = normalizeAdipometryDateOnly(input.assessmentDate);
      const profile = await getProfile(tx, contractId, alunoId);
      await validateAnthropometryReference(
        tx,
        contractId,
        alunoId,
        assessmentDate,
        input.anthropometryAssessmentId
      );
      const id = randomUUID();
      const now = new Date();
      await setActor(tx, actorUserId);
      await tx.$queryRaw(Prisma.sql`
        SELECT * FROM "createAdipometryDraft"(
          ${id}, ${contractId}, ${alunoId}, ${actorProfessorId},
          ${dateOnlyToDate(assessmentDate)}, ${actorUserId}, ${now}
        )
      `);
      const data = buildDraftUpdate(input, actorUserId, profile);
      if (input.protocolCode && input.protocolVersion) {
        const protocol = await getApprovedProtocol(tx, contractId, input.protocolCode, input.protocolVersion);
        data.protocolId = protocol.protocolId;
      }
      await tx.adipometryAssessment.update({ where: { id }, data: data as any });
      return getDetail(tx, contractId, id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },

  async updateDraft(
    contractId: string,
    assessmentId: string,
    actorUserId: string,
    input: UpdateAdipometryDraftInput
  ) {
    return prisma.$transaction(async (tx) => {
      await setActor(tx, actorUserId);
      const current = await getAssessmentRow(tx, contractId, assessmentId, true);
      if (current.status !== 'DRAFT' || current.revisionStatus !== 'DRAFT') {
        throw new AdipometryServiceError(
          'A avaliação concluída não pode ser alterada. Inicie uma correção.',
          'ADIPOMETRY_FINALIZED_IMMUTABLE',
          409
        );
      }
      if (input.expectedUpdatedAt && current.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new AdipometryServiceError(
          'O rascunho foi atualizado por outra sessão. Recarregue antes de salvar.',
          'ADIPOMETRY_STALE_DRAFT',
          409
        );
      }
      const assessmentDate = normalizeAdipometryDateOnly(input.assessmentDate ?? current.assessmentDate);
      await validateAnthropometryReference(
        tx,
        contractId,
        current.alunoId,
        assessmentDate,
        input.anthropometryAssessmentId === undefined
          ? current.anthropometryAssessmentId
          : input.anthropometryAssessmentId
      );
      const profile = await getProfile(tx, contractId, current.alunoId);
      const data = buildDraftUpdate(input, actorUserId, profile);
      const protocolCode = input.protocolCode ?? current.protocolCode;
      const protocolVersion = input.protocolVersion ?? current.protocolVersion;
      if (protocolCode && protocolVersion) {
        const protocol = await getApprovedProtocol(tx, contractId, protocolCode, protocolVersion);
        data.protocolId = protocol.protocolId;
        data.protocolCode = protocol.protocolCode;
        data.protocolVersion = protocol.protocolVersion;
      }
      if (
        current.revisionNumber > 1 &&
        current.protocolCode &&
        (protocolCode !== current.protocolCode || protocolVersion !== current.protocolVersion)
      ) {
        if (current.correctionCategory !== 'PROTOCOL_SELECTION_ERROR' || input.confirmProtocolChange !== true) {
          throw new AdipometryServiceError(
            'A troca de protocolo exige correção por seleção de protocolo e confirmação explícita.',
            'ADIPOMETRY_PROTOCOL_CHANGE_CONFIRMATION_REQUIRED',
            409
          );
        }
        data.protocolChangeConfirmedByUserId = actorUserId;
        data.protocolChangeConfirmedAt = new Date();
      }
      await tx.adipometryAssessment.update({ where: { id: assessmentId }, data: data as any });
      return getDetail(tx, contractId, assessmentId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },

  async calculate(
    contractId: string,
    assessmentId: string,
    actorUserId: string,
    options: { skinfoldCapacityWarningConfirmed?: boolean } = {}
  ) {
    return prisma.$transaction(async (tx) => {
      await setActor(tx, actorUserId);
      let row = await getAssessmentRow(tx, contractId, assessmentId, true);
      const initial = await buildPreview(tx, contractId, actorUserId, row);
      const confirmationReason = initial.compatibility.reasons.find(
        (reason) => reason.code === 'SKINFOLD_CAPACITY_WARNING_CONFIRMATION_REQUIRED'
      );

      if (!options.skinfoldCapacityWarningConfirmed || !confirmationReason) {
        return initial;
      }

      const otherBlockingReasons = initial.compatibility.reasons.filter(
        (reason) => reason.code !== 'SKINFOLD_CAPACITY_WARNING_CONFIRMATION_REQUIRED'
      );
      if (otherBlockingReasons.length > 0) {
        return initial;
      }

      await tx.adipometryAssessment.update({
        where: { id: assessmentId },
        data: {
          skinfoldCapacityWarningConfirmedByUserId: actorUserId,
          skinfoldCapacityWarningConfirmedAt: new Date(),
        },
      });
      row = await getAssessmentRow(tx, contractId, assessmentId, true);
      return buildPreview(tx, contractId, actorUserId, row);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },

  async finalize(
    contractId: string,
    assessmentId: string,
    actorUserId: string,
    input: { inputFingerprint: string; expectedUpdatedAt?: string }
  ) {
    return runSerializableTransaction(async (tx) => {
      await setActor(tx, actorUserId);
      const row = await getAssessmentRow(tx, contractId, assessmentId, true);
      if (row.status === 'COMPLETED' && row.revisionStatus === 'FINALIZED') {
        return { assessment: await getDetail(tx, contractId, assessmentId), alreadyFinalized: true };
      }
      if (!input?.inputFingerprint) {
        throw new AdipometryServiceError(
          'Calcule a prévia e informe o fingerprint antes de concluir.',
          'ADIPOMETRY_PREVIEW_REQUIRED',
          409
        );
      }
      if (row.status !== 'DRAFT' || row.revisionStatus !== 'DRAFT') {
        throw new AdipometryServiceError(
          'A avaliação não está disponível para conclusão.',
          'ADIPOMETRY_INVALID_STATE',
          409
        );
      }
      if (input.expectedUpdatedAt && row.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new AdipometryServiceError(
          'O rascunho foi atualizado por outra sessão. Recalcule antes de concluir.',
          'ADIPOMETRY_STALE_DRAFT',
          409
        );
      }
      const preview = await buildPreview(tx, contractId, actorUserId, row, { lockApproval: true });
      if (!preview.canFinalize || !preview.results || !preview.calculationSnapshot) {
        throw new AdipometryServiceError(
          'Corrija as incompatibilidades antes de concluir a avaliação.',
          'ADIPOMETRY_NOT_READY_TO_FINALIZE',
          409
        );
      }
      if (input.inputFingerprint !== preview.inputFingerprint) {
        throw new AdipometryServiceError(
          'As entradas mudaram após a prévia. Calcule novamente antes de concluir.',
          'ADIPOMETRY_PREVIEW_INVALIDATED',
          409
        );
      }
      const snapshot = preview.calculationSnapshot as any;
      const protocolId = snapshot.protocolApproval.protocolDefinitionSnapshot
        ? (await getApprovedProtocol(
            tx,
            contractId,
            snapshot.protocol.code,
            snapshot.protocol.version,
            true
          )).protocolId
        : null;
      await tx.adipometryAssessment.update({
        where: { id: assessmentId },
        data: {
          status: 'COMPLETED',
          revisionStatus: 'FINALIZED',
          protocolId,
          protocolCode: snapshot.protocol.code,
          protocolVersion: snapshot.protocol.version,
          skinfoldTotalMm: preview.results.skinfoldTotalMm,
          bodyFatPercentage: preview.results.bodyFatPercentage,
          fatMassKg: preview.results.fatMassKg,
          leanMassKg: preview.results.leanMassKg,
          calculationSnapshot: snapshot,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      return { assessment: await getDetail(tx, contractId, assessmentId), alreadyFinalized: false };
    });
  },

  async startCorrection(
    contractId: string,
    assessmentId: string,
    actorUserId: string,
    category: AdipometryCorrectionCategory,
    reason: string
  ) {
    return prisma.$transaction(async (tx) => {
      const current = await getAssessmentRow(tx, contractId, assessmentId, true);
      if (current.revisionStatus !== 'FINALIZED' || current.correctedByAssessmentId) {
        throw new AdipometryServiceError(
          'A avaliação não está disponível para correção.',
          'ADIPOMETRY_INVALID_CORRECTION_TARGET',
          409
        );
      }
      const correctionId = randomUUID();
      const rows = await tx.$queryRaw<Array<{ assessmentId: string }>>(Prisma.sql`
        SELECT * FROM "startAdipometryCorrection"(
          ${correctionId}, ${assessmentId}, ${category}, ${reason}, ${actorUserId}, ${new Date()}
        )
      `);
      return getDetail(tx, contractId, rows[0]?.assessmentId ?? correctionId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },

  async cancelCorrection(contractId: string, assessmentId: string, actorUserId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      await setActor(tx, actorUserId);
      const row = await getAssessmentRow(tx, contractId, assessmentId, true);
      if (row.revisionStatus !== 'DRAFT' || row.revisionNumber <= 1) {
        throw new AdipometryServiceError(
          'Somente um rascunho de correção pode ser cancelado.',
          'ADIPOMETRY_INVALID_CORRECTION_TARGET',
          409
        );
      }
      await tx.adipometryAssessment.update({
        where: { id: assessmentId },
        data: {
          revisionStatus: 'CANCELLED',
          correctionCancelledAt: new Date(),
          correctionCancelledByUserId: actorUserId,
          correctionCancellationReason: reason,
          updatedAt: new Date(),
        },
      });
      return getDetail(tx, contractId, assessmentId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },

  async compare(contractId: string, alunoId: string, assessmentIds?: string[]): Promise<AdipometryComparison & {
    comparabilityWarning?: { code: string; message: string };
  }> {
    await requireAluno(prisma, contractId, alunoId);
    const rows = await prisma.adipometryAssessment.findMany({
      where: {
        contractId,
        alunoId,
        revisionStatus: 'FINALIZED',
        correctedByAssessmentId: null,
        ...(assessmentIds?.length ? { id: { in: assessmentIds } } : {}),
      },
      orderBy: [{ assessmentDate: 'desc' }, { completedAt: 'desc' }, { id: 'desc' }],
      take: assessmentIds?.length ? undefined : 2,
    });
    if (assessmentIds?.length && rows.length !== new Set(assessmentIds).size) {
      throw new AdipometryServiceError('Avaliação não encontrada.', 'ADIPOMETRY_RESOURCE_NOT_FOUND', 404);
    }
    if (rows.length === 0) {
      throw new AdipometryServiceError(
        'Não há avaliações concluídas para comparação.',
        'ADIPOMETRY_COMPARISON_NOT_AVAILABLE',
        404
      );
    }
    const ordered = [...rows].sort((left, right) => {
      const byAssessmentDate = left.assessmentDate.getTime() - right.assessmentDate.getTime();
      if (byAssessmentDate !== 0) return byAssessmentDate;
      const leftCompletedAt = left.completedAt?.getTime() ?? left.updatedAt.getTime();
      const rightCompletedAt = right.completedAt?.getTime() ?? right.updatedAt.getTime();
      const byCompletion = leftCompletedAt - rightCompletedAt;
      if (byCompletion !== 0) return byCompletion;
      return left.id.localeCompare(right.id);
    });
    const currentRow = ordered[ordered.length - 1];
    const previousRow = ordered.length > 1 ? ordered[ordered.length - 2] : undefined;
    const item = (row: typeof currentRow) => ({
      assessment: serializeSummary(row as any),
      measurements: measurementsFromRow(row as any),
      results: {
        skinfoldTotalMm: decimalToNumber(row.skinfoldTotalMm)!,
        bodyFatPercentage: decimalToNumber(row.bodyFatPercentage)!,
        fatMassKg: decimalToNumber(row.fatMassKg)!,
        leanMassKg: decimalToNumber(row.leanMassKg)!,
      },
    });
    const current = item(currentRow);
    if (!previousRow) return { current };
    const previous = item(previousRow);
    const deltas: Record<string, number> = {};
    for (const field of ['weightKg', 'tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm', 'thighMm'] as const) {
      const currentValue = current.measurements[field];
      const previousValue = previous.measurements[field];
      if (currentValue !== undefined && previousValue !== undefined) {
        deltas[field] = roundHalfUp(currentValue - previousValue, field === 'weightKg' ? 2 : 1);
      }
    }
    for (const field of ['skinfoldTotalMm', 'bodyFatPercentage', 'fatMassKg', 'leanMassKg'] as const) {
      deltas[field] = roundHalfUp(current.results[field] - previous.results[field], 2);
    }
    const differentProtocol =
      current.assessment.protocolCode !== previous.assessment.protocolCode ||
      current.assessment.protocolVersion !== previous.assessment.protocolVersion;
    return {
      previous,
      current,
      deltas,
      ...(differentProtocol
        ? {
            comparabilityWarning: {
              code: 'ADIPOMETRY_DIFFERENT_PROTOCOL_VERSIONS',
              message: 'As avaliações usam protocolos ou versões diferentes. Interprete os deltas com cautela.',
            },
          }
        : {}),
    };
  },
};
