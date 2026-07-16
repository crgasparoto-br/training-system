import {
  alunoService,
  type AlunoContractsResponse,
  type LinkStudentContractDTO,
  type StudentContractLink,
  type UpdateStudentContractDTO,
} from './aluno.service';

export const STUDENT_CONTRACTS_CHANGED_EVENT = 'student-contracts:changed';
export const CONTRACT_DUE_DATE_FIELD = 'intakeForm.financialInfo.contractDueDate';
export const CONTRACT_START_DATE_FIELD = 'intakeForm.financialInfo.contractStartDate';
export const CONTRACT_DURATION_UNIT_FIELD = 'intakeForm.financialInfo.contractDurationUnit';
export const CONTRACT_DURATION_QUANTITY_FIELD =
  'intakeForm.financialInfo.contractDurationQuantity';

const CONTRACT_DUE_DATE_ACTION_MARKER = 'studentContractDueDateAction';
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/u;
const CONTRACT_TIMING_FIELDS = new Set([
  CONTRACT_START_DATE_FIELD,
  CONTRACT_DURATION_UNIT_FIELD,
  CONTRACT_DURATION_QUANTITY_FIELD,
]);

type ContractFormRoot = ParentNode & EventTarget;
type ProfileUpdatePayload = Record<string, unknown>;

type StudentContractMutationService = {
  update(alunoId: string, data: ProfileUpdatePayload): Promise<unknown>;
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
  listStudentContracts(alunoId: string): Promise<AlunoContractsResponse>;
};

export type StudentContractsChangedDetail = {
  alunoId: string;
};

