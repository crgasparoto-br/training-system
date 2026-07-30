import {
  isAngularFlexibilityMeasurement,
  normalizeCapacityMeasurementDescriptor,
} from '@corrida/types';
import type {
  CapacityPrescriptionAlert,
  CapacityPrescriptionParameterSetView,
  CapacityPrescriptionParameters,
  CapacityPrescriptionSourceRef,
  CapacityPrescriptionStatus,
  CapacityPrescriptionView,
  CyclicCapacityZone,
  FlexibilityArticulationParameters,
  PhysicalCapacityType,
  ProntuarioOverview,
  SaveCapacityPrescriptionPayload,
} from '@corrida/types';
import type { StudentSegmentedProfile } from '../../services/aluno.service';
import type { CapacityAssessmentSourceOption } from '../../services/capacity-prescription.service';

export type PrescriptionDraft = {
  status: CapacityPrescriptionStatus;
  technicalJustification: string;
  professorSummary: string;
  studentMessage: string;
  expectedPse: string;
  method: string;
  split: string;
  sets: string;
  repetitions: string;
  load: string;
  repetitionReserve: string;
  muscleGroups: string[];
  resistedRestrictions: string;
  cyclicCategory: string;
  reversibilityPrinciple: string;
  zoneBasis: 'max_hr' | 'heart_rate_reserve' | 'lan' | 'vo2max' | 'pse';
  cyclicZones: CyclicCapacityZone[];
  vo2MaxPercentage: string;
  anaerobicThreshold: string;
  time: string;
  distance: string;
  balanceFocus: string;
  balanceSupports: string;
  balanceProgressionNotes: string;
  flexibilityArticulations: FlexibilityArticulationParameters[];
  parameterSetId: string;
};

export type CapacityDrafts = Record<PhysicalCapacityType, PrescriptionDraft>;
export type CapacitySourceSelections = Record<PhysicalCapacityType, Set<string>>;
export type TechnicalSourceKind = 'prontuario' | 'preferencia' | 'avaliacao' | 'atividade';

export interface TechnicalSourceSuggestion {
  key: string;
  kind: TechnicalSourceKind;
  title: string;
  description?: string | null;
  assessmentDetails?: CapacityAssessmentSourceOption['details'];
  ref: CapacityPrescriptionSourceRef;
}

export const initialDraft = (): PrescriptionDraft => ({
  status: 'planned',
  technicalJustification: '',
  professorSummary: '',
  studentMessage: '',
  expectedPse: '',
  method: '',
  split: '',
  sets: '',
  repetitions: '',
  load: '',
  repetitionReserve: '',
  muscleGroups: [],
  resistedRestrictions: '',
  cyclicCategory: '',
  reversibilityPrinciple: '',
  zoneBasis: 'heart_rate_reserve',
  cyclicZones: [],
  vo2MaxPercentage: '',
  anaerobicThreshold: '',
  time: '',
  distance: '',
  balanceFocus: '',
  balanceSupports: '',
  balanceProgressionNotes: '',
  flexibilityArticulations: [],
  parameterSetId: '',
});

export const initialDrafts = (): CapacityDrafts => ({
  resisted: initialDraft(),
  flexibility: initialDraft(),
  cyclic: initialDraft(),
  balance: initialDraft(),
});

export const initialSourceSelections = (): CapacitySourceSelections => ({
  resisted: new Set<string>(),
  flexibility: new Set<string>(),
  cyclic: new Set<string>(),
  balance: new Set<string>(),
});

function numberText(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value);
}

