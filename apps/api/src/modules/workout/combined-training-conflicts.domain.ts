/**
 * #403: deterministic, read-only evaluation of *professionally activated* rules.
 * This is a domain primitive, NOT a production clinical rule set or an API.
 * Production activation requires the workflow and external sign-off in #534.
 */
export const COMBINED_CONFLICT_PROTOCOL_VERSION = 'combined-conflict-v1' as const;

export type ConflictCapacity = 'cyclic' | 'resisted' | 'flexibility' | 'balance';
export type ConflictSeverity = 'info' | 'warning' | 'critical';
export type ConflictRuleStatus = 'draft' | 'approved' | 'active' | 'retired';
export type ConflictSourceKind = 'consolidated_release' | 'prescription' | 'execution' | 'check_in' | 'feedback' | 'assessment';
export type ConflictNumericMetric =
  | 'painLevel' | 'strengthPercent1Rm' | 'cyclicZone'
  | 'psr' | 'fatigue' | 'sleepQuality' | 'weeklyVolumeKm';
export type ConflictBooleanMetric = 'isLongRun' | 'targetsLowerBody' | 'dizziness';

export interface ConflictEvidenceSource {
  kind: ConflictSourceKind;
  recordId: string;
  version: string;
}
export interface ConflictMeasured<T> {
  value: T;
  source: ConflictEvidenceSource;
}
export interface ConflictObservation {
  alunoId: string;
  contractId: string;
  sessionId: string;
  capacity: ConflictCapacity;
  scheduledAt: string;
  numeric?: Partial<Record<ConflictNumericMetric, ConflictMeasured<number>>>;
  flags?: Partial<Record<ConflictBooleanMetric, ConflictMeasured<boolean>>>;
}
export type ConflictCondition =
  | { kind: 'numeric'; metric: ConflictNumericMetric; op: 'gte' | 'lte'; value: number }
  | { kind: 'flag'; metric: ConflictBooleanMetric; equals: boolean };
export interface ConflictTerm {
  capacity: ConflictCapacity;
  conditions: readonly ConflictCondition[];
}
export type ConflictExpression =
  | { kind: 'single'; term: ConflictTerm }
  | {
      kind: 'sequence';
      first: ConflictTerm;
      then: ConflictTerm;
      minHours: number;
      maxHours: number;
    };
export interface ConflictRule {
  code: string;
  version: string;
  sourceDocument: string;
  severity: ConflictSeverity;
  status: ConflictRuleStatus;
  professorGuidance: string;
  approval?: {
    professionalId: string;
    credential: string;
    approvedAt: string;
  };
  expression: ConflictExpression;
}
export interface ConflictAssessment {
  ruleCode: string;
  ruleVersion: string;
  ruleSource: string;
  status: 'triggered' | 'not_triggered' | 'insufficient_data' | 'inactive';
  severity: ConflictSeverity | null;
  professorGuidance: string | null;
  evidence: Array<{
    sessionId: string;
    capacity: ConflictCapacity;
    scheduledAt: string;
    metric: ConflictNumericMetric | ConflictBooleanMetric;
    source: ConflictEvidenceSource;
    value: number | boolean;
  }>;
  missingOperands: string[];
  changesWorkoutAutomatically: false;
}
export interface ConflictEvaluationInput {
  alunoId: string;
  contractId: string;
  windowStart: string;
  windowEnd: string;
  /** Only a complete, contract-scoped source window can prove "not_triggered". */
  coverage: 'complete' | 'partial';
  observations: readonly ConflictObservation[];
  /** Rules must come from trusted, versioned server configuration; never from request JSON. */
  rules: readonly ConflictRule[];
}
export class ConflictProtocolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictProtocolInputError';
  }
}

/** Deliberately empty: #534 contains seven UNAPPROVED decisions, not active thresholds. */
export const ACTIVE_COMBINED_CONFLICT_RULES_V1: readonly ConflictRule[] = Object.freeze([]);

