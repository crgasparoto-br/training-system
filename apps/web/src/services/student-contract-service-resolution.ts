import {
  alunoService,
  type AlunoContractsResponse,
  type LinkStudentContractDTO,
  type StudentContractLink,
  type UpdateStudentContractDTO,
} from './aluno.service';
import {
  contractService,
  type AvailableStudentContract,
  type AvailableStudentContractFilters,
} from './contract.service';

const CONTRACT_STATUSES: AvailableStudentContract['status'][] = [
  'ACTIVE',
  'DRAFT',
  'GENERATED',
  'SENT',
  'VIEWED',
  'SIGNED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
];

type StudentContractMutationService = {
  linkStudentContract(
    alunoId: string,
    data: LinkStudentContractDTO
  ): Promise<StudentContractLink>;
  updateStudentContract(
    alunoId: string,
    studentContractId: string,
    data: UpdateStudentContractDTO
  ): Promise<StudentContractLink>;
  listStudentContracts(alunoId: string): Promise<AlunoContractsResponse>;
};

type ContractLookupService = {
  listAvailableForStudent(
    filters?: AvailableStudentContractFilters
  ): Promise<AvailableStudentContract[]>;
};

const normalizeOptionalId = (value?: string | null) => value?.trim() || undefined;

export async function resolveContractServiceId({
  alunoId,
  contractId,
  fallbackServiceId,
  lookupService = contractService,
}: {
  alunoId: string;
  contractId: string;
  fallbackServiceId?: string | null;
  lookupService?: ContractLookupService;
}) {
  try {
    const availableContracts = await lookupService.listAvailableForStudent({
      alunoId,
      status: CONTRACT_STATUSES,
    });
    const selectedContract = availableContracts.find((contract) => contract.id === contractId);

    return (
      normalizeOptionalId(selectedContract?.serviceId) ||
      normalizeOptionalId(selectedContract?.service?.id) ||
      normalizeOptionalId(fallbackServiceId)
    );
  } catch {
    return normalizeOptionalId(fallbackServiceId);
  }
}

export function installStudentContractServiceResolutionAdapter(
  service: StudentContractMutationService = alunoService,
  lookupService: ContractLookupService = contractService
) {
  const originalLink = service.linkStudentContract;
  const originalUpdate = service.updateStudentContract;
  const originalList = service.listStudentContracts;

  const linkStudentContract: typeof service.linkStudentContract = async (alunoId, data) => {
    const serviceId = await resolveContractServiceId({
      alunoId,
      contractId: data.contractId,
      fallbackServiceId: data.serviceId,
      lookupService,
    });

    return originalLink.call(service, alunoId, {
      ...data,
      ...(serviceId ? { serviceId } : {}),
    });
  };

  const updateStudentContract: typeof service.updateStudentContract = async (
    alunoId,
    studentContractId,
    data
  ) => {
    const links = await originalList.call(service, alunoId);
    const selectedLink = links.contracts.find((link) => link.id === studentContractId);
    const contractServiceId =
      normalizeOptionalId(selectedLink?.contract.serviceId) ||
      normalizeOptionalId(selectedLink?.service?.id);
    const serviceId = selectedLink
      ? contractServiceId ||
        (await resolveContractServiceId({
          alunoId,
          contractId: selectedLink.contractId,
          fallbackServiceId: data.serviceId,
          lookupService,
        }))
      : normalizeOptionalId(data.serviceId);

    return originalUpdate.call(service, alunoId, studentContractId, {
      ...data,
      ...(serviceId ? { serviceId } : {}),
    });
  };

  service.linkStudentContract = linkStudentContract;
  service.updateStudentContract = updateStudentContract;

  return () => {
    if (service.linkStudentContract === linkStudentContract) {
      service.linkStudentContract = originalLink;
    }
    if (service.updateStudentContract === updateStudentContract) {
      service.updateStudentContract = originalUpdate;
    }
  };
}
