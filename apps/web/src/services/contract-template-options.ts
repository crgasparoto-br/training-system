export const ACTIVE_CONTRACT_TEMPLATE_PREFIX = 'template:';

export interface ContractTemplateOptionTemplate {
  id: string;
  name: string;
  serviceId?: string | null;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
}

export interface ContractTemplateOptionService {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  parentServiceId?: string | null;
  monthlyPrice?: number | null;
  isActive?: boolean;
}

export interface ActiveContractTemplateOption {
  id: string;
  templateId: string;
  sourceType: 'template';
  title: string;
  status: 'ACTIVE';
  alunoId: string;
  serviceId?: string | null;
  createdAt: string;
  service?: ContractTemplateOptionService | null;
  studentContracts: [];
}

const isTemplateCompatibleWithService = (
  templateServiceId: string | null | undefined,
  selectedServiceId: string | undefined,
  servicesById: Map<string, ContractTemplateOptionService>
) => {
  if (!selectedServiceId || !templateServiceId) {
    return true;
  }

  if (templateServiceId === selectedServiceId) {
    return true;
  }

  const templateService = servicesById.get(templateServiceId);
  const selectedService = servicesById.get(selectedServiceId);

  return (
    templateService?.parentServiceId === selectedServiceId ||
    selectedService?.parentServiceId === templateServiceId
  );
};

export const buildActiveContractTemplateOptions = (
  templates: ContractTemplateOptionTemplate[],
  services: ContractTemplateOptionService[],
  filters?: { alunoId?: string; serviceId?: string }
): ActiveContractTemplateOption[] => {
  const servicesById = new Map(services.map((service) => [service.id, service]));

  return templates
    .filter((template) => template.status === 'ACTIVE')
    .filter((template) =>
      isTemplateCompatibleWithService(template.serviceId, filters?.serviceId, servicesById)
    )
    .map((template) => ({
      id: `${ACTIVE_CONTRACT_TEMPLATE_PREFIX}${template.id}`,
      templateId: template.id,
      sourceType: 'template' as const,
      title: `Modelo ativo: ${template.name} v${template.version}`,
      status: 'ACTIVE' as const,
      alunoId: filters?.alunoId || '',
      serviceId: template.serviceId,
      createdAt: '',
      service: template.serviceId ? servicesById.get(template.serviceId) || null : null,
      studentContracts: [] as [],
    }));
};
