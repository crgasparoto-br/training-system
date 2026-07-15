import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/useAuthStore';
import { AlunoFormWithContractEndDate } from './AlunoFormWithContractEndDate';
import { AlunoFormWithContractValidityOptions } from './AlunoFormWithContractValidityOptions';

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  listStudentContracts: vi.fn(),
  linkStudentContract: vi.fn(),
  updateStudentContract: vi.fn(),
  activateStudentContract: vi.fn(),
  listServices: vi.fn(),
  listProfessors: vi.fn(),
  listAlunoContracts: vi.fn(),
  listAvailableContracts: vi.fn(),
  getDocument: vi.fn(),
  atomicUpdate: vi.fn(),
  atomicCreate: vi.fn(),
}));

vi.mock('../services/aluno.service', () => ({
  alunoService: {
    getById: mocks.getById,
    create: mocks.createProfile,
    update: mocks.updateProfile,
    listStudentContracts: mocks.listStudentContracts,
    linkStudentContract: mocks.linkStudentContract,
    updateStudentContract: mocks.updateStudentContract,
    activateStudentContract: mocks.activateStudentContract,
    calculateBMI: vi.fn(() => 0),
    getBMIClassification: vi.fn(() => ''),
  },
}));

vi.mock('../services/student-financial-contract.service', () => ({
  studentFinancialContractService: {
    create: mocks.atomicCreate,
    update: mocks.atomicUpdate,
  },
}));

vi.mock('../services/service.service', () => ({
  serviceCatalogService: { list: mocks.listServices },
}));

vi.mock('../services/professor.service', () => ({
  professorService: { list: mocks.listProfessors },
}));

vi.mock('../services/contract.service', () => ({
  contractService: {
    listAlunoContracts: mocks.listAlunoContracts,
    listAvailableForStudent: mocks.listAvailableContracts,
    getDocument: mocks.getDocument,
    sendForSignature: vi.fn(),
  },
}));

const activeContract = {
  id: 'link-active',
  alunoId: 'student-1',
  contractId: 'contract-active',
  serviceId: 'financial-active',
  status: 'active',
  startDate: '2026-01-01T12:00:00.000Z',
  endDate: null,
  signedAt: '2026-01-01T12:00:00.000Z',
  canceledAt: null,
  cancellationReason: null,
  amount: 300,
  paymentDay: 10,
  notes: null,
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z',
  contract: {
    id: 'contract-active',
    title: 'Contrato vigente',
    status: 'SIGNED',
    createdAt: '2026-01-01T12:00:00.000Z',
    signedAt: '2026-01-01T12:00:00.000Z',
    cancelledAt: null,
    companyContractId: 'company-1',
    serviceId: 'financial-active',
  },
  service: {
    id: 'financial-active',
    name: 'Plano vigente',
    code: 'plano-vigente',
    description: null,
    monthlyPrice: 300,
    isActive: true,
  },
};

const replacementLink = {
  ...activeContract,
  id: 'link-new',
  contractId: 'contract-new',
  serviceId: 'financial-new',
  status: 'draft',
  signedAt: null,
  contract: {
    ...activeContract.contract,
    id: 'contract-new',
    title: 'Contrato substituto',
    status: 'GENERATED',
    signedAt: null,
    serviceId: 'financial-new',
  },
  service: {
    ...activeContract.service,
    id: 'financial-new',
    name: 'Plano substituto',
    code: 'plano-substituto',
  },
};

const generatedContracts = [
  {
    ...activeContract.contract,
    renderedHtml: '<p>Contrato vigente</p>',
    service: activeContract.service,
  },
  {
    ...replacementLink.contract,
    renderedHtml: '<p>Contrato substituto</p>',
    createdAt: '2026-07-01T12:00:00.000Z',
    service: replacementLink.service,
  },
];

