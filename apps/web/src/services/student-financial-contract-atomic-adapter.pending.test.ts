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

const buildPendingLink = (
  status: StudentContractLink['status'] = 'draft'
): StudentContractLink => ({
  id: 'link-pending',
  alunoId: 'student-1',
  contractId: 'contract-pending',
  serviceId: 'financial-service',
  status,
  startDate: '2026-08-01',
  endDate: '2027-08-01',
  createdAt: '2026-07-15T12:00:00.000Z',
  updatedAt: '2026-07-15T12:00:00.000Z',
  contract: {
    id: 'contract-pending',
    title: 'Contrato substituto',
    status: status === 'pending_signature' ? 'SENT' : 'GENERATED',
    createdAt: '2026-07-15T12:00:00.000Z',
    companyContractId: 'company-1',
    serviceId: 'financial-service',
  },
  service: {
    id: 'financial-service',
    name: 'Plano futuro',
  },
});

const buildRoot = () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <select name="intakeForm.financialInfo.selectedContractId">
      <option value="contract-pending" selected>Contrato substituto</option>
    </select>
  `;
  return root;
};

const buildService = () => ({
  create: vi.fn(async (_data: CreateAlunoDTO) => ({
    aluno: { id: 'legacy-create' } as Aluno,
    tempPassword: 'legacy',
  })),
  update: vi.fn(async (alunoId: string, _data: UpdateAlunoDTO) => ({ id: alunoId }) as Aluno),
  listStudentContracts: vi.fn(
    async (alunoId: string): Promise<AlunoContractsResponse> => ({
      alunoId,
      activeContract: null,
      contracts: [],
    })
  ),
  linkStudentContract: vi.fn(
    async (_alunoId: string, _data: LinkStudentContractDTO) => buildPendingLink()
  ),
  updateStudentContract: vi.fn(
    async (
      _alunoId: string,
      _studentContractId: string,
      _data: UpdateStudentContractDTO
    ) => buildPendingLink()
  ),
  activateStudentContract: vi.fn(async () => buildPendingLink('active')),
});

describe('student financial contract atomic adapter pending lifecycle', () => {
  it.each(['draft', 'pending_signature'] as const)(
    'does not issue a second activation request after an atomic %s result',
    async (status) => {
      const service = buildService();
      const originalActivate = service.activateStudentContract;
      const pendingLink = buildPendingLink(status);
      const atomicUpdate = vi.fn(async () => ({
        aluno: { id: 'student-1' } as Aluno,
        studentContract: pendingLink,
      }));
      const uninstall = installStudentFinancialContractAtomicAdapter(
        service,
        { create: vi.fn(), update: atomicUpdate },
        buildRoot()
      );

      await service.update('student-1', { age: 31 });
      const link = await service.linkStudentContract('student-1', {
        contractId: 'contract-pending',
        endDate: '2027-08-01',
      });
      const confirmation = await service.updateStudentContract('student-1', link.id, {
        endDate: '2027-08-01',
      });
      const lifecycleResult = await service.activateStudentContract('student-1', link.id);

      expect(atomicUpdate).toHaveBeenCalledTimes(1);
      expect(confirmation.status).toBe(status);
      expect(lifecycleResult.status).toBe(status);
      expect(originalActivate).not.toHaveBeenCalled();

      uninstall();
    }
  );
});