const hasValue = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isoTime = (value: string): number => {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
      || new Date(time).toISOString() !== value) {
    throw new ConflictProtocolInputError('Timestamp deve ser ISO UTC canônico.');
  }
  return time;
};
function requireActiveRule(rule: ConflictRule): void {
  if (!hasValue(rule.code) || !hasValue(rule.version) ||
      !hasValue(rule.sourceDocument) || !hasValue(rule.professorGuidance) ||
      !['info', 'warning', 'critical'].includes(rule.severity)) {
    throw new ConflictProtocolInputError('Regra ativa sem identidade, fonte, severidade ou orientação.');
  }
  if (!rule.approval || !hasValue(rule.approval.professionalId) ||
      !hasValue(rule.approval.credential) || !hasValue(rule.approval.approvedAt)) {
    throw new ConflictProtocolInputError('Regra ativa sem homologação profissional registrada.');
  }
  isoTime(rule.approval.approvedAt);
  const terms = rule.expression.kind === 'single'
    ? [rule.expression.term]
    : [rule.expression.first, rule.expression.then];
  if (rule.expression.kind === 'sequence') {
    const { minHours, maxHours } = rule.expression;
    if (!Number.isFinite(minHours) || !Number.isFinite(maxHours) ||
        minHours < 0 || maxHours <= minHours) {
      throw new ConflictProtocolInputError('Janela temporal da regra deve ser finita e crescente.');
    }
  }
  for (const term of terms) {
    if (!['cyclic', 'resisted', 'flexibility', 'balance'].includes(term.capacity) ||
        term.conditions.length === 0) {
      throw new ConflictProtocolInputError('Capacidade ou operandos de regra ativos inválidos.');
    }
    for (const condition of term.conditions) {
      if (condition.kind === 'numeric') {
        if (!Number.isFinite(condition.value) || !['gte', 'lte'].includes(condition.op)) {
          throw new ConflictProtocolInputError('Operando numérico não validado.');
        }
      } else if (condition.kind !== 'flag' || typeof condition.equals !== 'boolean') {
        throw new ConflictProtocolInputError('Operando booleano não validado.');
      }
    }
  }
}

type UsedEvidence = ConflictAssessment['evidence'];
type TermResult = { result: 'yes' | 'no' | 'unknown'; evidence: UsedEvidence; missing: string[] };
function evaluateTerm(row: ConflictObservation, term: ConflictTerm): TermResult {
  const evidence: UsedEvidence = [];
  const missing: string[] = [];
  let failed = false;
  for (const condition of term.conditions) {
    const reading = condition.kind === 'numeric'
      ? row.numeric?.[condition.metric]
      : row.flags?.[condition.metric];
    if (!reading || reading.value === null || reading.value === undefined ||
        (condition.kind === 'numeric' && (typeof reading.value !== 'number' || !Number.isFinite(reading.value))) ||
        (condition.kind === 'flag' && typeof reading.value !== 'boolean')) {
      missing.push(row.sessionId + ':' + row.capacity + ':' + condition.metric);
      continue;
    }
    if (!hasValue(reading.source.recordId) || !hasValue(reading.source.version) ||
        !hasValue(reading.source.kind)) {
      throw new ConflictProtocolInputError('Leitura estruturada sem origem recuperável.');
    }
    const ok = condition.kind === 'numeric'
      ? (condition.op === 'gte'
          ? (reading.value as number) >= condition.value
          : (reading.value as number) <= condition.value)
      : reading.value === condition.equals;
    if (!ok) failed = true;
    evidence.push({
      sessionId: row.sessionId,
      capacity: row.capacity,
      scheduledAt: row.scheduledAt,
      metric: condition.metric,
      source: reading.source,
      value: reading.value,
    });
  }
  return {
    result: failed ? 'no' : missing.length ? 'unknown' : 'yes',
    evidence,
    missing,
  };
}
function assessment(rule: ConflictRule, status: ConflictAssessment['status'], evidence: UsedEvidence = [], missingOperands: string[] = []): ConflictAssessment {
  return {
    ruleCode: rule.code,
    ruleVersion: rule.version,
    ruleSource: rule.sourceDocument,
    status,
    severity: status === 'triggered' ? rule.severity : null,
    professorGuidance: status === 'triggered' ? rule.professorGuidance : null,
    evidence: status === 'triggered' ? evidence : [],
    missingOperands: [...new Set(missingOperands)].sort(),
    changesWorkoutAutomatically: false,
  };
}
/**
 * Caller must have already authorized the professor and resolved canonical releases.
 * Scope mismatch throws instead of silently dropping cross-contract information.
 * It returns evidence only and performs no Prisma writes or operational transitions.
 */
