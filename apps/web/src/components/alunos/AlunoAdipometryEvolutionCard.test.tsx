import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdipometryAssessmentDetail, AdipometryAssessmentSummary } from '@corrida/types';
import { adipometryService } from '../../services/adipometry.service';
import type { Assessment } from '../../services/assessment.service';
import { AlunoAdipometryEvolutionCard } from './AlunoAdipometryEvolutionCard';

type Permission = { screenKey: string; blockKey: string | null; canView: boolean };
type MockUser = {
  type: 'professor';
  accessControl: { isMaster: boolean; permissions: Permission[] };
};

const authState = vi.hoisted(() => ({
  user: {
    type: 'professor',
    accessControl: { isMaster: true, permissions: [] },
  } as MockUser,
}));

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: { user: MockUser }) => unknown) => selector({ user: authState.user }),
}));

vi.mock('../../services/adipometry.service', () => ({
  adipometryService: {
    listAssessments: vi.fn(),
    getAssessment: vi.fn(),
    listResponsibleProfessors: vi.fn(),
    compare: vi.fn(),
  },
}));

const listAssessmentsMock = vi.mocked(adipometryService.listAssessments);
const getAssessmentMock = vi.mocked(adipometryService.getAssessment);
const listResponsibleProfessorsMock = vi.mocked(adipometryService.listResponsibleProfessors);
const compareMock = vi.mocked(adipometryService.compare);

const completed = (overrides: Partial<AdipometryAssessmentSummary> = {}): AdipometryAssessmentSummary => ({
  id: 'adpt-2',
  contractId: 'contract-1',
  alunoId: 'aluno-1',
  professorId: 'professor-1',
  code: 'ADPT-002',
  sequenceNumber: 2,
  assessmentDate: '2026-07-10',
  status: 'COMPLETED',
  revisionStatus: 'FINALIZED',
  rootAssessmentId: 'adpt-2',
  revisionNumber: 1,
  protocolCode: 'GUEDES',
  protocolVersion: 2,
  bodyFatPercentage: 18.4,
  createdAt: '2026-07-10T12:00:00.000Z',
  updatedAt: '2026-07-10T12:00:00.000Z',
  ...overrides,
});

const detail = (summary: AdipometryAssessmentSummary): AdipometryAssessmentDetail => ({
  ...summary,
  measurements: {
    weightKg: 70,
    tricepsMm: 10,
    subscapularMm: 11,
    suprailiacMm: 12,
    abdominalMm: 13,
    thighMm: 14,
  },
  results: {
    skinfoldTotalMm: 60,
    bodyFatPercentage: 18.4,
    fatMassKg: 12.88,
    leanMassKg: 57.12,
  },
});

function renderCard(assessments: Assessment[] = []) {
  return render(
    <MemoryRouter>
      <AlunoAdipometryEvolutionCard alunoId="aluno-1" assessments={assessments} />
    </MemoryRouter>
  );
}

function viewOnlyUser(): MockUser {
  return {
    type: 'professor',
    accessControl: {
      isMaster: false,
      permissions: [
        { screenKey: 'students.details', blockKey: null, canView: true },
        { screenKey: 'students.details', blockKey: 'students.details.assessments', canView: true },
        { screenKey: 'physicalAssessment.protocol', blockKey: null, canView: true },
        { screenKey: 'physicalAssessment.protocol', blockKey: 'physicalAssessment.adpt.view', canView: true },
        { screenKey: 'physicalAssessment.protocol', blockKey: 'physicalAssessment.adpt.actions.manage', canView: false },
      ],
    },
  };
}

describe('AlunoAdipometryEvolutionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      type: 'professor',
      accessControl: { isMaster: true, permissions: [] },
    };
    listResponsibleProfessorsMock.mockResolvedValue([{ id: 'professor-1', name: 'Profa. Maria' }]);
    listAssessmentsMock.mockResolvedValue([]);
  });

  it('mantem estado vazio como informacao e preserva a acao contextual', async () => {
    renderCard();

    await waitFor(() => expect(screen.getByText('Nenhuma adipometria concluída')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Nova adipometria' })).toHaveAttribute(
      'href',
      '/protocolo-avaliacao-fisica/adipometria?alunoId=aluno-1'
    );
    expect(screen.getByText(/demais avaliações e áreas da Central/i)).toBeInTheDocument();
  });

  it('mostra resumo vigente e rascunho separado somente para gestao', async () => {
    const latest = completed();
    const draft = completed({
      id: 'draft-1',
      code: 'ADPT-003',
      sequenceNumber: 3,
      status: 'DRAFT',
      revisionStatus: 'DRAFT',
      rootAssessmentId: 'draft-1',
      protocolCode: undefined,
      protocolVersion: undefined,
      updatedAt: '2026-07-12T12:00:00.000Z',
    });
    listAssessmentsMock.mockResolvedValue([draft, latest]);
    getAssessmentMock.mockResolvedValue(detail(latest));

    renderCard();

    await waitFor(() => expect(screen.getByText('Última adipometria concluída')).toBeInTheDocument());
    expect(screen.getByText(/ADPT-002.*Profa. Maria.*GUEDES v2/i)).toBeInTheDocument();
    expect(screen.getByText('70 kg')).toBeInTheDocument();
    expect(screen.getByText('18,4 %')).toBeInTheDocument();
    expect(screen.getByText('Pendências operacionais (1)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retomar rascunho' })).toHaveAttribute(
      'href',
      '/protocolo-avaliacao-fisica/adipometria?alunoId=aluno-1&assessmentId=draft-1'
    );
  });

  it('nao mostra criacao nem rascunhos para usuario somente leitura', async () => {
    authState.user = viewOnlyUser();
    const latest = completed();
    listAssessmentsMock.mockResolvedValue([
      latest,
      completed({ id: 'draft-1', status: 'DRAFT', revisionStatus: 'DRAFT' }),
    ]);
    getAssessmentMock.mockResolvedValue(detail(latest));

    renderCard();

    await waitFor(() => expect(screen.getByText('Última adipometria concluída')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Nova adipometria' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Pendências operacionais/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Retomar rascunho' })).not.toBeInTheDocument();
  });

  it('nao consulta ADPT sem as duas permissoes de visualizacao', () => {
    authState.user = {
      type: 'professor',
      accessControl: {
        isMaster: false,
        permissions: [
          { screenKey: 'students.details', blockKey: null, canView: true },
          { screenKey: 'students.details', blockKey: 'students.details.assessments', canView: true },
          { screenKey: 'physicalAssessment.protocol', blockKey: null, canView: true },
          { screenKey: 'physicalAssessment.protocol', blockKey: 'physicalAssessment.adpt.view', canView: false },
        ],
      },
    };

    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
    expect(listAssessmentsMock).not.toHaveBeenCalled();
  });

  it('distingue ADPT estruturada de upload generico mesmo quando o upload menciona adipometria', async () => {
    const latest = completed();
    const uploadedAssessment: Assessment = {
      id: 'upload-1',
      alunoId: 'aluno-1',
      typeId: 'type-upload',
      assessmentDate: '2026-07-15',
      filePath: '/uploads/adipometria.pdf',
      originalFileName: 'adipometria.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      createdAt: '2026-07-15T12:00:00.000Z',
      updatedAt: '2026-07-15T12:00:00.000Z',
      type: { id: 'type-upload', name: 'Adipometria por PDF', code: 'ADPT-UPLOAD' },
      professional: { user: { profile: { name: 'Prof. João' } } },
    };
    listAssessmentsMock.mockResolvedValue([latest]);
    getAssessmentMock.mockResolvedValue(detail(latest));

    renderCard([uploadedAssessment]);

    await waitFor(() => expect(screen.getByText(/Origem: Avaliação estruturada ADPT/i)).toBeInTheDocument());
    expect(screen.getByText(/Adipometria por PDF.*ADPT-UPLOAD/i)).toBeInTheDocument();
    expect(screen.getByText(/Origem: Upload genérico/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: 'adpt' } });
    expect(screen.queryByText(/Adipometria por PDF.*ADPT-UPLOAD/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Origem: Avaliação estruturada ADPT/i)).toBeInTheDocument();
  });

  it('compara somente concluidas com unidades, campo indisponivel e aviso de protocolo', async () => {
    const older = completed({
      id: 'adpt-1',
      code: 'ADPT-001',
      sequenceNumber: 1,
      assessmentDate: '2026-06-10',
      protocolVersion: 1,
      createdAt: '2026-06-10T12:00:00.000Z',
    });
    const newer = completed();
    listAssessmentsMock.mockResolvedValue([newer, older]);
    getAssessmentMock.mockResolvedValue(detail(newer));
    compareMock.mockResolvedValue({
      previous: {
        assessment: older,
        measurements: { weightKg: 68, tricepsMm: 9, subscapularMm: 10, suprailiacMm: 11, abdominalMm: 12 },
        results: { skinfoldTotalMm: 52, bodyFatPercentage: 19, fatMassKg: 12.92, leanMassKg: 55.08 },
      },
      current: {
        assessment: newer,
        measurements: detail(newer).measurements,
        results: detail(newer).results!,
      },
      deltas: { weightKg: 2, bodyFatPercentage: -0.6 },
    });

    renderCard();

    await waitFor(() => expect(screen.getByLabelText(/ADPT-002/i)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/ADPT-002/i));
    fireEvent.click(screen.getByLabelText(/ADPT-001/i));
    fireEvent.click(screen.getByRole('button', { name: 'Comparar avaliações selecionadas' }));

    await waitFor(() => expect(screen.getByText(/comparação é limitada/i)).toBeInTheDocument());
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('+2 kg')).toBeInTheDocument();
    expect(screen.getAllByText('Indisponível').length).toBeGreaterThan(0);
    expect(screen.getByText(/sem classificar melhora ou piora/i)).toBeInTheDocument();
  });

  it('remove da selecao uma avaliacao que deixa de estar disponivel apos revalidacao', async () => {
    const older = completed({
      id: 'adpt-1',
      code: 'ADPT-001',
      sequenceNumber: 1,
      assessmentDate: '2026-06-10',
      createdAt: '2026-06-10T12:00:00.000Z',
    });
    const newer = completed();
    listAssessmentsMock
      .mockResolvedValueOnce([newer, older])
      .mockResolvedValueOnce([newer]);
    getAssessmentMock.mockResolvedValue(detail(newer));

    renderCard();

    await waitFor(() => expect(screen.getByLabelText(/ADPT-001/i)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/ADPT-002/i));
    fireEvent.click(screen.getByLabelText(/ADPT-001/i));
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(screen.queryByLabelText(/ADPT-001/i)).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(/deixou de estar disponível/i);
    expect(compareMock).not.toHaveBeenCalled();
  });

  it('isola falha da API e oferece nova tentativa', async () => {
    listAssessmentsMock.mockRejectedValueOnce(new Error('network'));

    renderCard();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/demais áreas da Central continuam disponíveis/i));
    listAssessmentsMock.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(screen.getByText('Nenhuma adipometria concluída')).toBeInTheDocument());
    expect(listAssessmentsMock).toHaveBeenCalledTimes(2);
  });
});
