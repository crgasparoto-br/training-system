import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  AdipometryAssessmentDetail,
  AdipometryCalculationPreview,
  AdipometryProtocolSummary,
} from '@corrida/types';
import { describe, expect, it, vi } from 'vitest';
import { SkinfoldHelpDialog } from './AdipometryDialogs';
import { adipometryFormFromAssessment } from './adipometry-screen-utils';
import {
  AdipometryEditor,
  displayAdipometryMeasurement,
} from './AdipometryEditor';
import {
  Results,
  SupportCard,
  formatAdipometryResult,
} from './AdipometryViewSections';
import { createEmptyAdipometryForm, formatAdipometryInput } from './adipometry-ui';

const protocol: AdipometryProtocolSummary = {
  code: 'GUEDES_1991_ADULT_YOUNG',
  name: 'Guedes 1991 — adultos jovens',
  version: 1,
  status: 'APPROVED',
  compatibility: { compatible: true, reasons: [], warnings: [] },
  population: {
    ageMinYears: 18,
    ageMaxYears: 30,
    sexCriteria: ['MALE', 'FEMALE'],
    maturationCriteria: 'adult',
  },
  selectionReason:
    'Protocolo com aprovação clínica ativa e faixa etária compatível (18 a 30 anos) na data da avaliação.',
  displayPrecision: {
    measurementScale: 1,
    resultScale: 2,
    skinfoldTotalScale: 1,
  },
};

const current: AdipometryAssessmentDetail = {
  id: 'assessment-1',
  contractId: 'contract-1',
  alunoId: 'aluno-1',
  professorId: 'professor-1',
  code: 'ADPT-001',
  sequenceNumber: 1,
  assessmentDate: '2026-08-05',
  status: 'DRAFT',
  revisionStatus: 'DRAFT',
  rootAssessmentId: 'assessment-1',
  revisionNumber: 1,
  protocolCode: protocol.code,
  protocolVersion: protocol.version,
  measurements: {},
  createdAt: '2026-08-05T10:00:00.000Z',
  updatedAt: '2026-08-05T10:00:00.000Z',
};

const preview: AdipometryCalculationPreview = {
  protocol,
  normalizedMeasurements: {},
  usedSkinfolds: [],
  compatibility: protocol.compatibility,
  results: {
    skinfoldTotalMm: 80,
    bodyFatPercentage: 19.4,
    fatMassKg: 15.52,
    leanMassKg: 64.48,
  },
  inputFingerprint: 'a'.repeat(64),
  canFinalize: true,
  anthropometrySupport: { latestEligible: null, linked: null },
};

describe('ADPT audit remediation presentation', () => {
  it('preserva a escala visual definida pelo protocolo', () => {
    expect(formatAdipometryInput(80, 1)).toBe('80,0');
    expect(displayAdipometryMeasurement('80', 1, false)).toBe('80,0');
    expect(displayAdipometryMeasurement('80,25', 1, true)).toBe('80,25');
    const persistedForm = adipometryFormFromAssessment({
      ...current,
      measurements: { weightKg: 80 },
      calculationSnapshot: {
        protocolApproval: {
          protocolDefinitionSnapshot: {
            precision: { measurementScale: 1 },
          },
        },
      },
    } as unknown as AdipometryAssessmentDetail);
    expect(persistedForm.measurements.weightKg).toBe('80,0');
    expect(formatAdipometryResult(19.4, '%', 2)).toBe('19,40 %');
    render(<Results preview={preview} detail={current} />);
    expect(screen.getByText('80,0 mm')).toBeInTheDocument();
    expect(screen.getByText('19,40 %')).toBeInTheDocument();
  });

  it('explica população e motivo de disponibilidade do protocolo', () => {
    const form = {
      ...createEmptyAdipometryForm(),
      protocolKey: `${protocol.code}::${protocol.version}`,
    };
    render(
      <MemoryRouter>
        <AdipometryEditor
          selectedAlunoId="aluno-1"
          current={current}
          assessments={[]}
          protocols={[protocol]}
          form={form}
          preview={null}
          support={null}
          fieldErrors={{}}
          busy={false}
          dirty={false}
          canMutate
          canCorrect={false}
          capacityWarningConfirmed={false}
          onForm={vi.fn()}
          onMeasurement={vi.fn()}
          onHelp={vi.fn()}
          onSave={vi.fn()}
          onCalculate={vi.fn()}
          onFinalize={vi.fn()}
          onCorrection={vi.fn()}
          onCancelCorrection={vi.fn()}
          onOpen={vi.fn()}
          onCapacityWarning={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Contexto do protocolo')).toBeInTheDocument();
    expect(screen.getByText(/População: 18 a 30 anos/)).toBeInTheDocument();
    expect(screen.getByText(/Motivo da disponibilidade:/)).toBeInTheDocument();
  });

  it('distingue distâncias de localização e abre a avaliação antropométrica de origem', () => {
    render(
      <MemoryRouter>
        <SupportCard
          studentId="aluno-1"
          selectedId=""
          disabled={false}
          onSelect={vi.fn()}
          support={{
            latestEligible: {
              anthropometryAssessmentId: 'antr-14',
              assessmentCode: 'ANTR-014',
              assessmentDate: '2026-08-01',
              notes: null,
              measurements: [
                {
                  segmentId: 'triceps-reference',
                  segmentName: 'Distância olécrano acrômio clavicular',
                  segmentType: 'linear',
                  technicalDescription: null,
                  formulaHint: 'Ponto médio tricipital',
                  value: 31.4,
                  unit: 'cm',
                  observation: null,
                },
                {
                  segmentId: 'thigh-reference',
                  segmentName: 'Distância ligamento inguinal patela',
                  segmentType: 'linear',
                  technicalDescription: null,
                  formulaHint: 'Ponto médio da coxa',
                  value: 43.8,
                  unit: 'cm',
                  observation: null,
                },
              ],
              observations: [],
            },
            selected: null,
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/não são dobras cutâneas medidas/i)).toBeInTheDocument();
    expect(screen.getByText(/Ponto médio tricipital/)).toBeInTheDocument();
    expect(screen.getByText(/Ponto médio da coxa/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Abrir avaliação de origem ANTR-014/i })
    ).toHaveAttribute(
      'href',
      '/protocolo-avaliacao-fisica/antropometria?alunoId=aluno-1&assessmentId=antr-14'
    );
  });

  it('substitui imagem quebrada por fallback sem remover texto ou vídeo', () => {
    render(
      <SkinfoldHelpDialog
        item={{
          field: 'tricepsMm',
          label: 'Dobra tricipital',
          description: 'Descrição técnica preservada.',
          imageUrl: 'https://example.invalid/reference.png',
          videoUrl: 'https://youtube.com/shorts/example',
        }}
        onClose={vi.fn()}
      />
    );

    fireEvent.error(
      screen.getByRole('img', { name: /Referência anatômica/i })
    );

    expect(
      screen.getByText(/Não foi possível carregar a imagem de referência/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Descrição técnica preservada.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir vídeo/i })).toBeInTheDocument();
  });
});
