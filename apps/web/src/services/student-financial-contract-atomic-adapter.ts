import {
  alunoService,
  type Aluno,
  type AlunoContractsResponse,
  type CreateAlunoDTO,
  type CreateAlunoResult,
  type LinkStudentContractDTO,
  type StudentContractLink,
  type UpdateAlunoDTO,
  type UpdateStudentContractDTO,
} from './aluno.service';
import {
  studentFinancialContractService,
  type AtomicCreateAlunoContractResult,
  type AtomicStudentContractInput,
  type AtomicUpdateAlunoContractResult,
} from './student-financial-contract.service';

const CONTRACT_SELECTION_FIELD = 'intakeForm.financialInfo.selectedContractId';
const PROVISIONAL_ALUNO_PREFIX = 'atomic-pending:';

type StudentMutationService = {
  create(data: CreateAlunoDTO): Promise<CreateAlunoResult>;
  update(alunoId: string, data: UpdateAlunoDTO): Promise<Aluno>;
  listStudentContracts(alunoId: string): Promise<AlunoContractsResponse>;
  linkStudentContract(
    alunoId: string,
    data: LinkStudentContractDTO
  ): Promise<StudentContractLink>;
  updateStudentContract(
    alunoId: string,
    studentContractId: string,
    data: UpdateStudentContractDTO
  ): Promise<StudentContractLink>;
  activateStudentContract(
    alunoId: string,
    studentContractId: string
  ): Promise<StudentContractLink>;
};

type AtomicService = {
  create(
    profile: CreateAlunoDTO,
    contract: AtomicStudentContractInput
  ): Promise<AtomicCreateAlunoContractResult>;
  update(
    alunoId: string,
    profile: UpdateAlunoDTO,
    contract: UpdateStudentContractDTO & { contractId: string }
  ): Promise<AtomicUpdateAlunoContractResult>;
};

type PendingCreate = {
  provisionalAlunoId: string;
  profile: CreateAlunoDTO;
  mutableResult: CreateAlunoResult;
};

type CompletedAtomicMutation = {
  requestedAlunoId: string;
  actualAlunoId: string;
  link: StudentContractLink;
  consumeConfirmationUpdate: boolean;
  consumeActivation: boolean;
};

const createProvisionalResult = (provisionalAlunoId: string): CreateAlunoResult =>
  ({
    aluno: { id: provisionalAlunoId },
    tempPassword: '',
  }) as unknown as CreateAlunoResult;

const readSelectedContractId = (root: ParentNode) =>
  root
    .querySelector<HTMLSelectElement>(`select[name="${CONTRACT_SELECTION_FIELD}"]`)
    ?.value.trim() || '';

const emptyContractsResponse = (alunoId: string): AlunoContractsResponse => ({
  alunoId,
  activeContract: null,
  contracts: [],
});