export type StudentContractEndDateAdapterOptions = {
  getExistingEndDate?: () => string | null | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const normalizeContractDateOnly = (value?: string | null) => {
  if (!value) return null;
  const match = DATE_ONLY_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const formatDateOnly = (date: Date) =>
  `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addMonthsPreservingDay = (baseDate: Date, quantity: number) => {
  const originalDay = baseDate.getDate();
  const targetMonthIndex = baseDate.getMonth() + quantity;
  const targetYear = baseDate.getFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();

  return new Date(targetYear, normalizedMonth, Math.min(originalDay, lastDay));
};

export const calculateContractEndDate = (
  startDate?: string | null,
  unit?: string | null,
  quantity?: string | number | null
) => {
  const normalizedStart = normalizeContractDateOnly(startDate);
  const numericQuantity = Number(quantity);

  if (
    !normalizedStart ||
    !Number.isInteger(numericQuantity) ||
    numericQuantity <= 0 ||
    (unit !== 'days' && unit !== 'months' && unit !== 'years')
  ) {
    return null;
  }

  const [year, month, day] = normalizedStart.split('-').map(Number);
  const baseDate = new Date(year, month - 1, day);
  let dueDate = new Date(baseDate);

  if (unit === 'days') {
    dueDate.setDate(dueDate.getDate() + numericQuantity);
  } else {
    const months = unit === 'years' ? numericQuantity * 12 : numericQuantity;
    dueDate = addMonthsPreservingDay(baseDate, months);
  }

  return formatDateOnly(dueDate);
};

const readControlValue = (root: ParentNode, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';

export const calculateContractEndDateFromControls = (root: ParentNode = document) =>
  calculateContractEndDate(
    readControlValue(root, CONTRACT_START_DATE_FIELD),
    readControlValue(root, CONTRACT_DURATION_UNIT_FIELD),
    readControlValue(root, CONTRACT_DURATION_QUANTITY_FIELD)
  );

const readExplicitContractEndDate = (root: ParentNode) => {
  const field = root.querySelector<HTMLInputElement>(`[name="${CONTRACT_DUE_DATE_FIELD}"]`);
  return normalizeContractDateOnly(field?.value);
};

export const resolveContractEndDate = ({
  root = document,
  timingWasEdited = false,
  explicitOverride,
  existingEndDate,
}: {
  root?: ParentNode;
  timingWasEdited?: boolean;
  explicitOverride?: string | null;
  existingEndDate?: string | null;
}) => {
  if (explicitOverride === null) return null;

  const normalizedOverride = normalizeContractDateOnly(explicitOverride);
  if (normalizedOverride) return normalizedOverride;

  const calculated = calculateContractEndDateFromControls(root);
  if (calculated) return calculated;

  const explicitFieldValue = readExplicitContractEndDate(root);
  if (explicitFieldValue) return explicitFieldValue;

  if (timingWasEdited) return null;

  return normalizeContractDateOnly(existingEndDate) ?? undefined;
};

export const appendContractEndDate = <
  T extends LinkStudentContractDTO | UpdateStudentContractDTO,
>(
  data: T,
  root: ParentNode = document,
  timingWasEdited = false,
  existingEndDate?: string | null,
  explicitOverride?: string | null
): T => {
  const endDate = resolveContractEndDate({
    root,
    timingWasEdited,
    existingEndDate,
    explicitOverride,
  });

  return endDate === undefined ? data : ({ ...data, endDate } as T);
};

export const patchProfileContractDueDate = <T extends ProfileUpdatePayload>(
  payload: T,
  endDate: string | null | undefined
): T => {
  if (endDate === undefined) return payload;

  const intakeForm = isRecord(payload.intakeForm) ? payload.intakeForm : {};
  const formResponses = isRecord(intakeForm.formResponses) ? intakeForm.formResponses : {};
  const financial = isRecord(formResponses.financial) ? formResponses.financial : {};

  return {
    ...payload,
    intakeForm: {
      ...intakeForm,
      formResponses: {
        ...formResponses,
        financial: {
          ...financial,
          contractDueDate: endDate ?? '',
        },
      },
    },
  } as T;
};

const normalizeDateForDisplay = (value?: string | null) => {
  const normalized = normalizeContractDateOnly(value);
  return normalized ? `${normalized}T12:00:00` : value ?? null;
};

export const normalizeStudentContractLinkDates = (
  link: StudentContractLink
): StudentContractLink => ({
  ...link,
  startDate: normalizeDateForDisplay(link.startDate),
  endDate: normalizeDateForDisplay(link.endDate),
});

export const normalizeAlunoContractsResponseDates = (
  response: AlunoContractsResponse
): AlunoContractsResponse => {
  const contracts = response.contracts.map(normalizeStudentContractLinkDates);
  const activeContract = response.activeContract
    ? contracts.find((contract) => contract.id === response.activeContract?.id) ??
      normalizeStudentContractLinkDates(response.activeContract)
    : null;

  return { ...response, contracts, activeContract };
};

const findDueDateDisplayControl = (root: ParentNode) => {
  const labels = Array.from(root.querySelectorAll('label'));
  const label = labels.find(
    (candidate) => candidate.textContent?.replace(/\s+/gu, ' ').trim() === 'Vencimento do Contrato'
  );

  return label?.parentElement?.querySelector<HTMLInputElement>('input[type="date"]') ?? null;
};

const ensureRemoveDueDateButton = (
  root: ParentNode,
  onRemove: () => void,
  visible: boolean
) => {
  const dueDateControl = findDueDateDisplayControl(root);
  if (!dueDateControl?.parentElement?.parentElement) return null;

  const host = dueDateControl.parentElement.parentElement;
  let button = host.querySelector<HTMLButtonElement>(
    `[data-${CONTRACT_DUE_DATE_ACTION_MARKER.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}="true"]`
  );

  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Remover vencimento';
    button.className =
      'mt-2 text-left text-xs font-medium text-destructive underline-offset-4 hover:underline';
    button.dataset[CONTRACT_DUE_DATE_ACTION_MARKER] = 'true';
    button.addEventListener('click', onRemove);
    host.appendChild(button);
  }

  button.hidden = !visible;
  return button;
};

export const installStudentContractEndDateAdapter = (
  service: StudentContractMutationService = alunoService as unknown as StudentContractMutationService,
  root: ContractFormRoot = document,
  eventTarget: EventTarget = window,
  options: StudentContractEndDateAdapterOptions = {}
) => {
  const originalProfileUpdate = service.update;
  const originalLink = service.linkStudentContract;
  const originalContractUpdate = service.updateStudentContract;
  const originalActivate = service.activateStudentContract;
  const originalList = service.listStudentContracts;
  let timingWasEdited = false;
  let explicitOverride: string | null | undefined;

  const resolveEndDate = () =>
    resolveContractEndDate({
      root,
      timingWasEdited,
      explicitOverride,
      existingEndDate: options.getExistingEndDate?.(),
    });

  const syncDueDateDisplay = () => {
    const endDate = resolveEndDate();
    const control = findDueDateDisplayControl(root);

    if (control && endDate !== undefined && control.value !== (endDate ?? '')) {
      control.value = endDate ?? '';
    }

    ensureRemoveDueDateButton(
      root,
      () => {
        timingWasEdited = true;
        explicitOverride = null;
        syncDueDateDisplay();
      },
      Boolean(endDate)
    );
  };

  const markTimingAsEdited = (event: Event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement || target instanceof HTMLSelectElement) ||
      !CONTRACT_TIMING_FIELDS.has(target.name)
    ) {
      return;
    }

    timingWasEdited = true;
    explicitOverride = undefined;
    syncDueDateDisplay();
    queueMicrotask(syncDueDateDisplay);
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(syncDueDateDisplay);
    }
  };

  root.addEventListener('input', markTimingAsEdited);
  root.addEventListener('change', markTimingAsEdited);

  const notifyChanged = (alunoId: string) => {
    eventTarget.dispatchEvent(
      new CustomEvent<StudentContractsChangedDetail>(STUDENT_CONTRACTS_CHANGED_EVENT, {
        detail: { alunoId },
      })
    );
  };

  const updateProfile: typeof service.update = async (alunoId, data) =>
    originalProfileUpdate.call(service, alunoId, patchProfileContractDueDate(data, resolveEndDate()));

  const linkStudentContract: typeof service.linkStudentContract = async (alunoId, data) => {
    const payload = appendContractEndDate(
      data,
      root,
      timingWasEdited,
      options.getExistingEndDate?.(),
      explicitOverride
    );
    let result = await originalLink.call(service, alunoId, payload);

    if (payload.endDate !== undefined) {
      result = await originalContractUpdate.call(service, alunoId, result.id, {
        endDate: payload.endDate,
      });
    }

    notifyChanged(alunoId);
    return normalizeStudentContractLinkDates(result);
  };

  const updateStudentContract: typeof service.updateStudentContract = async (
    alunoId,
    studentContractId,
    data
  ) => {
    const result = await originalContractUpdate.call(
      service,
      alunoId,
      studentContractId,
      appendContractEndDate(
        data,
        root,
        timingWasEdited,
        options.getExistingEndDate?.(),
        explicitOverride
      )
    );
    notifyChanged(alunoId);
    return normalizeStudentContractLinkDates(result);
  };

  const activateStudentContract: typeof service.activateStudentContract = async (
    alunoId,
    studentContractId
  ) => {
    const result = await originalActivate.call(service, alunoId, studentContractId);
    notifyChanged(alunoId);
    return normalizeStudentContractLinkDates(result);
  };

  const listStudentContracts: typeof service.listStudentContracts = async (alunoId) =>
    normalizeAlunoContractsResponseDates(await originalList.call(service, alunoId));

  service.update = updateProfile;
  service.linkStudentContract = linkStudentContract;
  service.updateStudentContract = updateStudentContract;
  service.activateStudentContract = activateStudentContract;
  service.listStudentContracts = listStudentContracts;

  syncDueDateDisplay();
  const observerTarget = root instanceof Document ? root.body : root;
  const observer = new MutationObserver(syncDueDateDisplay);
  if (observerTarget) {
    observer.observe(observerTarget as Node, { childList: true, subtree: true });
  }
  const interval = window.setInterval(syncDueDateDisplay, 250);

  return () => {
    root.removeEventListener('input', markTimingAsEdited);
    root.removeEventListener('change', markTimingAsEdited);
    observer.disconnect();
    window.clearInterval(interval);
    root
      .querySelectorAll<HTMLElement>(`[data-student-contract-due-date-action="true"]`)
      .forEach((element) => element.remove());

    if (service.update === updateProfile) service.update = originalProfileUpdate;
    if (service.linkStudentContract === linkStudentContract) {
      service.linkStudentContract = originalLink;
    }
    if (service.updateStudentContract === updateStudentContract) {
      service.updateStudentContract = originalContractUpdate;
    }
    if (service.activateStudentContract === activateStudentContract) {
      service.activateStudentContract = originalActivate;
    }
    if (service.listStudentContracts === listStudentContracts) {
      service.listStudentContracts = originalList;
    }
  };
};
