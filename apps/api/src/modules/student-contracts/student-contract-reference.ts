export const ACTIVE_CONTRACT_TEMPLATE_PREFIX = 'template:';

export const parseActiveContractTemplateReference = (value: string) => {
  if (!value.startsWith(ACTIVE_CONTRACT_TEMPLATE_PREFIX)) {
    return null;
  }

  const templateId = value.slice(ACTIVE_CONTRACT_TEMPLATE_PREFIX.length).trim();
  return templateId || null;
};
