import { describe, expect, it, vi } from 'vitest';
import type {
  Aluno,
  AlunoContractsResponse,
  CreateAlunoDTO,
  LinkStudentContractDTO,
  StudentContractLink,
  UpdateAlunoDTO,
  UpdateStudentContractDTO,
} from './aluno.service';
import { installStudentFinancialContractAtomicAdapter } from './student-financial-contract-atomic-adapter';

const contractLink = (
  alunoId = 'student-1',
  status: StudentContractLink['status'] = 'active'
): StudentContractLink => ({
  id: 'link-1',
  alunoId,
  contractId: 'contract-1',
  serviceId: 'financial-service-1',
  status,
  startDate: '2026-07-01',
  endDate: '2027-07-01',
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-01T12:00:00.000Z',
  contract: {
    id: 'contract-1',
    title: 'Contrato anual',
    status: status === 'active' ? 'SIGNED' : 'GENERATED',
    createdAt: '2026-07-01T12:00:00.000Z',
    companyContractId: 'company-1',
    serviceId: 'financial-service-1',
  },
  service: {
    id: 'financial-service-1',
    name: 'Plano anual',
  },
});

const profile = {
  name: 'Aluno Teste',
  email: 'aluno@example.com',
  serviceId: 'interest-service-1',
  schedulePlan: 'free',
  age: 30,
} satisfies CreateAlunoDTO;

