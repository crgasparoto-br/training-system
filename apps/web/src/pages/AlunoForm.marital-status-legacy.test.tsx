import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlunoFormWithContractEndDate } from './AlunoFormWithContractEndDate';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
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
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom'
  );
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useParams: () => ({ id: 'aluno-legacy' }),
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
        contract: { id: 'contract-1', type: 'academy', document: '00' },
      },
    },
  }),
}));

vi.mock('../access/access-control', () => ({
  canAccessScreen: vi.fn(() => true),
}));

vi.mock('../services/aluno.service', () => ({
  alunoService: {
    create: vi.fn(),
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

vi.mock('../services/student-financial-contract.service', () => ({
  studentFinancialContractService: { create: vi.fn(), update: vi.fn() },
}));
vi.mock('../services/student-financial-contract-atomic-adapter', () => ({
  installStudentFinancialContractAtomicAdapter: () => () => undefined,
}));
vi.mock('../services/student-contract-end-date-adapter', () => ({
  installStudentContractEndDateAdapter: () => () => undefined,
}));
vi.mock('../services/student-contract-profile-create-adapter', () => ({
  installStudentContractProfileCreateAdapter: () => () => undefined,
}));
vi.mock('../services/student-contract-service-resolution', () => ({
  installStudentContractServiceResolutionAdapter: () => () => undefined,
}));

const legacyWidowerStudent = {
  id: 'aluno-legacy',
  userId: 'user-legacy',
  professorId: 'professor-1',
  serviceId: 'service-1',
  schedulePlan: 'free',
  age: 35,
  user: {
    email: 'existente@example.com',
    profile: {
      name: 'Aluno Existente',
      phone: '(15) 99999-9999',
      birthDate: '1991-03-05',
      gender: 'male',
      avatar: '',
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
    mainGoal: '',
    medicalHistory: '',
    currentMedications: '',
    injuriesHistory: '',
    trainingBackground: '',
    observations: '',
    parqResponses: {
      q1: false,
      q2: false,
      q3: false,
      q4: false,
      q5: false,
      q6: false,
      q7: false,
      q8: false,
    },
    formResponses: {
      identification: {
        maritalStatus: 'Viúvo',
      },
      financial: {},
      preferences: {},
      ahaResponses: {},
    },
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('AlunoForm legacy marital status preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    mocks.getById.mockResolvedValue(legacyWidowerStudent);
    mocks.update.mockResolvedValue({ id: 'aluno-legacy' });
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
      { id: 'professor-1', user: { profile: { name: 'Professor Teste' } } },
    ]);
    mocks.listAvailableContracts.mockResolvedValue([]);
    mocks.listStudentContracts.mockResolvedValue({
      alunoId: 'aluno-legacy',
      activeContract: null,
      contracts: [],
    });
  });

  it('keeps a legacy out-of-list value unchanged when another field is saved', async () => {
    render(
      <MemoryRouter>
        <AlunoFormWithContractEndDate />
      </MemoryRouter>
    );

    const nameInput = await screen.findByDisplayValue('Aluno Existente');
    const maritalStatus = document.querySelector<HTMLSelectElement>(
      'select[name="intakeForm.personalInfo.maritalStatus"]'
    )!;

    await waitFor(() => expect(maritalStatus).toHaveValue('Viúvo'));

    fireEvent.change(nameInput, { target: { value: 'Aluno Existente Atualizado' } });
    const form = nameInput.closest('form');
    expect(form).toBeInstanceOf(HTMLFormElement);
    fireEvent.submit(form!);

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update).toHaveBeenCalledWith(
      'aluno-legacy',
      expect.objectContaining({
        name: 'Aluno Existente Atualizado',
        intakeForm: expect.objectContaining({
          formResponses: expect.objectContaining({
            identification: expect.objectContaining({
              maritalStatus: 'Viúvo',
            }),
          }),
        }),
      })
    );
  });
});
