export interface ServiceCatalogImpactConfirmation {
  resourceUpdatedAt: string;
  affectedPlans: number;
}

export interface ServiceCatalogOptionImpact {
  optionId: string;
  optionCode: string;
  optionName: string;
  isActive: boolean;
  affectedPlans: number;
}

export interface ServiceCatalogImpact {
  contractId: string;
  serviceId: string;
  serviceIsActive: boolean;
  resourceUpdatedAt: string;
  alunos: number;
  studentContracts: number;
  contractTemplates: number;
  generatedContracts: number;
  planComponentsOwned: number;
  planComponentsTargetingService: number;
  planComponentsTargetingOptions: number;
  affectedPlans: number;
  totalReferences: number;
  options: ServiceCatalogOptionImpact[];
}

export interface ServiceCommercialOptionImpact {
  contractId: string;
  serviceId: string;
  optionId: string;
  optionIsActive: boolean;
  resourceUpdatedAt: string;
  affectedPlans: number;
}
