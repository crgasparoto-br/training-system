import type { ContractInfo } from './auth.js';

export const SERVICE_CATEGORIES = ['assessment', 'individual_service', 'combined_plan'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_PRICE_TYPES = ['fixed', 'free', 'on_request'] as const;
export type ServicePriceType = (typeof SERVICE_PRICE_TYPES)[number];

export const SERVICE_ORIGINS = ['manual', 'legacy', 'acesso_2026'] as const;
export type ServiceOrigin = (typeof SERVICE_ORIGINS)[number];

/**
 * Contrato legado mantido durante o rollout. Serviços principais continuam usando
 * os mesmos IDs referenciados por alunos, contratos e modelos de contrato.
 * Opções comerciais estruturadas também são projetadas neste formato quando um
 * consumidor antigo ainda solicita GET /services.
 */
export interface ServiceOption {
  id: string;
  contractId: string;
  name: string;
  code: string;
  description?: string | null;
  parentServiceId?: string | null;
  parentService?: {
    id: string;
    name: string;
  } | null;
  monthlyPrice?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive: boolean;
  isSystem: boolean;
  category?: ServiceCategory;
  summary?: string | null;
  whatIs?: string | null;
  targetAudience?: string | null;
  displayOrder?: number;
  origin?: ServiceOrigin;
  unavailableReason?: string | null;
  contract?: ContractInfo;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceCommercialOption {
  id: string;
  contractId: string;
  serviceId: string;
  code: string;
  name: string;
  frequency?: string | null;
  quantity?: number | null;
  unit?: string | null;
  priceType: ServicePriceType;
  priceAmount?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive: boolean;
  displayOrder: number;
  origin: ServiceOrigin;
  usedByPlansCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServicePresentationItem {
  id: string;
  contractId: string;
  serviceId: string;
  text: string;
  isActive: boolean;
  displayOrder: number;
  origin: ServiceOrigin;
  createdAt: string;
  updatedAt: string;
}

export interface ServicePlanComponent {
  id: string;
  contractId: string;
  planServiceId: string;
  targetServiceId?: string | null;
  targetOptionId?: string | null;
  targetService?: Pick<ServiceCatalogSummary, 'id' | 'name' | 'code' | 'isActive'> | null;
  targetOption?: Pick<ServiceCommercialOption, 'id' | 'name' | 'code' | 'serviceId' | 'isActive'> | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
  isActive: boolean;
  isCommerciallyActive?: boolean;
  displayOrder: number;
  origin: ServiceOrigin;
  createdAt: string;
  updatedAt: string;
}

export type ServiceCommercialState =
  | 'available'
  | 'free'
  | 'on_request'
  | 'without_active_option'
  | 'expired'
  | 'incomplete_plan';

export interface ServiceCatalogSummary {
  id: string;
  contractId: string;
  name: string;
  code: string;
  category: ServiceCategory;
  summary?: string | null;
  isActive: boolean;
  isSystem: boolean;
  displayOrder: number;
  origin: ServiceOrigin;
  activeOptionsCount: number;
  activeComponentsCount: number;
  commercialState: ServiceCommercialState;
  startingPrice?: number | null;
  priceLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceCatalogDetail extends ServiceCatalogSummary {
  whatIs?: string | null;
  targetAudience?: string | null;
  legacyDescription?: string | null;
  options: ServiceCommercialOption[];
  presentationItems: ServicePresentationItem[];
  components: ServicePlanComponent[];
  usedByPlansCount: number;
}

export interface CreateServiceRequest {
  name: string;
  code?: string;
  description?: string | null;
  parentServiceId?: string;
  monthlyPrice?: number;
  validFrom?: string;
  validUntil?: string;
  isActive?: boolean;
  category?: ServiceCategory;
  summary?: string | null;
  whatIs?: string | null;
  targetAudience?: string | null;
  displayOrder?: number;
}

export interface UpdateServiceRequest {
  name?: string;
  code?: string;
  description?: string | null;
  parentServiceId?: string | null;
  monthlyPrice?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive?: boolean;
  category?: ServiceCategory;
  summary?: string | null;
  whatIs?: string | null;
  targetAudience?: string | null;
  displayOrder?: number;
}

export interface CreateCommercialOptionRequest {
  code: string;
  name: string;
  frequency?: string;
  quantity?: number;
  unit?: string;
  priceType: ServicePriceType;
  priceAmount?: number;
  validFrom?: string;
  validUntil?: string;
  isActive?: boolean;
  displayOrder?: number;
}

export type UpdateCommercialOptionRequest = Omit<
  Partial<CreateCommercialOptionRequest>,
  'frequency' | 'quantity' | 'unit' | 'priceAmount' | 'validFrom' | 'validUntil'
> & {
  frequency?: string | null;
  quantity?: number | null;
  unit?: string | null;
  priceAmount?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
};

export interface CreatePresentationItemRequest {
  text: string;
  isActive?: boolean;
  displayOrder?: number;
}

export type UpdatePresentationItemRequest = Partial<CreatePresentationItemRequest>;

export interface CreatePlanComponentRequest {
  targetServiceId?: string;
  targetOptionId?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
  isActive?: boolean;
  displayOrder?: number;
}

export type UpdatePlanComponentRequest = Omit<
  Partial<CreatePlanComponentRequest>,
  'targetServiceId' | 'targetOptionId' | 'quantity' | 'unit' | 'notes'
> & {
  targetServiceId?: string | null;
  targetOptionId?: string | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
};

export interface ReorderCatalogItemsRequest {
  ids: string[];
}

export interface ServiceCatalogBootstrapResult {
  contractId: string;
  dryRun: boolean;
  createdServices: string[];
  createdOptions: string[];
  createdPresentationItems: number;
  createdComponents: number;
  preservedServices: string[];
  conflicts: Array<{
    code: string;
    message: string;
  }>;
}
