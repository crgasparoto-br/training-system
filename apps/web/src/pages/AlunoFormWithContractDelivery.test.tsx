import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlunoFormWithContractDelivery } from './AlunoFormWithContractDelivery';

const submitSpy = vi.fn();
const listStudentContracts = vi.fn();
const getDocument = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'student-1' }),
}));

vi.mock('../services/aluno.service', () => ({
  alunoService: {
    listStudentContracts,
  },
}));

vi.mock('../services/contract.service', () => ({
  contractService: {
    getDocument,
    sendForSignature: vi.fn(),
  },
}));

vi.mock('./AlunoFormWithContractPreview', () => ({
  AlunoFormWithContractPreview: () => (
    <form
      data-testid="student-form"
      onSubmit={(event) => {
        event.preventDefault();
        submitSpy();
      }}
    >
      <div id="aluno-contract-section-slot">
        <select
          aria-label="Contrato"
          name="intakeForm.financialInfo.selectedContractId"
          defaultValue="contract-active"
        >
          <option value="contract-active">Contrato vigente</option>
          <option value="contract-new">Contrato substituto</option>
        </select>
        <div>
          <div>
            <div>
              <h4>Status do contrato</h4>
            </div>
          </div>
        </div>
      </div>
      <button type="submit">Salvar cadastro</button>
    </form>
  ),
}));

const activeContract = {
  id: 'link-active',
  alunoId: 'student-1',
  contractId: 'contract-active',
  serviceId: 'service-active',
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
    serviceId: 'service-active',
  },
  service: {
    id: 'service-active',
    name: 'Plano vigente',
  },
};

const generatedContract = (id: string) => ({
  id,
  title: id === 'contract-active' ? 'Contrato vigente' : 'Contrato substituto',
  status: id === 'contract-active' ? 'SIGNED' : 'GENERATED',
  renderedHtml: '<p>Contrato</p>',
  createdAt: '2026-01-01T12:00:00.000Z',
  companyContractId: 'company-1',
  serviceId: 'service-active',
});

describe('AlunoFormWithContractDelivery replacement blocker', () => {
  beforeEach(() => {
    submitSpy.mockReset();
    listStudentContracts.mockReset();
    getDocument.mockReset();
    listStudentContracts.mockResolvedValue({
      alunoId: 'student-1',
      activeContract,
      contracts: [activeContract],
    });
    getDocument.mockImplementation(async (id: string) => generatedContract(id));
  });

  it('restores the active contract when the user cancels the replacement', async () => {
    const nativeConfirm = vi.fn(() => false);
    window.confirm = nativeConfirm;
    const user = userEvent.setup();

    render(<AlunoFormWithContractDelivery />);

    await waitFor(() => expect(listStudentContracts).toHaveBeenCalledTimes(1));
    const select = screen.getByLabelText('Contrato') as HTMLSelectElement;
    await user.selectOptions(select, 'contract-new');

    expect(nativeConfirm).toHaveBeenCalledTimes(1);
    expect(select.value).toBe('contract-active');
    expect(
      screen.queryByText('Confirmação da substituição de contrato')
    ).not.toBeInTheDocument();
  });

  it('uses one confirmation to release the real submit blocker', async () => {
    const nativeConfirm = vi.fn(() => true);
    window.confirm = nativeConfirm;
    const user = userEvent.setup();

    render(<AlunoFormWithContractDelivery />);

    await waitFor(() => expect(listStudentContracts).toHaveBeenCalledTimes(1));
    const select = screen.getByLabelText('Contrato') as HTMLSelectElement;
    await user.selectOptions(select, 'contract-new');

    await waitFor(() =>
      expect(screen.getByText('Substituição confirmada')).toBeInTheDocument()
    );
    expect(nativeConfirm).toHaveBeenCalledTimes(1);

    fireEvent.submit(screen.getByTestId('student-form'));

    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(nativeConfirm).toHaveBeenCalledTimes(1);
  });
});
