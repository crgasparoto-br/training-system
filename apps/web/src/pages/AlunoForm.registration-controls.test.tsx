import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlunoFormWithContractEndDate } from './AlunoFormWithContractEndDate';

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
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom'
  );
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

vi.mock('../services/student-financial-contract.service', () => ({
  studentFinancialContractService: {
    create: vi.fn(),
    update: vi.fn(),
  },
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

const legacyStudent = {
  id: 'aluno-1',
  userId: 'user-1',
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
    parqResponses: emptyParq,
    formResponses: {
      identification: {
        maritalStatus: 'Separado judicialmente',
        socialNetwork: '',
        instagram: '@aluno-legado',
        emergencyContactRelationship: 'Vizinho de confiança',
      },
      financial: {},
      preferences: {},
      ahaResponses: {},
    },
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const renderForm = () =>
  render(
    <MemoryRouter>
      <AlunoFormWithContractEndDate />
    </MemoryRouter>
  );

describe('AlunoForm registration controls', () => {
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

  it('renders controlled registration fields with the responsive layout and Outra interaction', async () => {
    renderForm();

    await screen.findByRole('heading', { name: 'Novo Aluno' });

    const maritalStatus = document.querySelector<HTMLSelectElement>(
      'select[name="intakeForm.personalInfo.maritalStatus"]'
    );
    const socialNetwork = document.querySelector<HTMLSelectElement>(
      'select[name="intakeForm.personalInfo.socialNetwork"]'
    );
    const socialAccount = document.querySelector<HTMLInputElement>(
      'input[name="intakeForm.personalInfo.instagram"]'
    );

    expect(maritalStatus).toBeInstanceOf(HTMLSelectElement);
    expect(socialNetwork).toBeInstanceOf(HTMLSelectElement);
    expect(socialAccount).toBeDisabled();
    expect(socialNetwork?.parentElement?.parentElement).toHaveClass(
      'grid-cols-1',
      'md:grid-cols-2'
    );

    fireEvent.change(socialNetwork!, { target: { value: 'linkedin' } });
    await waitFor(() => expect(socialAccount).toBeEnabled());

    const relationship = await screen.findByLabelText(
      'Relação com o contato de emergência'
    );
    fireEvent.change(relationship, { target: { value: 'Outra' } });

    expect(
      screen.getByLabelText('Outra relação com o contato de emergência')
    ).toBeEnabled();
  });

  it('preserves legacy marital, social and emergency values loaded after the screen mounts', async () => {
    mocks.routeId = 'aluno-1';
    mocks.getById.mockResolvedValue(legacyStudent);

    renderForm();

    expect(await screen.findByDisplayValue('Aluno Existente')).toBeInTheDocument();

    const maritalStatus = document.querySelector<HTMLSelectElement>(
      'select[name="intakeForm.personalInfo.maritalStatus"]'
    )!;
    const socialNetwork = document.querySelector<HTMLSelectElement>(
      'select[name="intakeForm.personalInfo.socialNetwork"]'
    )!;
    const socialAccount = document.querySelector<HTMLInputElement>(
      'input[name="intakeForm.personalInfo.instagram"]'
    )!;
    const relationship = await screen.findByLabelText(
      'Relação com o contato de emergência'
    );
    const otherRelationship = screen.getByLabelText(
      'Outra relação com o contato de emergência'
    );

    await waitFor(() => {
      expect(maritalStatus).toHaveValue('Separado judicialmente');
      expect(socialNetwork).toHaveValue('instagram');
      expect(socialAccount).toHaveValue('@aluno-legado');
      expect(relationship).toHaveValue('Outra');
      expect(otherRelationship).toHaveValue('Vizinho de confiança');
    });
  });
});
