import { describe, expect, it } from 'vitest';
import type {
  CapacityPrescriptionParameterSetView,
  CapacityPrescriptionView,
  ProntuarioOverview,
} from '@corrida/types';
import type { StudentSegmentedProfile } from '../../services/aluno.service';
import type { CapacityAssessmentSourceOption } from '../../services/capacity-prescription.service';
import {
  applyParameterSetToDraft,
  buildManualParameters,
  buildSavePayload,
  buildTechnicalSourceSuggestions,
  hydrateDraftsFromPrescriptions,
  hydrateSourceSelections,
  initialDraft,
  mergeTechnicalSourceSuggestions,
} from './capacityPrescriptionScreen.model';

const parameterSet: CapacityPrescriptionParameterSetView = {
  id: 'parameter-set-cyclic',
  contractId: 'contract-a',
  capacity: 'cyclic',
  code: 'CYCLIC_CANONICAL',
  name: 'Cíclico canônico',
  version: 3,
  methodologyVersion: 'cyclic-v3',
  parameters: {
    type: 'cyclic',
    cyclic: {
      category: 'intervalado',
      reversibilityPrinciple: 'reavaliar_apos_pausa',
      zoneBasis: 'lan',
      zones: [{ name: 'Z4', minPercent: 80, maxPercent: 90, volume: '8 min' }],
      expectedPse: 7,
    },
  },
  isCurrent: true,
  createdByProfessorId: 'professor-a',
  createdAt: '2026-07-27T10:00:00.000Z',
  updatedAt: '2026-07-27T10:00:00.000Z',
};

const prescriptionA: CapacityPrescriptionView = {
  id: 'prescription-a',
  contractId: 'contract-a',
  alunoId: 'aluno-a',
  capacity: 'resisted',
  status: 'active',
  currentVersion: 2,
  createdByProfessorId: 'professor-a',
  updatedByProfessorId: 'professor-a',
  createdAt: '2026-07-27T10:00:00.000Z',
  updatedAt: '2026-07-27T11:00:00.000Z',
  publishesTodayWorkout: false,
  latestVersion: {
    id: 'version-a-2',
    prescriptionId: 'prescription-a',
    contractId: 'contract-a',
    alunoId: 'aluno-a',
    capacity: 'resisted',
    status: 'active',
    version: 2,
    responsibleProfessorId: 'professor-a',
    technicalJustification: 'Justificativa exclusiva do aluno A',
    professorSummary: 'Resumo A',
    parameterSetIds: [],
    parameters: {
      type: 'resisted',
      resisted: {
        sets: 4,
        method: 'circuito',
        expectedPse: 8,
        restrictions: ['Evitar flexão profunda'],
      },
    },
    sourceRefs: [
      {
        type: 'prontuario_alert',
        id: 'pain-1',
        label: 'Dor no joelho',
        origin: 'PRNT',
      },
    ],
    linkedProntuarioGoalIds: [],
    alerts: [],
    createdAt: '2026-07-27T11:00:00.000Z',
    publishesTodayWorkout: false,
  },
};

