import {
  alunoService,
  type LinkStudentContractDTO,
  type UpdateStudentContractDTO,
} from './aluno.service';

export const STUDENT_CONTRACTS_CHANGED_EVENT = 'student-contracts:changed';
export const CONTRACT_DUE_DATE_FIELD = 'intakeForm.financialInfo.contractDueDate';

type StudentContractMutationService = Pick<
  typeof alunoService,
  'linkStudentContract' | 'updateStudentContract' | 'activateStudentContract'
>;

export type StudentContractsChangedDetail = {
  alunoId: string;
};

export const readContractEndDate = (root: ParentNode = document) => {
  const field = root.querySelector<HTMLInputElement>(
    `[name="${CONTRACT_DUE_DATE_FIELD}"]`
  );

  if (!field) return undefined;
  return field.value.trim() || null;
};

export const appendContractEndDate = <
  T extends LinkStudentContractDTO | UpdateStudentContractDTO,
>(data: T, root: ParentNode = document): T => {
  const endDate = readContractEndDate(root);
  return endDate === undefined ? data : ({ ...data, endDate } as T);
};

export const installStudentContractEndDateAdapter = (
  service: StudentContractMutationService = alunoService,
  root: ParentNode = document,
  eventTarget: EventTarget = window
) => {
  const originalLink = service.linkStudentContract;
  const originalUpdate = service.updateStudentContract;
  const originalActivate = service.activateStudentContract;

  const notifyChanged = (alunoId: string) => {
    eventTarget.dispatchEvent(
      new CustomEvent<StudentContractsChangedDetail>(STUDENT_CONTRACTS_CHANGED_EVENT, {
        detail: { alunoId },
      })
    );
  };

  const linkStudentContract: typeof service.linkStudentContract = async (alunoId, data) => {
    const result = await originalLink.call(
      service,
      alunoId,
      appendContractEndDate(data, root)
    );
    notifyChanged(alunoId);
    return result;
  };

  const updateStudentContract: typeof service.updateStudentContract = async (
    alunoId,
    studentContractId,
    data
  ) => {
    const result = await originalUpdate.call(
      service,
      alunoId,
      studentContractId,
      appendContractEndDate(data, root)
    );
    notifyChanged(alunoId);
    return result;
  };

  const activateStudentContract: typeof service.activateStudentContract = async (
    alunoId,
    studentContractId
  ) => {
    const result = await originalActivate.call(service, alunoId, studentContractId);
    notifyChanged(alunoId);
    return result;
  };

  service.linkStudentContract = linkStudentContract;
  service.updateStudentContract = updateStudentContract;
  service.activateStudentContract = activateStudentContract;

  return () => {
    if (service.linkStudentContract === linkStudentContract) {
      service.linkStudentContract = originalLink;
    }
    if (service.updateStudentContract === updateStudentContract) {
      service.updateStudentContract = originalUpdate;
    }
    if (service.activateStudentContract === activateStudentContract) {
      service.activateStudentContract = originalActivate;
    }
  };
};
