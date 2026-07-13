export interface ServiceCatalogOptionImpact {
  optionId: string;
  optionCode: string;
  optionName: string;
  isActive: boolean;
  planComponents: number;
}

export interface ServiceCatalogImpact {
  contractId: string;
  serviceId: string;
  alunos: number;
  studentContracts: number;
  contractTemplates: number;
  generatedContracts: number;
  planComponentsOwned: number;
  planComponentsTargetingService: number;
  planComponentsTargetingOptions: number;
  totalReferences: number;
  options: ServiceCatalogOptionImpact[];
}
