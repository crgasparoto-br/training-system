import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alunoFormCopy } from '../i18n/ptBR';

const mocks = vi.hoisted(() => ({
  routeId: undefined as string | undefined,
  navigate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getById: vi.fn(),
  listStudentContracts: vi.fn(),
  previewAssessmentPdf: vi.fn(),
  uploadAvatar: vi.fn(),
  linkStudentContract: vi.fn(),
  updateStudentContract: vi.fn(),
  activateStudentContract: vi.fn(),
  listServices: vi.fn(),
  listProfessors: vi.fn(),
  listAvailableContracts: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useParams: () => (mocks.routeId ? { id: mocks.routeId } : {}),
  };
});

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: () => ({
    user: {
      id: 'user-master',
      email: 'master@example.com',
      name: 'Master',
      type: 'professor',
      professor: {
        id: 'professor-1',
        role: 'master',
        contract: {
          id: 'contract-1',
          type: 'academy',
          document: '00',
        },
      },
    },
  }),
}));

vi.mock('../access/access-control', () => ({
  canAccessScreen: vi.fn(() => true),
}));

vi.mock('../services/aluno.service', () => ({
  alunoService: {
    create: (...args: unknown[]) => mocks.create(...args),
    update: (...args: unknown[]) => mocks.update(...args),
    getById: (...args: unknown[]) => mocks.getById(...args),
    listStudentContracts: (...args: unknown[]) => mocks.listStudentContracts(...args),
    previewAssessmentPdf: (...args: unknown[]) => mocks.previewAssessmentPdf(...args),
    uploadAvatar: (...args: unknown[]) => mocks.uploadAvatar(...args),
    linkStudentContract: (...args: unknown[]) => mocks.linkStudentContract(...args),
    updateStudentContract: (...args: unknown[]) => mocks.updateStudentContract(...args),
    activateStudentContract: (...args: unknown[]) => mocks.activateStudentContract(...args),
  },
}));

vi.mock('../services/service.service', () => ({
  serviceCatalogService: {
    list: (...args: unknown[]) => mocks.listServices(...args),
  },
}));

vi.mock('../services/professor.service', () => ({
  professorService: {
    list: (...args: unknown[]) => mocks.listProfessors(...args),
  },
}));

vi.mock('../services/contract.service', () => ({
  contractService: {
    listAvailableForStudent: (...args: unknown[]) => mocks.listAvailableContracts(...args),
  },
}));

import { AlunoForm } from './AlunoForm';