export function evaluateCombinedTrainingConflicts(input: ConflictEvaluationInput) {
  if (!hasValue(input.alunoId) || !hasValue(input.contractId)) {
    throw new ConflictProtocolInputError('Aluno e contractId são obrigatórios.');
  }
  const start = isoTime(input.windowStart);
  const end = isoTime(input.windowEnd);
  if (end <= start || !['complete', 'partial'].includes(input.coverage)) {
    throw new ConflictProtocolInputError('Cobertura ou período inválido.');
  }
  const observations = [...input.observations];
  const seen = new Set<string>();
  for (const row of observations) {
    if (row.alunoId !== input.alunoId || row.contractId !== input.contractId) {
      throw new ConflictProtocolInputError('Evidência de outro aluno ou contrato.');
    }
    const time = isoTime(row.scheduledAt);
    if (time < start || time >= end || !hasValue(row.sessionId)) {
      throw new ConflictProtocolInputError('Evidência fora da janela ou sem sessão.');
    }
    const key = row.sessionId + ':' + row.capacity;
    if (seen.has(key)) throw new ConflictProtocolInputError('Snapshots duplicados de uma capacidade/sessão.');
    seen.add(key);
  }
  observations.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) ||
    a.sessionId.localeCompare(b.sessionId) || a.capacity.localeCompare(b.capacity));
  const evaluations = input.rules.map((rule): ConflictAssessment => {
    if (rule.status !== 'active') return assessment(rule, 'inactive');
    requireActiveRule(rule);
    const missing: string[] = [];
    if (rule.expression.kind === 'single') {
      for (const row of observations.filter((item) => item.capacity === rule.expression.term.capacity)) {
        const item = evaluateTerm(row, rule.expression.term);
        if (item.result === 'yes') return assessment(rule, 'triggered', item.evidence);
        if (item.result === 'unknown') missing.push(...item.missing);
      }
    } else {
      const expression = rule.expression;
      for (const first of observations.filter((item) => item.capacity === expression.first.capacity)) {
        for (const then of observations.filter((item) => item.capacity === expression.then.capacity && item.sessionId !== first.sessionId)) {
          const hours = (Date.parse(then.scheduledAt) - Date.parse(first.scheduledAt)) / 3_600_000;
          if (hours <= 0 || hours < expression.minHours || hours > expression.maxHours) continue;
          const a = evaluateTerm(first, expression.first);
          const b = evaluateTerm(then, expression.then);
          if (a.result === 'yes' && b.result === 'yes') {
            return assessment(rule, 'triggered', [...a.evidence, ...b.evidence]);
          }
          if (a.result !== 'no' && b.result !== 'no') {
            missing.push(...a.missing, ...b.missing);
          }
        }
      }
    }
    return assessment(rule, missing.length || input.coverage === 'partial'
      ? 'insufficient_data' : 'not_triggered', [], missing);
  });
  return {
    protocolVersion: COMBINED_CONFLICT_PROTOCOL_VERSION,
    state: input.rules.some((rule) => rule.status === 'active') ? 'evaluated' as const : 'no_active_rules' as const,
    evaluations,
    changesWorkoutAutomatically: false as const,
  };
}
