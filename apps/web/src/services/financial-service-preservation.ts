import { alunoService } from './aluno.service';

export const FINANCIAL_SERVICE_FIELD = 'intakeForm.financialInfo.currentService';

const FINANCIAL_SERVICE_EMPTY_MESSAGE =
  'Nenhuma oferta financeira ativa cadastrada em Configurações > Serviços.';
const FALLBACK_CONTROL_ATTRIBUTE = 'data-financial-service-current-fallback';
const HIDDEN_EMPTY_STATE_ATTRIBUTE = 'data-financial-service-empty-state-hidden';
const SELECT_CLASS_NAME =
  'flex h-12 w-full rounded-xl border border-[#cbd5e1] bg-background px-4 py-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_6px_rgba(59,130,246,0.15)]';

type FinancialServiceResolutionInput = {
  activeContractServiceName?: string | null;
  persistedFinancialServiceName?: string | null;
};

type ProfileUpdatePayload = Record<string, unknown>;

type StudentProfileMutationService = {
  update(alunoId: string, data: ProfileUpdatePayload): Promise<unknown>;
};

const normalizeServiceName = (value?: string | null) =>
  value?.replace(/\s+/gu, ' ').trim() || '';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function readPersistedFinancialServiceName(formResponses: unknown) {
  if (!isRecord(formResponses) || !isRecord(formResponses.financial)) {
    return '';
  }

  const currentService = formResponses.financial.currentService;
  return typeof currentService === 'string' ? normalizeServiceName(currentService) : '';
}

export function resolveFinancialServiceName({
  activeContractServiceName,
  persistedFinancialServiceName,
}: FinancialServiceResolutionInput) {
  return (
    normalizeServiceName(activeContractServiceName) ||
    normalizeServiceName(persistedFinancialServiceName)
  );
}

export function ensurePreservedFinancialServiceOption(
  select: HTMLSelectElement,
  serviceName: string
) {
  const normalizedServiceName = normalizeServiceName(serviceName);
  if (!normalizedServiceName) {
    return false;
  }

  const existingOption = Array.from(select.options).find(
    (option) => normalizeServiceName(option.value) === normalizedServiceName
  );

  if (existingOption) {
    return false;
  }

  const option = document.createElement('option');
  option.value = normalizedServiceName;
  option.textContent = `${normalizedServiceName} • vínculo atual`;
  option.dataset.preservedFinancialService = 'true';

  select.insertBefore(option, select.options.item(1));
  return true;
}

const findFinancialServiceControl = (root: ParentNode) =>
  root.querySelector<HTMLSelectElement>(`select[name="${FINANCIAL_SERVICE_FIELD}"]`);

export const readFinancialServiceControlValue = (root: ParentNode = document) =>
  findFinancialServiceControl(root)?.value ?? '';

const findFinancialServiceEmptyState = (root: ParentNode) =>
  Array.from(root.querySelectorAll<HTMLParagraphElement>('p')).find(
    (paragraph) =>
      paragraph.textContent?.replace(/\s+/gu, ' ').trim() === FINANCIAL_SERVICE_EMPTY_MESSAGE
  ) ?? null;

export const ensurePreservedFinancialServiceControl = (
  root: ParentNode,
  serviceName: string
) => {
  const normalizedServiceName = normalizeServiceName(serviceName);
  const existingControl = findFinancialServiceControl(root);

  if (existingControl) {
    if (normalizedServiceName) {
      ensurePreservedFinancialServiceOption(existingControl, normalizedServiceName);
    }
    return existingControl;
  }

  const emptyState = findFinancialServiceEmptyState(root);
  if (!emptyState?.parentElement) return null;

  let fallback = root.querySelector<HTMLSelectElement>(
    `select[${FALLBACK_CONTROL_ATTRIBUTE}="true"]`
  );

  if (!fallback) {
    fallback = document.createElement('select');
    fallback.name = FINANCIAL_SERVICE_FIELD;
    fallback.className = SELECT_CLASS_NAME;
    fallback.setAttribute(FALLBACK_CONTROL_ATTRIBUTE, 'true');

    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = 'Sem serviço vigente';
    fallback.appendChild(blankOption);

    emptyState.insertAdjacentElement('afterend', fallback);
    emptyState.hidden = true;
    emptyState.setAttribute(HIDDEN_EMPTY_STATE_ATTRIBUTE, 'true');
  }

  if (normalizedServiceName) {
    ensurePreservedFinancialServiceOption(fallback, normalizedServiceName);
  }
  fallback.value = normalizedServiceName;
  return fallback;
};

export const removePreservedFinancialServiceFallback = (root: ParentNode) => {
  root
    .querySelectorAll<HTMLElement>(`[${FALLBACK_CONTROL_ATTRIBUTE}="true"]`)
    .forEach((element) => element.remove());
  root
    .querySelectorAll<HTMLElement>(`[${HIDDEN_EMPTY_STATE_ATTRIBUTE}="true"]`)
    .forEach((element) => {
      element.hidden = false;
      element.removeAttribute(HIDDEN_EMPTY_STATE_ATTRIBUTE);
    });
};

export const patchProfileFinancialService = <T extends ProfileUpdatePayload>(
  payload: T,
  serviceName: string
): T => {
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
          currentService: normalizeServiceName(serviceName),
        },
      },
    },
  } as T;
};

export const installFinancialServicePayloadAdapter = (
  getServiceName: () => string,
  service: StudentProfileMutationService = alunoService as unknown as StudentProfileMutationService
) => {
  const originalUpdate = service.update;

  const update: typeof service.update = async (alunoId, data) =>
    originalUpdate.call(service, alunoId, patchProfileFinancialService(data, getServiceName()));

  service.update = update;

  return () => {
    if (service.update === update) {
      service.update = originalUpdate;
    }
  };
};
