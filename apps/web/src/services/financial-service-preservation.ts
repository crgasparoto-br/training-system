type FinancialServiceResolutionInput = {
  activeContractServiceName?: string | null;
  persistedFinancialServiceName?: string | null;
};

const normalizeServiceName = (value?: string | null) => value?.replace(/\s+/g, ' ').trim() || '';

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