export function applyParametersToDraft(
  draft: PrescriptionDraft,
  parameters?: CapacityPrescriptionParameters | null
): PrescriptionDraft {
  if (!parameters) return draft;

  if (parameters.type === 'resisted') {
    return {
      ...draft,
      expectedPse: numberText(parameters.resisted.expectedPse),
      method: parameters.resisted.method ?? '',
      split: parameters.resisted.split ?? '',
      sets: numberText(parameters.resisted.sets),
      repetitions: parameters.resisted.repetitions ?? '',
      load: parameters.resisted.load ?? '',
      repetitionReserve: parameters.resisted.repetitionReserve ?? '',
      muscleGroups: [...(parameters.resisted.muscleGroups ?? [])],
      resistedRestrictions: (parameters.resisted.restrictions ?? []).join(', '),
    };
  }

  if (parameters.type === 'cyclic') {
    return {
      ...draft,
      expectedPse: numberText(parameters.cyclic.expectedPse),
      cyclicCategory: parameters.cyclic.category ?? '',
      reversibilityPrinciple: parameters.cyclic.reversibilityPrinciple ?? '',
      zoneBasis: parameters.cyclic.zoneBasis ?? 'heart_rate_reserve',
      cyclicZones: (parameters.cyclic.zones ?? []).map((zone) => ({ ...zone })),
      vo2MaxPercentage: numberText(parameters.cyclic.vo2MaxPercentage),
      anaerobicThreshold: parameters.cyclic.anaerobicThreshold ?? '',
      time: parameters.cyclic.time ?? '',
      distance: parameters.cyclic.distance ?? '',
    };
  }

  if (parameters.type === 'flexibility') {
    return {
      ...draft,
      expectedPse: numberText(parameters.flexibility.expectedPse),
      flexibilityArticulations: (parameters.flexibility.articulations ?? []).map((item) => ({
        ...item,
      })),
    };
  }

  return {
    ...draft,
    expectedPse: numberText(parameters.balance.expectedPse),
    balanceFocus: parameters.balance.focus ?? '',
    balanceSupports: (parameters.balance.supports ?? []).join(', '),
    balanceProgressionNotes: parameters.balance.progressionNotes ?? '',
  };
}

export function hydrateDraftsFromPrescriptions(
  prescriptions: CapacityPrescriptionView[]
): CapacityDrafts {
  const drafts = initialDrafts();

  for (const prescription of prescriptions) {
    const latest = prescription.latestVersion;
    let draft: PrescriptionDraft = {
      ...initialDraft(),
      status: prescription.status,
    };

    if (latest) {
      draft = applyParametersToDraft(
        {
          ...draft,
          status: latest.status,
          technicalJustification: latest.technicalJustification,
          professorSummary: latest.professorSummary,
          studentMessage: latest.studentMessage ?? '',
          parameterSetId: latest.parameterSetIds[0] ?? '',
        },
        latest.parameters
      );
    }

    drafts[prescription.capacity] = draft;
  }

  return drafts;
}

export function hydrateSourceSelections(
  prescriptions: CapacityPrescriptionView[]
): CapacitySourceSelections {
  const selections = initialSourceSelections();
  for (const prescription of prescriptions) {
    selections[prescription.capacity] = new Set(
      (prescription.latestVersion?.sourceRefs ?? []).map(sourceKey)
    );
  }
  return selections;
}

export function applyParameterSetToDraft(
  draft: PrescriptionDraft,
  parameterSet: CapacityPrescriptionParameterSetView
): PrescriptionDraft {
  return applyParametersToDraft(
    { ...draft, parameterSetId: parameterSet.id },
    parameterSet.parameters
  );
}

function splitCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildManualParameters(
  capacity: PhysicalCapacityType,
  draft: PrescriptionDraft
): CapacityPrescriptionParameters {
  const expectedPse = draft.expectedPse ? Number(draft.expectedPse) : null;

  if (capacity === 'resisted') {
    return {
      type: 'resisted',
      resisted: {
        muscleGroups: draft.muscleGroups,
        method: draft.method || null,
        split: draft.split || null,
        sets: draft.sets ? Number(draft.sets) : null,
        repetitions: draft.repetitions || null,
        load: draft.load || null,
        repetitionReserve: draft.repetitionReserve || null,
        expectedPse,
        restrictions: splitCsv(draft.resistedRestrictions),
      },
    };
  }

  if (capacity === 'cyclic') {
    return {
      type: 'cyclic',
      cyclic: {
        category: draft.cyclicCategory || null,
        reversibilityPrinciple: draft.reversibilityPrinciple || null,
        zoneBasis: draft.zoneBasis,
        zones: draft.cyclicZones.map((zone) => ({ ...zone })),
        vo2MaxPercentage: draft.vo2MaxPercentage ? Number(draft.vo2MaxPercentage) : null,
        anaerobicThreshold: draft.anaerobicThreshold || null,
        time: draft.time || null,
        distance: draft.distance || null,
        expectedPse,
      },
    };
  }

  if (capacity === 'flexibility') {
    return {
      type: 'flexibility',
      flexibility: {
        articulations: draft.flexibilityArticulations,
        expectedPse,
      },
    };
  }

  return {
    type: 'balance',
    balance: {
      focus: draft.balanceFocus || null,
      supports: splitCsv(draft.balanceSupports),
      progressionNotes: draft.balanceProgressionNotes || null,
      expectedPse,
    },
  };
}

export function sourceKey(ref: CapacityPrescriptionSourceRef) {
  return `${ref.type}:${ref.id}`;
}

function hasMeaningfulObject(value: Record<string, unknown> | null | undefined) {
  if (!value) return false;
  return Object.values(value).some((item) => {
    if (item === null || item === undefined || item === '') return false;
    if (Array.isArray(item)) return item.length > 0;
    if (typeof item === 'object') return Object.keys(item as Record<string, unknown>).length > 0;
    return true;
  });
}

function sourceKind(ref: CapacityPrescriptionSourceRef): TechnicalSourceKind {
  if (ref.type === 'student_preference') return 'preferencia';
  if (ref.type === 'prontuario_goal' || ref.type === 'prontuario_alert') return 'prontuario';
  if (ref.type === 'professor_note') return 'atividade';
  return 'avaliacao';
}

function persistedSuggestion(ref: CapacityPrescriptionSourceRef): TechnicalSourceSuggestion {
  return {
    key: sourceKey(ref),
    kind: sourceKind(ref),
    title: ref.label,
    description: [ref.origin, ref.assessedAt ? new Date(ref.assessedAt).toLocaleDateString('pt-BR') : null]
      .filter(Boolean)
      .join(' · '),
    ref,
  };
}

export function mergeTechnicalSourceSuggestions(
  suggestions: TechnicalSourceSuggestion[],
  persistedRefs: CapacityPrescriptionSourceRef[]
): TechnicalSourceSuggestion[] {
  return Array.from(
    new Map(
      [...persistedRefs.map(persistedSuggestion), ...suggestions].map((item) => [item.key, item])
    ).values()
  );
}

function formatAssessmentDetails(source: CapacityAssessmentSourceOption) {
  const details = source.details
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== '')
    .slice(0, 4)
    .map((item) => `${item.label}: ${String(item.value)}${item.unit ? ` ${item.unit}` : ''}`);
  return [source.category, source.status, ...details].filter(Boolean).join(' · ');
}

const flexibilityArticulationAliases = [
  { name: 'Coluna cervical', aliases: ['coluna_cervical', 'cervical', 'pescoco'] },
  { name: 'Ombro', aliases: ['ombro'] },
  { name: 'Cotovelo', aliases: ['cotovelo'] },
  { name: 'Punho', aliases: ['punho'] },
  { name: 'Dedos', aliases: ['dedos', 'dedo'] },
  { name: 'Quadril', aliases: ['quadril'] },
  { name: 'Joelho', aliases: ['joelho'] },
  { name: 'Tornozelo', aliases: ['tornozelo'] },
] as const;