const student = {
  id: 'student-1',
  userId: 'student-user-1',
  professorId: 'professor-1',
  serviceId: 'interest-service',
  schedulePlan: 'free',
  age: 30,
  weight: null,
  height: null,
  user: {
    email: 'aluno@example.com',
    profile: {
      name: 'Aluno Integração',
      phone: '',
      avatar: '',
      birthDate: '1996-01-15T12:00:00.000Z',
      gender: 'male',
    },
  },
  professor: {
    id: 'professor-1',
    user: { profile: { name: 'Professor Responsável' } },
  },
  service: {
    id: 'interest-service',
    name: 'Corrida',
    code: 'corrida',
    isActive: true,
  },
  intakeForm: {
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
      financial: {
        currentService: 'Plano vigente',
        contractStartDate: '2026-01-01',
        contractDurationUnit: 'years',
        contractDurationQuantity: '1',
        contractDueDate: '2027-01-01',
      },
    },
  },
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z',
};

const renderRealFinancialForm = async () => {
  render(
    <MemoryRouter initialEntries={['/alunos/student-1/edit']}>
      <Routes>
        <Route
          path="/alunos/:id/edit"
          element={<AlunoFormWithContractValidityOptions />}
        />
      </Routes>
    </MemoryRouter>
  );

  await screen.findByRole('heading', { name: 'Editar Aluno' });
  await userEvent.click(screen.getByRole('tab', { name: 'Financeiro' }));

  const contractSelect = await waitFor(() => {
    const select = document.querySelector<HTMLSelectElement>(
      'select[name="intakeForm.financialInfo.selectedContractId"]'
    );
    expect(select).not.toBeNull();
    expect(select?.value).toBe('contract-active');
    return select!;
  });

  return contractSelect;
};

