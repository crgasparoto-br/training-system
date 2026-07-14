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

type ContractFormRoot = ParentNode & EventTarget;

export type StudentContractsChangedDetail = {
  alunoId: string;
};

export const readContractEndDate = (
  root: ParentNode = document,
  blankWasEdited = false
) => {
  const field = root.querySelector<HTMLInputElement>(
    `[name="${CONTRACT_DUE_DATE_FIELD}"]`
  );

  if (!field) return undefined;

  const value = field.value.trim();
  if (value) return value;

  return blankWasEdited ? null : undefined;
};

export const appendContractEndDate = <
  T extends LinkStudentContractDTO | UpdateStudentContractDTO,
>(data: T, root: ParentNode = document, blankWasEdited = false): T => {
  const endDate = readContractEndDate(root, blankWasEdited);
  return endDate === undefined ? data : ({ ...data, endDate } as T);
};

export const installStudentContractEndDateAdapter = (
  service: StudentContractMutationService = alunoService,
  root: ContractFormRoot = document,
  eventTarget: EventTarget = window
) => {
  const originalLink = service.linkStudentContract;
  const originalUpdate = service.updateStudentContract;
  const originalActivate = service.activateStudentContract;
  let dueDateWasEdited = false;

  const markDueDateAsEdited = (event: Event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.name === CONTRACT_DUE_DATE_FIELD
    ) {
      dueDateWasEdited = true;
    }
  };

  root.addEventListener('input', markDueDateAsEdited);
  root.addEventListener('change', markDueDateAsEdited);

  const notifyChanged = (alunoId: string) => {
    eventTarget.dispatchEvent(
      new CustomEvent<StudentContractsChangedDetail>(STUDENT_CONTRACTS_CHANGED_EVENT, {
        detail: { alunoId },
      })
    );
  };

  const withEndDate = <T extends LinkStudentContractDTO | UpdateStudentContractDTO>(
    data: T
  ) => appendContractEndDate(data, root, dueDateWasEdited);

  const linkStudentContract: typeof service.linkStudentContract = async (alunoId, data) => {
    const payload = withEndDate(data);
    let result = await originalLink.call(service, alunoId, payload);

    if (payload.endDate !== undefined) {
      result = await originalUpdate.call(service, alunoId, result.id, {
        endDate: payload.endDate,
      });
    }

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
      withEndDate(data)
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
    root.removeEventListener('input', markDueDateAsEdited);
    root.removeEventListener('change', markDueDateAsEdited);

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
