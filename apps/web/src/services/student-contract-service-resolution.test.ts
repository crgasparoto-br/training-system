import { describe, expect, it, vi } from 'vitest';
import type {
  AlunoContractsResponse,
  LinkStudentContractDTO,
  StudentContractLink,
  UpdateStudentContractDTO,
} from './aluno.service';
import type { AvailableStudentContract } from './contract.service';
import {
  installStudentContractServiceResolutionAdapter,
  resolveContractServiceId,
} from './student-contract-service-resolution';

const availableContract: AvailableStudentContract = {
  id: 'contract-1',
  title: 'Contrato personal',
  status: 'SIGNED',
  alunoId: 'student-1',
  serviceId: 'financial-service-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  service: {
    id: 'financial-service-1',
    name: 'Personal 3x por semana',
  },
};

const link: StudentContractLink = {
  id: 'student-contract-1',
  alunoId: 'student-1',
  contractId: 'contract-1',
  serviceId: 'financial-service-1',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  contract: {
    id: 'contract-1',
    title: 'Contrato personal',
    status: 'SIGNED',
    createdAt: '2026-01-01T00:00:00.000Z',
    companyContractId: 'company-contract-1',
    serviceId: 'financial-service-1',
  },
  service: availableContract.service,
};

describe('student contract service resolution', () => {
  it('prioritizes the service associated with the selected contract', async () => {
    const lookupService = {
      listAvailableForStudent: vi.fn(async () => [availableContract]),
    };

    await expect(
      resolveContractServiceId({
        alunoId: 'student-1',
        contractId: 'contract-1',
        fallbackServiceId: 'interest-service-1',
        lookupService,
      })
    ).resolves.toBe('financial-service-1');
  });

  it('keeps the interest service only when the contract has no service', async () => {
    const lookupService = {
      listAvailableForStudent: vi.fn(async () => [
        { ...availableContract, serviceId: null, service: null },
      ]),
    };

    await expect(
      resolveContractServiceId({
        alunoId: 'student-1',
        contractId: 'contract-1',
        fallbackServiceId: 'interest-service-1',
        lookupService,
      })
    ).resolves.toBe('interest-service-1');
  });

  it('applies the contract service while creating and updating a link', async () => {
    const originalLink = vi.fn(async (_alunoId: string, data: LinkStudentContractDTO) => ({
      ...link,
      serviceId: data.serviceId,
    }));
    const originalUpdate = vi.fn(
      async (_alunoId: string, _studentContractId: string, data: UpdateStudentContractDTO) => ({
        ...link,
        serviceId: data.serviceId,
      })
    );
    const originalList = vi.fn(async (): Promise<AlunoContractsResponse> => ({
      alunoId: 'student-1',
      activeContract: link,
      contracts: [link],
    }));
    const service = {
      linkStudentContract: originalLink,
      updateStudentContract: originalUpdate,
      listStudentContracts: originalList,
    };
    const lookupService = {
      listAvailableForStudent: vi.fn(async () => [availableContract]),
    };
    const uninstall = installStudentContractServiceResolutionAdapter(service, lookupService);

    await service.linkStudentContract('student-1', {
      contractId: 'contract-1',
      serviceId: 'interest-service-1',
    });
    await service.updateStudentContract('student-1', 'student-contract-1', {
      serviceId: 'interest-service-1',
    });

    expect(originalLink).toHaveBeenCalledWith('student-1', {
      contractId: 'contract-1',
      serviceId: 'financial-service-1',
    });
    expect(originalUpdate).toHaveBeenCalledWith('student-1', 'student-contract-1', {
      serviceId: 'financial-service-1',
    });

    uninstall();
    expect(service.linkStudentContract).toBe(originalLink);
    expect(service.updateStudentContract).toBe(originalUpdate);
  });
});