export function installStudentFinancialContractAtomicAdapter(
  service: StudentMutationService = alunoService,
  atomicService: AtomicService = studentFinancialContractService,
  root: ParentNode = document
) {
  const originalCreate = service.create;
  const originalUpdate = service.update;
  const originalList = service.listStudentContracts;
  const originalLink = service.linkStudentContract;
  const originalContractUpdate = service.updateStudentContract;
  const originalActivate = service.activateStudentContract;

  let pendingCreate: PendingCreate | null = null;
  const pendingUpdates = new Map<string, UpdateAlunoDTO>();
  let completed: CompletedAtomicMutation | null = null;

  const hasContractSelection = () => Boolean(readSelectedContractId(root));

  const create: typeof service.create = async (data) => {
    if (!hasContractSelection()) return originalCreate.call(service, data);

    const provisionalAlunoId = `${PROVISIONAL_ALUNO_PREFIX}${crypto.randomUUID()}`;
    const mutableResult = createProvisionalResult(provisionalAlunoId);
    pendingCreate = { provisionalAlunoId, profile: data, mutableResult };
    completed = null;
    return mutableResult;
  };

  const update: typeof service.update = async (alunoId, data) => {
    if (!hasContractSelection()) return originalUpdate.call(service, alunoId, data);

    pendingUpdates.set(alunoId, data);
    completed = null;
    return { id: alunoId } as Aluno;
  };

  const finishCreate = async (
    pending: PendingCreate,
    contract: AtomicStudentContractInput
  ) => {
    const result = await atomicService.create(pending.profile, contract);
    Object.assign(pending.mutableResult, {
      aluno: result.aluno,
      tempPassword: result.tempPassword,
    });
    completed = {
      requestedAlunoId: pending.provisionalAlunoId,
      actualAlunoId: result.aluno.id,
      link: result.studentContract,
      consumeConfirmationUpdate: contract.endDate !== undefined,
      consumeActivation: result.studentContract.status === 'active',
    };
    pendingCreate = null;
    return result.studentContract;
  };

  const finishUpdate = async (
    alunoId: string,
    profile: UpdateAlunoDTO,
    contract: UpdateStudentContractDTO & { contractId: string }
  ) => {
    const result = await atomicService.update(alunoId, profile, contract);
    completed = {
      requestedAlunoId: alunoId,
      actualAlunoId: alunoId,
      link: result.studentContract,
      consumeConfirmationUpdate: contract.endDate !== undefined,
      consumeActivation: result.studentContract.status === 'active',
    };
    pendingUpdates.delete(alunoId);
    return result.studentContract;
  };

  const listStudentContracts: typeof service.listStudentContracts = async (alunoId) => {
    if (pendingCreate?.provisionalAlunoId === alunoId) {
      return emptyContractsResponse(alunoId);
    }

    if (
      completed?.requestedAlunoId === alunoId &&
      alunoId.startsWith(PROVISIONAL_ALUNO_PREFIX)
    ) {
      const response: AlunoContractsResponse = {
        alunoId: completed.actualAlunoId,
        activeContract: completed.link.status === 'active' ? completed.link : null,
        contracts: [completed.link],
      };
      completed = null;
      return response;
    }

    const response = await originalList.call(service, alunoId);
    if (completed?.actualAlunoId === alunoId) completed = null;
    return response;
  };

  const linkStudentContract: typeof service.linkStudentContract = async (alunoId, data) => {
    if (pendingCreate?.provisionalAlunoId === alunoId) {
      return finishCreate(pendingCreate, data);
    }

    const profile = pendingUpdates.get(alunoId);
    if (profile) {
      return finishUpdate(alunoId, profile, data);
    }

    return originalLink.call(service, alunoId, data);
  };

  const updateStudentContract: typeof service.updateStudentContract = async (
    alunoId,
    studentContractId,
    data
  ) => {
    if (
      completed &&
      completed.link.id === studentContractId &&
      (completed.requestedAlunoId === alunoId || completed.actualAlunoId === alunoId) &&
      completed.consumeConfirmationUpdate
    ) {
      completed.consumeConfirmationUpdate = false;
      completed.link = { ...completed.link, ...data };
      return completed.link;
    }

    const profile = pendingUpdates.get(alunoId);
    if (profile) {
      const contractId = readSelectedContractId(root);
      if (!contractId) {
        throw new Error('Selecione um contrato antes de salvar o cadastro.');
      }
      return finishUpdate(alunoId, profile, { ...data, contractId });
    }

    return originalContractUpdate.call(service, alunoId, studentContractId, data);
  };

  const activateStudentContract: typeof service.activateStudentContract = async (
    alunoId,
    studentContractId
  ) => {
    if (
      completed &&
      completed.link.id === studentContractId &&
      (completed.requestedAlunoId === alunoId || completed.actualAlunoId === alunoId) &&
      completed.consumeActivation
    ) {
      completed.consumeActivation = false;
      return completed.link;
    }

    return originalActivate.call(service, alunoId, studentContractId);
  };

  service.create = create;
  service.update = update;
  service.listStudentContracts = listStudentContracts;
  service.linkStudentContract = linkStudentContract;
  service.updateStudentContract = updateStudentContract;
  service.activateStudentContract = activateStudentContract;

  return () => {
    pendingCreate = null;
    pendingUpdates.clear();
    completed = null;
    if (service.create === create) service.create = originalCreate;
    if (service.update === update) service.update = originalUpdate;
    if (service.listStudentContracts === listStudentContracts) {
      service.listStudentContracts = originalList;
    }
    if (service.linkStudentContract === linkStudentContract) {
      service.linkStudentContract = originalLink;
    }
    if (service.updateStudentContract === updateStudentContract) {
      service.updateStudentContract = originalContractUpdate;
    }
    if (service.activateStudentContract === activateStudentContract) {
      service.activateStudentContract = originalActivate;
    }
  };
}