function assessmentDetailNumber(value: string | number | boolean | null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function mergeFlexibilityArticulationsFromAssessmentDetails(
  current: FlexibilityArticulationParameters[],
  details: CapacityAssessmentSourceOption['details']
): FlexibilityArticulationParameters[] {
  const merged = current.map((item) => ({ ...item }));
  const indexByName = new Map(
    merged.map((item, index) => [normalizeCapacityMeasurementDescriptor(item.name), index])
  );

  for (const detail of details) {
    if (
      !isAngularFlexibilityMeasurement({
        metricLabel: detail.label,
        unit: detail.unit,
      })
    ) {
      continue;
    }

    const descriptor = normalizeCapacityMeasurementDescriptor(detail.label);
    const articulation = flexibilityArticulationAliases.find((candidate) =>
      candidate.aliases.some((alias) => descriptor.includes(alias))
    );
    const angle = assessmentDetailNumber(detail.value);
    if (!articulation || angle === null) continue;

    const normalizedName = normalizeCapacityMeasurementDescriptor(articulation.name);
    const existingIndex = indexByName.get(normalizedName);
    if (existingIndex !== undefined) {
      const existing = merged[existingIndex];
      if (existing.angle === null || existing.angle === undefined) {
        merged[existingIndex] = { ...existing, angle };
      }
      continue;
    }

    indexByName.set(normalizedName, merged.length);
    merged.push({ name: articulation.name, angle, priority: 'medium' });
  }

  return merged;
}

export function buildTechnicalSourceSuggestions(input: {
  overview: ProntuarioOverview;
  profile: StudentSegmentedProfile | null;
  profileRecordId?: string | null;
  assessmentSources: CapacityAssessmentSourceOption[];
}): TechnicalSourceSuggestion[] {
  const suggestions: TechnicalSourceSuggestion[] = [];
  const record = input.overview.currentRecord;

  for (const pain of record?.painCases ?? []) {
    if (pain.status !== 'active' && pain.status !== 'monitoring') continue;
    const ref: CapacityPrescriptionSourceRef = {
      type: 'prontuario_alert',
      id: pain.id,
      label: `Dor ou condição em acompanhamento: ${pain.title}`,
      assessedAt: pain.onsetDate ?? null,
      origin: 'PRNT - casos de dor',
    };
    suggestions.push({
      key: sourceKey(ref),
      kind: 'prontuario',
      title: pain.title,
      description: pain.region ? `Região: ${pain.region}` : pain.description,
      ref,
    });
  }

  for (const followUp of record?.anamnesisFollowUps ?? []) {
    if (followUp.status !== 'active' && followUp.status !== 'monitoring') continue;
    const ref: CapacityPrescriptionSourceRef = {
      type: 'prontuario_alert',
      id: followUp.id,
      label: `Acompanhamento de anamnese: ${followUp.itemLabel}`,
      origin: 'PRNT - acompanhamento da anamnese',
    };
    suggestions.push({
      key: sourceKey(ref),
      kind: 'prontuario',
      title: followUp.itemLabel,
      description: followUp.followUpNotes ?? followUp.actionPlan,
      ref,
    });
  }

  for (const medication of record?.medicationsProcedures ?? []) {
    const ref: CapacityPrescriptionSourceRef = {
      type: 'prontuario_alert',
      id: medication.id,
      label: `${medication.type === 'medication' ? 'Medicamento' : 'Procedimento'}: ${medication.name}`,
      assessedAt: medication.startDate ?? null,
      origin: 'PRNT - medicações e procedimentos',
    };
    suggestions.push({
      key: sourceKey(ref),
      kind: 'prontuario',
      title: medication.name,
      description: medication.notes ?? medication.frequency,
      ref,
    });
  }

  for (const snapshot of (record?.discomfortSnapshots ?? []).slice(0, 1)) {
    const ref: CapacityPrescriptionSourceRef = {
      type: 'prontuario_alert',
      id: snapshot.id,
      label: 'Mapa corporal com desconfortos registrados',
      assessedAt: snapshot.snapshotAt,
      origin: 'PRNT - desconfortos',
    };
    suggestions.push({
      key: sourceKey(ref),
      kind: 'prontuario',
      title: 'Desconfortos corporais',
      description: `${snapshot.entries.length} região(ões) registradas`,
      ref,
    });
  }

  for (const activity of record?.activityHistory ?? []) {
    const ref: CapacityPrescriptionSourceRef = {
      type: 'professor_note',
      id: activity.id,
      label: `Histórico de atividade física: ${activity.description}`,
      assessedAt: activity.startedAt ?? null,
      origin: 'PRNT - histórico de atividade física',
    };
    suggestions.push({
      key: sourceKey(ref),
      kind: 'atividade',
      title: activity.description,
      description: [activity.frequency, activity.duration, activity.intensity].filter(Boolean).join(' · '),
      ref,
    });
  }

  if (input.profile && input.profileRecordId && hasMeaningfulObject(input.profile.preferences)) {
    const ref: CapacityPrescriptionSourceRef = {
      type: 'student_preference',
      id: input.profileRecordId,
      label: 'Preferências e restrições cadastradas pelo aluno',
      assessedAt: input.profile.updatedAt ?? null,
      origin: 'Perfil segmentado do aluno',
      version: input.profile.updatedAt ?? null,
    };
    suggestions.push({
      key: sourceKey(ref),
      kind: 'preferencia',
      title: 'Preferências e restrições do aluno',
      description: 'Usar como condicionante técnico, sem decisão automática.',
      ref,
    });
  }

  for (const assessment of input.assessmentSources) {
    suggestions.push({
      key: sourceKey(assessment.ref),
      kind: 'avaliacao',
      title: assessment.ref.label,
      description: formatAssessmentDetails(assessment),
      assessmentDetails: assessment.details,
      ref: assessment.ref,
    });
  }

  return Array.from(new Map(suggestions.map((item) => [item.key, item])).values());
}

export function buildContextAlerts(
  sourceRefs: CapacityPrescriptionSourceRef[]
): CapacityPrescriptionAlert[] {
  return sourceRefs
    .filter(
      (source) =>
        source.type === 'professor_note' &&
        source.origin === 'PRNT - histórico de atividade física'
    )
    .map((source) => ({
      code: 'ACTIVITY_HISTORY_CONTEXT',
      message: `Histórico de atividade a considerar: ${source.label.replace(/^Histórico de atividade física:\s*/, '')}`,
      severity: 'info' as const,
      sourceRefId: source.id,
    }));
}

export function buildSavePayload(input: {
  capacity: PhysicalCapacityType;
  draft: PrescriptionDraft;
  currentVersion: number;
  sourceRefs: CapacityPrescriptionSourceRef[];
  linkedProntuarioGoalIds: string[];
  parameterSet?: CapacityPrescriptionParameterSetView;
}): SaveCapacityPrescriptionPayload {
  const common = {
    capacity: input.capacity,
    status: input.draft.status,
    expectedCurrentVersion: input.currentVersion,
    sourceRefs: input.sourceRefs,
    linkedProntuarioGoalIds: input.linkedProntuarioGoalIds,
    technicalJustification: input.draft.technicalJustification,
    professorSummary: input.draft.professorSummary,
    studentMessage: input.draft.studentMessage || null,
    alerts: buildContextAlerts(input.sourceRefs),
  } satisfies Omit<
    SaveCapacityPrescriptionPayload,
    'parameters' | 'parameterSetIds' | 'methodologyVersion'
  >;

  if (input.parameterSet) {
    return {
      ...common,
      parameterSetIds: [input.parameterSet.id],
      methodologyVersion: input.parameterSet.methodologyVersion,
    };
  }

  return {
    ...common,
    parameters: buildManualParameters(input.capacity, input.draft),
    parameterSetIds: [],
    methodologyVersion: null,
  };
}
