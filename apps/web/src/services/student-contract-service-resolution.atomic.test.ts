import { describe, expect, it, vi } from 'vitest';
import type {
  AlunoContractsResponse,
  LinkStudentContractDTO,
  StudentContractLink,
  UpdateStudentContractDTO,
} from './aluno.service';
import { installStudentContractServiceResolutionAdapter } from './student-contract-service-resolution';

const link: StudentContractLink = {
  id: 'link-1',
  alunoId: 'student-created',
  contractId: 'template:template-1',
  status: 'active',
  createdAt: '2026-07-14T12:00:00.000Z',
  updatedAt: '2026-07-14T12:00:00.000Z',
  contract: {
    id: 'contract-created',
    title: 'Contrato anual',
    status: 'GENERATED',
    createdAt: '2026-07-14T12:00:00.000Z',
    companyContractId: 'company-1',
  },
};

describe('student contract service resolution for atomic create', () => {
  it('does not query contracts with a provisional aluno id and leaves authority to the transaction', async () => {
    const originalLink = vi.fn(
      async (_alunoId: string, _data: LinkStudentContractDTO) => link
    );
    const service = {
      linkStudentContract: originalLink,
      updateStudentContract: vi.fn(
        async (
          _alunoId: string,
          _studentContractId: string,
          _data: UpdateStudentContractDTO
        ) => link
      ),
      listStudentContracts: vi.fn(async (): Promise<AlunoContractsResponse> => ({
        alunoId: 'student-created',
        activeContract: link,
        contracts: [link],
      })),
    };
    const lookupService = {
      listAvailableForStudent: vi.fn(async () => {
        throw new Error('provisional aluno id must not be queried');
      }),
    };
    const uninstall = installStudentContractServiceResolutionAdapter(service, lookupService);

    await service.linkStudentContract('atomic-pending:123', {
      contractId: 'template:template-1',
      serviceId: 'interest-service',
    });

    expect(lookupService.listAvailableForStudent).not.toHaveBeenCalled();
    expect(originalLink).toHaveBeenCalledWith('atomic-pending:123', {
      contractId: 'template:template-1',
      serviceId: 'interest-service',
    });

    uninstall();
  });
});