const assessmentKeys = [
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

const emptyParq = {
  q1: false,
  q2: false,
  q3: false,
  q4: false,
  q5: false,
  q6: false,
  q7: false,
  q8: false,
};

const assertAssessmentFieldsAreAbsent = (payload: unknown) => {
  const serialized = JSON.stringify(payload);
  assessmentKeys.forEach((key) => {
    expect(serialized).not.toContain(`\"${key}\"`);
  });
};

const renderForm = () =>
  render(
    <MemoryRouter>
      <AlunoForm />
    </MemoryRouter>
  );

const selectService = async () => {
  const serviceOption = await screen.findByRole('option', { name: 'Musculação' });
  fireEvent.change(serviceOption.parentElement as HTMLSelectElement, {
    target: { value: 'service-1' },
  });
};

const submitForm = () => {
  const submitButton = document.querySelector('button[type="submit"]');
  expect(submitButton).not.toBeNull();
  fireEvent.click(submitButton as HTMLButtonElement);
};

describe('AlunoForm assessment boundary behavior', () => {
  beforeEach(() => {
    mocks.routeId = undefined;
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    mocks.listServices.mockResolvedValue([
      {
        id: 'service-1',
        name: 'Musculação',
        code: 'MUSC',
        isActive: true,
        parentServiceId: null,
      },
    ]);
    mocks.listProfessors.mockResolvedValue([
      {
        id: 'professor-1',
        user: { profile: { name: 'Professor Teste' } },
      },
    ]);
    mocks.listAvailableContracts.mockResolvedValue([]);
    mocks.listStudentContracts.mockResolvedValue({
      alunoId: 'aluno-1',
      activeContract: null,
      contracts: [],
    });
    mocks.create.mockResolvedValue({
      aluno: { id: 'aluno-created' },
      tempPassword: 'temp-password',
    });
    mocks.update.mockResolvedValue({ id: 'aluno-1' });
  });

  it('envia o cadastro sem qualquer atributo de avaliação', async () => {
    renderForm();

    fireEvent.change(screen.getByPlaceholderText('João Silva'), {
      target: { value: 'João da Silva' },
    });
    fireEvent.change(screen.getByPlaceholderText('joao@email.com'), {
      target: { value: 'joao@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('30'), {
      target: { value: '30' },
    });
    await selectService();

    submitForm();

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const payload = mocks.create.mock.calls[0][0];

    expect(payload).toMatchObject({
      name: 'João da Silva',
      email: 'joao@example.com',
      serviceId: 'service-1',
      schedulePlan: 'free',
      age: 30,
    });
    expect(payload.intakeForm).not.toHaveProperty('parqResponses');
    assertAssessmentFieldsAreAbsent(payload);
  });

  it('ignora dados de avaliação retornados pelo PDF e não os mantém no payload', async () => {
    mocks.previewAssessmentPdf.mockResolvedValue({
      name: 'Aluno PDF',
      birthDate: '1990-01-02',
      gender: 'male',
      age: 36,
      weight: 82,
      height: 178,
      bodyFatPercentage: 17,
      vo2Max: 48,
      anaerobicThreshold: 165,
      maxHeartRate: 190,
      restingHeartRate: 58,
      systolicPressure: 120,
      diastolicPressure: 80,
      macronutrients: {
        carbohydratesPercentage: 50,
        proteinsPercentage: 25,
        lipidsPercentage: 25,
        dailyCalories: 2400,
      },
      intakeForm: {
        assessmentDate: '2026-07-10',
        trainingBackground: 'Treina há cinco anos',
        observations: 'Observação importada',
      },
      extractedPreview: {
        parseOk: true,
        sourceName: 'Aluno PDF',
        sourceAssessmentDate: '2026-07-10',
      },
    });

    renderForm();
    fireEvent.click(screen.getByRole('button', { name: alunoFormCopy.pdfTitle }));

    const fileInput = document.querySelector('input[type="file"][accept="application/pdf"]');
    expect(fileInput).not.toBeNull();
    const file = new File(['pdf'], 'avaliacao.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: alunoFormCopy.applyPrefill }));

    await waitFor(() => expect(mocks.previewAssessmentPdf).toHaveBeenCalledWith(file));
    expect(await screen.findByDisplayValue('Aluno PDF')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('joao@email.com'), {
      target: { value: 'pdf@example.com' },
    });
    await selectService();
    submitForm();

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const payload = mocks.create.mock.calls[0][0];

    expect(payload).toMatchObject({
      name: 'Aluno PDF',
      birthDate: '1990-01-02',
      intakeForm: {
        trainingBackground: 'Treina há cinco anos',
        observations: 'Observação importada',
      },
    });
    assertAssessmentFieldsAreAbsent(payload);
  });

  it('edita anamnese sem reenviar dados históricos de avaliação', async () => {
    mocks.routeId = 'aluno-1';
    mocks.getById.mockResolvedValue({
      id: 'aluno-1',
      userId: 'user-1',
      professorId: 'professor-1',
      serviceId: 'service-1',
      schedulePlan: 'free',
      age: 35,
      weight: 80,
      height: 175,
      bodyFatPercentage: 18,
      vo2Max: 45,
      anaerobicThreshold: 160,
      maxHeartRate: 188,
      restingHeartRate: 60,
      systolicPressure: 120,
      diastolicPressure: 80,
      macronutrients: {
        carbohydratesPercentage: 50,
        proteinsPercentage: 25,
        lipidsPercentage: 25,
        dailyCalories: 2200,
      },
      user: {
        email: 'existente@example.com',
        profile: {
          name: 'Aluno Existente',
          phone: '(15) 99999-9999',
          birthDate: '1991-03-05',
          gender: 'male',
        },
      },
      professor: {
        id: 'professor-1',
        user: { profile: { name: 'Professor Teste' } },
      },
      service: {
        id: 'service-1',
        name: 'Musculação',
        code: 'MUSC',
        isActive: true,
      },
      intakeForm: {
        assessmentDate: '2026-06-01',
        mainGoal: 'Objetivo original',
        medicalHistory: 'Histórico médico',
        currentMedications: 'Nenhuma',
        injuriesHistory: 'Sem lesões',
        trainingBackground: 'Histórico original',
        observations: 'Observação original',
        parqResponses: emptyParq,
        formResponses: {
          identification: {},
          financial: {},
          preferences: {},
          ahaResponses: {},
        },
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderForm();
    expect(await screen.findByDisplayValue('Aluno Existente')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Anamnese Inicial' }));

    fireEvent.change(
      screen.getByPlaceholderText('Descreva frequência, modalidades e experiência prévia'),
      { target: { value: 'Histórico atualizado' } }
    );
    submitForm();

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    const [alunoId, payload] = mocks.update.mock.calls[0];

    expect(alunoId).toBe('aluno-1');
    expect(payload).toMatchObject({
      serviceId: 'service-1',
      intakeForm: {
        mainGoal: 'Objetivo original',
        trainingBackground: 'Histórico atualizado',
        medicalHistory: 'Histórico médico',
        currentMedications: 'Nenhuma',
        injuriesHistory: 'Sem lesões',
        observations: 'Observação original',
      },
    });
    assertAssessmentFieldsAreAbsent(payload);
  });
});