describe('capacity prescription screen model', () => {
  it('usa um conjunto versionado como fonte canônica sem parâmetros manuais concorrentes', () => {
    const draft = applyParameterSetToDraft(
      {
        ...initialDraft(),
        technicalJustification: 'Justificativa',
        professorSummary: 'Resumo',
      },
      parameterSet
    );

    const payload = buildSavePayload({
      capacity: 'cyclic',
      draft,
      currentVersion: 2,
      sourceRefs: [
        {
          type: 'professor_note',
          id: 'manual-a',
          label: 'Definição técnica',
          origin: 'Tela de prescrição por capacidades',
        },
      ],
      linkedProntuarioGoalIds: [],
      parameterSet,
    });

    expect(payload.parameterSetIds).toEqual(['parameter-set-cyclic']);
    expect(payload.methodologyVersion).toBe('cyclic-v3');
    expect(payload).not.toHaveProperty('parameters');
    expect(draft.cyclicZones).toEqual([
      expect.objectContaining({ name: 'Z4', volume: '8 min' }),
    ]);
  });

  it('serializa todos os parâmetros manuais antes ausentes', () => {
    const cyclic = buildManualParameters('cyclic', {
      ...initialDraft(),
      reversibilityPrinciple: 'reduzir_volume_apos_14_dias',
      cyclicZones: [
        {
          name: 'Z2',
          minPercent: 60,
          maxPercent: 70,
          volume: '30 min',
          pace: '5:40/km',
          targetHeartRate: '138-151 bpm',
        },
      ],
    });
    const resisted = buildManualParameters('resisted', {
      ...initialDraft(),
      resistedRestrictions: 'Evitar impacto, amplitude sem dor',
    });
    const balance = buildManualParameters('balance', {
      ...initialDraft(),
      balanceProgressionNotes: 'Progredir para apoio unipodal após validação.',
    });

    expect(cyclic).toMatchObject({
      type: 'cyclic',
      cyclic: {
        reversibilityPrinciple: 'reduzir_volume_apos_14_dias',
        zones: [
          {
            name: 'Z2',
            volume: '30 min',
            pace: '5:40/km',
            targetHeartRate: '138-151 bpm',
          },
        ],
      },
    });
    expect(resisted).toMatchObject({
      type: 'resisted',
      resisted: { restrictions: ['Evitar impacto', 'amplitude sem dor'] },
    });
    expect(balance).toMatchObject({
      type: 'balance',
      balance: { progressionNotes: 'Progredir para apoio unipodal após validação.' },
    });
  });

  it('hidrata rascunho e fontes somente na capacidade da versão', () => {
    const drafts = hydrateDraftsFromPrescriptions([prescriptionA]);
    const selections = hydrateSourceSelections([prescriptionA]);

    expect(drafts.resisted.technicalJustification).toBe('Justificativa exclusiva do aluno A');
    expect(drafts.resisted.resistedRestrictions).toBe('Evitar flexão profunda');
    expect(drafts.cyclic.technicalJustification).toBe('');
    expect([...selections.resisted]).toEqual(['prontuario_alert:pain-1']);
    expect([...selections.cyclic]).toEqual([]);
  });

  it('preserva fonte histórica ausente da lista atual sem selecionar fonte nova', () => {
    const persisted = prescriptionA.latestVersion?.sourceRefs ?? [];
    const merged = mergeTechnicalSourceSuggestions(
      [
        {
          key: 'physical_assessment:new-assessment',
          kind: 'avaliacao',
          title: 'Avaliação nova',
          ref: {
            type: 'physical_assessment',
            id: 'new-assessment',
            label: 'Avaliação nova',
          },
        },
      ],
      persisted
    );
    const selections = hydrateSourceSelections([prescriptionA]);

    expect(merged.map((item) => item.key)).toEqual([
      'prontuario_alert:pain-1',
      'physical_assessment:new-assessment',
    ]);
    expect(selections.resisted.has('prontuario_alert:pain-1')).toBe(true);
    expect(selections.resisted.has('physical_assessment:new-assessment')).toBe(false);
  });

  it('expõe autoria e dados-base fornecidos pelo endpoint canônico de avaliações', () => {
    const overview = {
      currentRecord: null,
    } as unknown as ProntuarioOverview;
    const profile = {
      alunoId: 'aluno-a',
      source: { type: 'student' },
      identification: {},
      preferences: null,
      objectives: null,
    } as StudentSegmentedProfile;
    const assessmentSources: CapacityAssessmentSourceOption[] = [
      {
        ref: {
          type: 'adipometry',
          id: 'adpt-1',
          label: 'Adipometria 2026',
          assessedAt: '2026-07-20T10:00:00.000Z',
          origin: 'ADPT-001',
          version: '2026-07-20T11:00:00.000Z',
          responsibleProfessorId: 'professor-a',
        },
        category: 'adipometry',
        status: 'completed',
        details: [
          { label: '% Gordura', value: 18.2, unit: '%' },
          { label: 'Massa magra', value: 62.5, unit: 'kg' },
        ],
      },
    ];

    const suggestions = buildTechnicalSourceSuggestions({
      overview,
      profile,
      profileRecordId: null,
      assessmentSources,
    });

    expect(suggestions[0].ref.responsibleProfessorId).toBe('professor-a');
    expect(suggestions[0].description).toContain('% Gordura: 18.2 %');
    expect(suggestions[0].description).toContain('Massa magra: 62.5 kg');
  });
});
