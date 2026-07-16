import { describe, expect, it, vi } from 'vitest';
import { publishContractReplacementState } from './contract-replacement-coordination';
import { installStudentFinancialContractAtomicAdapter } from './student-financial-contract-atomic-adapter';

const activeContract = {
  id: 'link-active',
  alunoId: 'student-1',
  contractId: 'contract-active',
  serviceId: 'service-active',
  status: 'active',
  startDate: '2026-01-01',
  endDate: null,
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z',
  contract: {
    id: 'contract-active',
    title: 'Contrato vigente',
    status: 'SIGNED',
    createdAt: '2026-01-01T12:00:00.000Z',
    companyContractId: 'company-1',
    serviceId: 'service-active',
  },
  service: { id: 'service-active', name: 'Plano vigente' },
} as const;

const buildRoot = () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <select name="intakeForm.financialInfo.selectedContractId">
      <option value="contract-active">Contrato vigente</option>
      <option value="contract-new" selected>Contrato substituto</option>
    </select>
  `;
  return root;
};

const buildService = () => ({
  create: vi.fn(),
  update: vi.fn(async (alunoId: string, _data: Record<string, unknown>) => ({ id: alunoId })),
  listStudentContracts: vi.fn(async (alunoId: string) => ({
    alunoId,
    activeContract,
    contracts: [activeContract],
  })),
  linkStudentContract: vi.fn(),
  updateStudentContract: vi.fn(),
  activateStudentContract: vi.fn(),
});

describe('atomic adapter replacement confirmation coordination', () => {
  it('suppresses only the legacy active pointer for the confirmed save pair', async () => {
    const service = buildService();
    const root = buildRoot();
    const uninstall = installStudentFinancialContractAtomicAdapter(
      service as never,
      { create: vi.fn(), update: vi.fn() } as never,
      root
    );

    publishContractReplacementState({
      activeContractId: 'contract-active',
      selectedContractId: 'contract-new',
      required: true,
      confirmed: true,
    });
    await service.update('student-1', { age: 31 });

    const response = await service.listStudentContracts('student-1');

    expect(response.activeContract).toBeNull();
    expect(response.contracts).toEqual([activeContract]);
    uninstall();
  });

  it('preserves the real active pointer when confirmation does not match the selection', async () => {
    const service = buildService();
    const root = buildRoot();
    const uninstall = installStudentFinancialContractAtomicAdapter(
      service as never,
      { create: vi.fn(), update: vi.fn() } as never,
      root
    );

    publishContractReplacementState({
      activeContractId: 'contract-active',
      selectedContractId: 'contract-other',
      required: true,
      confirmed: true,
    });
    await service.update('student-1', { age: 31 });

    const response = await service.listStudentContracts('student-1');

    expect(response.activeContract).toEqual(activeContract);
    uninstall();
  });
});