const buildRoot = () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <select name="intakeForm.financialInfo.selectedContractId">
      <option value="">Sem contrato</option>
      <option value="contract-1" selected>Contrato anual</option>
    </select>
  `;
  return root;
};

const buildService = () => ({
  create: vi.fn(async (_data: CreateAlunoDTO) => ({
    aluno: { id: 'legacy-create' } as Aluno,
    tempPassword: 'legacy',
  })),
  update: vi.fn(async (alunoId: string, _data: UpdateAlunoDTO) => ({
    id: alunoId,
  } as Aluno)),
  listStudentContracts: vi.fn(
    async (alunoId: string): Promise<AlunoContractsResponse> => ({
      alunoId,
      activeContract: null,
      contracts: [],
    })
  ),
  linkStudentContract: vi.fn(
    async (alunoId: string, _data: LinkStudentContractDTO) => contractLink(alunoId)
  ),
  updateStudentContract: vi.fn(
    async (
      alunoId: string,
      _studentContractId: string,
      _data: UpdateStudentContractDTO
    ) => contractLink(alunoId)
  ),
  activateStudentContract: vi.fn(
    async (alunoId: string, _studentContractId: string) => contractLink(alunoId)
  ),
});

describe('student financial contract atomic adapter', () => {
  it('defers create and performs profile plus contract in one atomic request', async () => {
    const service = buildService();
    const atomicCreate = vi.fn(async () => ({
      aluno: { id: 'student-created' } as Aluno,
      tempPassword: 'temporary-password',
      studentContract: contractLink('student-created'),
    }));
    const atomicService = { create: atomicCreate, update: vi.fn() };
    const originalCreate = service.create;
    const uninstall = installStudentFinancialContractAtomicAdapter(
      service,
      atomicService,
      buildRoot()
    );

    const result = await service.create(profile);
    const provisionalId = result.aluno.id;
    expect(provisionalId).toMatch(/^atomic-pending:/u);
    expect(await service.listStudentContracts(provisionalId)).toEqual({
      alunoId: provisionalId,
      activeContract: null,
      contracts: [],
    });

    const link = await service.linkStudentContract(provisionalId, {
      contractId: 'contract-1',
      endDate: '2027-07-01',
    });

    expect(atomicCreate).toHaveBeenCalledWith(profile, {
      contractId: 'contract-1',
      endDate: '2027-07-01',
    });
    expect(result.aluno.id).toBe('student-created');
    expect(result.tempPassword).toBe('temporary-password');
    expect(link.alunoId).toBe('student-created');
    expect(originalCreate).not.toHaveBeenCalled();

    uninstall();
  });

  it('does not persist the profile separately when the atomic update fails', async () => {
    const service = buildService();
    const atomicUpdate = vi.fn(async () => {
      throw new Error('Contrato selecionado não encontrado');
    });
    const atomicService = { create: vi.fn(), update: atomicUpdate };
    const root = buildRoot();
    const originalUpdate = service.update;
    const originalLink = service.linkStudentContract;
    const uninstall = installStudentFinancialContractAtomicAdapter(
      service,
      atomicService,
      root
    );
    const updatePayload = { age: 31 } satisfies UpdateAlunoDTO;

    await service.update('student-1', updatePayload);
    await expect(
      service.linkStudentContract('student-1', { contractId: 'contract-1' })
    ).rejects.toThrow('Contrato selecionado não encontrado');

    expect(atomicUpdate).toHaveBeenCalledWith('student-1', updatePayload, {
      contractId: 'contract-1',
    });
    expect(originalUpdate).not.toHaveBeenCalled();
    expect(originalLink).not.toHaveBeenCalled();

    uninstall();
  });

  it('uses the selected contract for an existing link update and consumes legacy follow-up calls after activation', async () => {
    const service = buildService();
    const atomicUpdate = vi.fn(async () => ({
      aluno: { id: 'student-1' } as Aluno,
      studentContract: contractLink('student-1'),
    }));
    const atomicService = { create: vi.fn(), update: atomicUpdate };
    const root = buildRoot();
    const originalContractUpdate = service.updateStudentContract;
    const originalActivate = service.activateStudentContract;
    const uninstall = installStudentFinancialContractAtomicAdapter(
      service,
      atomicService,
      root
    );

    await service.update('student-1', { age: 32 });
    const link = await service.updateStudentContract('student-1', 'existing-link', {
      endDate: '2027-07-01',
    });
    const confirmation = await service.updateStudentContract('student-1', link.id, {
      endDate: '2027-07-01',
    });
    const activated = await service.activateStudentContract('student-1', link.id);

    expect(atomicUpdate).toHaveBeenCalledWith(
      'student-1',
      { age: 32 },
      {
        contractId: 'contract-1',
        endDate: '2027-07-01',
      }
    );
    expect(confirmation.id).toBe(link.id);
    expect(activated.id).toBe(link.id);
    expect(originalContractUpdate).not.toHaveBeenCalled();
    expect(originalActivate).not.toHaveBeenCalled();

    uninstall();
  });

  it('does not expose a deferred contract as active and lets the lifecycle endpoint handle activation', async () => {
    const service = buildService();
    const pending = contractLink('student-created', 'draft');
    const atomicCreate = vi.fn(async () => ({
      aluno: { id: 'student-created' } as Aluno,
      tempPassword: 'temporary-password',
      studentContract: pending,
    }));
    const atomicService = { create: atomicCreate, update: vi.fn() };
    const originalActivate = service.activateStudentContract;
    const uninstall = installStudentFinancialContractAtomicAdapter(
      service,
      atomicService,
      buildRoot()
    );

    const result = await service.create(profile);
    const provisionalId = result.aluno.id;
    const link = await service.linkStudentContract(provisionalId, {
      contractId: 'contract-1',
    });
    const provisionalContracts = await service.listStudentContracts(provisionalId);
    const activated = await service.activateStudentContract('student-created', link.id);

    expect(provisionalContracts.activeContract).toBeNull();
    expect(provisionalContracts.contracts).toEqual([pending]);
    expect(originalActivate).toHaveBeenCalledWith('student-created', link.id);
    expect(activated.status).toBe('active');

    uninstall();
  });

  it('uses the legacy endpoint when no contract is selected', async () => {
    const service = buildService();
    const root = buildRoot();
    root.querySelector<HTMLSelectElement>('select')!.value = '';
    const atomicService = { create: vi.fn(), update: vi.fn() };
    const originalCreate = service.create;
    const uninstall = installStudentFinancialContractAtomicAdapter(
      service,
      atomicService,
      root
    );

    const result = await service.create(profile);

    expect(result.aluno.id).toBe('legacy-create');
    expect(originalCreate).toHaveBeenCalledTimes(1);
    expect(atomicService.create).not.toHaveBeenCalled();

    uninstall();
  });
});
