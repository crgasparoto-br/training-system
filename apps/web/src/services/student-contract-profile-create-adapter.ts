import {
  alunoService,
  type CreateAlunoDTO,
  type CreateAlunoResult,
} from './aluno.service';
import {
  calculateContractEndDateFromControls,
  CONTRACT_DURATION_QUANTITY_FIELD,
  CONTRACT_DURATION_UNIT_FIELD,
  CONTRACT_START_DATE_FIELD,
  patchProfileContractDueDate,
} from './student-contract-end-date-adapter';

const REMOVE_DUE_DATE_SELECTOR = '[data-student-contract-due-date-action="true"]';
const TIMING_FIELDS = new Set([
  CONTRACT_START_DATE_FIELD,
  CONTRACT_DURATION_UNIT_FIELD,
  CONTRACT_DURATION_QUANTITY_FIELD,
]);

type StudentCreateService = {
  create(data: CreateAlunoDTO): Promise<CreateAlunoResult>;
};

type ContractFormRoot = ParentNode & EventTarget;

export function installStudentContractProfileCreateAdapter(
  service: StudentCreateService = alunoService,
  root: ContractFormRoot = document
) {
  const originalCreate = service.create;
  let dueDateRemoved = false;

  const markDueDateRemoved = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(REMOVE_DUE_DATE_SELECTOR)) return;
    dueDateRemoved = true;
  };

  const resetRemovalWhenTimingChanges = (event: Event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement || target instanceof HTMLSelectElement) ||
      !TIMING_FIELDS.has(target.name)
    ) {
      return;
    }

    dueDateRemoved = false;
  };

  const create: typeof service.create = async (data) => {
    const endDate = dueDateRemoved
      ? null
      : calculateContractEndDateFromControls(root) ?? undefined;
    const patchedData = patchProfileContractDueDate(
      { ...data } as Record<string, unknown>,
      endDate
    ) as unknown as CreateAlunoDTO;
    return originalCreate.call(service, patchedData);
  };

  root.addEventListener('click', markDueDateRemoved, true);
  root.addEventListener('input', resetRemovalWhenTimingChanges);
  root.addEventListener('change', resetRemovalWhenTimingChanges);
  service.create = create;

  return () => {
    root.removeEventListener('click', markDueDateRemoved, true);
    root.removeEventListener('input', resetRemovalWhenTimingChanges);
    root.removeEventListener('change', resetRemovalWhenTimingChanges);
    if (service.create === create) {
      service.create = originalCreate;
    }
  };
}