describe('AlunoForm financial contract composed flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'professor@example.com',
        type: 'professor',
        professor: {
          id: 'professor-1',
          role: 'master',
          collaboratorFunction: { code: 'manager' },
        },
        accessControl: { isMaster: true, permissions: [] },
      } as never,
      token: 'test-token',
      isAuthenticated: true,
    });

    mocks.getById.mockResolvedValue(student);
    mocks.listServices.mockResolvedValue([
      student.service,
      { ...activeContract.service, parentServiceId: 'interest-service' },
      { ...replacementLink.service, parentServiceId: 'interest-service' },
    ]);
    mocks.listProfessors.mockResolvedValue([student.professor]);
    mocks.listStudentContracts.mockResolvedValue({
      alunoId: student.id,
      activeContract,
      contracts: [activeContract],
    });
    mocks.listAlunoContracts.mockResolvedValue(generatedContracts);
    mocks.listAvailableContracts.mockResolvedValue(generatedContracts);
    mocks.getDocument.mockImplementation(async (id: string) =>
      generatedContracts.find((contract) => contract.id === id)
    );
    mocks.activateStudentContract.mockResolvedValue(replacementLink);
    mocks.atomicUpdate.mockResolvedValue({
      aluno: student,
      studentContract: replacementLink,
    });
    mocks.atomicCreate.mockResolvedValue({
      aluno: student,
      tempPassword: 'temporary-password',
      studentContract: replacementLink,
    });
  });

  it('submits the real edit form through one atomic profile and contract mutation', async () => {
    const contractSelect = await renderRealFinancialForm();

    fireEvent.change(contractSelect, { target: { value: 'contract-new' } });
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Confirmar preparação da substituição',
      })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.atomicUpdate).toHaveBeenCalledTimes(1));
    expect(mocks.atomicUpdate).toHaveBeenCalledWith(
      'student-1',
      expect.objectContaining({
        age: 30,
        intakeForm: expect.objectContaining({
          formResponses: expect.objectContaining({
            financial: expect.objectContaining({
              selectedContractId: 'contract-new',
            }),
          }),
        }),
      }),
      expect.objectContaining({
        contractId: 'contract-new',
        endDate: '2027-01-01',
      })
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.linkStudentContract).not.toHaveBeenCalled();
  });

  it('restores the active contract and performs no mutation when replacement is cancelled', async () => {
    window.confirm = vi.fn(() => false);
    const contractSelect = await renderRealFinancialForm();

    fireEvent.change(contractSelect, { target: { value: 'contract-new' } });
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Confirmar preparação da substituição',
      })
    );

    expect(contractSelect.value).toBe('contract-active');
    expect(mocks.atomicUpdate).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.linkStudentContract).not.toHaveBeenCalled();
  });

  it('does not fall back to separate profile or contract writers when the atomic mutation fails', async () => {
    mocks.atomicUpdate.mockRejectedValueOnce(new Error('Falha transacional injetada'));
    const contractSelect = await renderRealFinancialForm();

    fireEvent.change(contractSelect, { target: { value: 'contract-new' } });
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Confirmar preparação da substituição',
      })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.atomicUpdate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.linkStudentContract).not.toHaveBeenCalled();
    expect(mocks.updateStudentContract).not.toHaveBeenCalled();
  });

  it('creates a new aluno with the real form and persists the same calculated due date atomically', async () => {
    render(
      <MemoryRouter initialEntries={['/alunos/new']}>
        <Routes>
          <Route path="/alunos/new" element={<AlunoFormWithContractEndDate />} />
          <Route path="/alunos/:id" element={<div>Aluno criado</div>} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'Novo Aluno' });
    await userEvent.type(
      document.querySelector<HTMLInputElement>('input[name="name"]')!,
      'Novo Aluno'
    );
    await userEvent.type(
      document.querySelector<HTMLInputElement>('input[name="email"]')!,
      'novo@example.com'
    );
    await userEvent.type(
      document.querySelector<HTMLInputElement>('input[name="age"]')!,
      '30'
    );

    const interestSelect = await waitFor(() => {
      const select = document.querySelector<HTMLSelectElement>('select[name="serviceId"]');
      expect(select?.options.length).toBeGreaterThan(1);
      return select!;
    });
    fireEvent.change(interestSelect, { target: { value: 'interest-service' } });
    await userEvent.click(screen.getByRole('tab', { name: 'Financeiro' }));

    const contractSelect = await waitFor(() => {
      const select = document.querySelector<HTMLSelectElement>(
        'select[name="intakeForm.financialInfo.selectedContractId"]'
      );
      expect(select?.options.length).toBeGreaterThan(1);
      return select!;
    });
    fireEvent.change(contractSelect, { target: { value: 'contract-new' } });
    fireEvent.change(
      document.querySelector<HTMLInputElement>(
        'input[name="intakeForm.financialInfo.contractStartDate"]'
      )!,
      { target: { value: '2026-08-01' } }
    );
    fireEvent.change(
      document.querySelector<HTMLSelectElement>(
        'select[name="intakeForm.financialInfo.contractDurationUnit"]'
      )!,
      { target: { value: 'years' } }
    );
    fireEvent.change(
      document.querySelector<HTMLInputElement>(
        'input[name="intakeForm.financialInfo.contractDurationQuantity"]'
      )!,
      { target: { value: '1' } }
    );

    await userEvent.click(screen.getByRole('button', { name: 'Criar Aluno' }));

    await waitFor(() => expect(mocks.atomicCreate).toHaveBeenCalledTimes(1));
    expect(mocks.atomicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Novo Aluno',
        email: 'novo@example.com',
        intakeForm: expect.objectContaining({
          formResponses: expect.objectContaining({
            financial: expect.objectContaining({
              contractDueDate: '2027-08-01',
            }),
          }),
        }),
      }),
      expect.objectContaining({
        contractId: 'contract-new',
        endDate: '2027-08-01',
      })
    );
    expect(mocks.createProfile).not.toHaveBeenCalled();
    expect(mocks.linkStudentContract).not.toHaveBeenCalled();
  });
});
