import api from './api';
import type {
  CreateCommercialOptionRequest,
  CreatePlanComponentRequest,
  CreatePresentationItemRequest,
  CreateServiceRequest,
  ReorderCatalogItemsRequest,
  ServiceCatalogBootstrapResult,
  ServiceCatalogDetail,
  ServiceCatalogImpact,
  ServiceCatalogImpactConfirmation,
  ServiceCatalogSummary,
  ServiceCommercialOption,
  ServiceCommercialOptionImpact,
  ServiceOption,
  ServicePlanComponent,
  ServicePresentationItem,
  UpdateCommercialOptionRequest,
  UpdatePlanComponentRequest,
  UpdatePresentationItemRequest,
  UpdateServiceRequest,
} from '@corrida/types';
import {
  buildCommercialOptionInactivationMessage,
  buildServiceInactivationMessage,
  toImpactConfirmation,
} from './service-catalog-inactivation';
import { publishServiceCatalogMutation } from './service-catalog-events';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

type ImpactAwareServiceUpdate = UpdateServiceRequest & {
  impactConfirmation?: ServiceCatalogImpactConfirmation;
};

type ImpactAwareOptionUpdate = UpdateCommercialOptionRequest & {
  impactConfirmation?: ServiceCatalogImpactConfirmation;
};

const catalogListRequests = new Map<boolean, Promise<ServiceCatalogSummary[]>>();
const MAX_CONCURRENT_CATALOG_DETAIL_REQUESTS = 2;
const catalogDetailWaiters: Array<() => void> = [];
let activeCatalogDetailRequests = 0;

async function withCatalogDetailConcurrency<T>(request: () => Promise<T>): Promise<T> {
  if (activeCatalogDetailRequests >= MAX_CONCURRENT_CATALOG_DETAIL_REQUESTS) {
    await new Promise<void>((resolve) => catalogDetailWaiters.push(resolve));
  }

  activeCatalogDetailRequests += 1;
  try {
    return await request();
  } finally {
    activeCatalogDetailRequests -= 1;
    catalogDetailWaiters.shift()?.();
  }
}

function confirmInactivation(message: string) {
  if (typeof window === 'undefined') return false;
  return window.confirm(message);
}

function cancellationError() {
  return new Error('Inativação cancelada. Nenhuma alteração foi salva.');
}

export const serviceCatalogService = {
  async list(includeInactive = false): Promise<ServiceOption[]> {
    const response = await api.get<ApiResponse<ServiceOption[]>>(
      `/services${includeInactive ? '?includeInactive=true' : ''}`
    );
    return response.data.data;
  },

  async listCatalog(includeInactive = true): Promise<ServiceCatalogSummary[]> {
    const inFlight = catalogListRequests.get(includeInactive);
    if (inFlight) return inFlight;

    let request!: Promise<ServiceCatalogSummary[]>;
    request = api
      .get<ApiResponse<ServiceCatalogSummary[]>>(
        `/services/catalog${includeInactive ? '?includeInactive=true' : ''}`
      )
      .then((response) => response.data.data)
      .finally(() => {
        if (catalogListRequests.get(includeInactive) === request) {
          catalogListRequests.delete(includeInactive);
        }
      });

    catalogListRequests.set(includeInactive, request);
    return request;
  },

  async getCatalogDetail(id: string): Promise<ServiceCatalogDetail> {
    return withCatalogDetailConcurrency(async () => {
      const response = await api.get<ApiResponse<ServiceCatalogDetail>>(`/services/catalog/${id}`);
      return response.data.data;
    });
  },

  async getCatalogImpact(id: string): Promise<ServiceCatalogImpact> {
    const response = await api.get<ApiResponse<ServiceCatalogImpact>>(
      `/services/catalog/${id}/impact`
    );
    return response.data.data;
  },

  async getCommercialOptionImpact(id: string): Promise<ServiceCommercialOptionImpact> {
    const response = await api.get<ApiResponse<ServiceCommercialOptionImpact>>(
      `/services/catalog/options/${id}/impact`
    );
    return response.data.data;
  },

  async createCatalogService(data: CreateServiceRequest): Promise<ServiceCatalogDetail> {
    const response = await api.post<ApiResponse<ServiceCatalogDetail>>('/services/catalog', data);
    publishServiceCatalogMutation({ kind: 'service', resourceId: response.data.data.id });
    return response.data.data;
  },

  async updateCatalogService(id: string, data: UpdateServiceRequest): Promise<ServiceCatalogDetail> {
    let request: ImpactAwareServiceUpdate = data;

    if (data.isActive === false) {
      const impact = await this.getCatalogImpact(id);
      if (impact.serviceIsActive) {
        if (!confirmInactivation(buildServiceInactivationMessage(impact))) {
          throw cancellationError();
        }
        request = { ...data, impactConfirmation: toImpactConfirmation(impact) };
      }
    }

    const response = await api.put<ApiResponse<ServiceCatalogDetail>>(
      `/services/catalog/${id}`,
      request
    );
    publishServiceCatalogMutation({ kind: 'service', resourceId: id, serviceId: id });
    return response.data.data;
  },

  async createCommercialOption(serviceId: string, data: CreateCommercialOptionRequest): Promise<ServiceCommercialOption> {
    const response = await api.post<ApiResponse<ServiceCommercialOption>>(
      `/services/catalog/${serviceId}/options`,
      data
    );
    publishServiceCatalogMutation({
      kind: 'option',
      resourceId: response.data.data.id,
      serviceId,
    });
    return response.data.data;
  },

  async updateCommercialOption(id: string, data: UpdateCommercialOptionRequest): Promise<ServiceCommercialOption> {
    let request: ImpactAwareOptionUpdate = data;

    if (data.isActive === false) {
      const impact = await this.getCommercialOptionImpact(id);
      if (impact.optionIsActive) {
        if (!confirmInactivation(buildCommercialOptionInactivationMessage(impact))) {
          throw cancellationError();
        }
        request = { ...data, impactConfirmation: toImpactConfirmation(impact) };
      }
    }

    const response = await api.put<ApiResponse<ServiceCommercialOption>>(
      `/services/catalog/options/${id}`,
      request
    );
    publishServiceCatalogMutation({
      kind: 'option',
      resourceId: id,
      serviceId: response.data.data.serviceId,
    });
    return response.data.data;
  },

  async reorderCommercialOptions(serviceId: string, data: ReorderCatalogItemsRequest): Promise<ServiceCommercialOption[]> {
    const response = await api.put<ApiResponse<ServiceCommercialOption[]>>(
      `/services/catalog/${serviceId}/options/reorder`,
      data
    );
    publishServiceCatalogMutation({ kind: 'reorder', serviceId });
    return response.data.data;
  },

  async createPresentationItem(serviceId: string, data: CreatePresentationItemRequest): Promise<ServicePresentationItem> {
    const response = await api.post<ApiResponse<ServicePresentationItem>>(
      `/services/catalog/${serviceId}/presentation-items`,
      data
    );
    publishServiceCatalogMutation({
      kind: 'presentation',
      resourceId: response.data.data.id,
      serviceId,
    });
    return response.data.data;
  },

  async updatePresentationItem(id: string, data: UpdatePresentationItemRequest): Promise<ServicePresentationItem> {
    const response = await api.put<ApiResponse<ServicePresentationItem>>(
      `/services/catalog/presentation-items/${id}`,
      data
    );
    publishServiceCatalogMutation({ kind: 'presentation', resourceId: id });
    return response.data.data;
  },

  async reorderPresentationItems(serviceId: string, data: ReorderCatalogItemsRequest): Promise<ServicePresentationItem[]> {
    const response = await api.put<ApiResponse<ServicePresentationItem[]>>(
      `/services/catalog/${serviceId}/presentation-items/reorder`,
      data
    );
    publishServiceCatalogMutation({ kind: 'reorder', serviceId });
    return response.data.data;
  },

  async createPlanComponent(serviceId: string, data: CreatePlanComponentRequest): Promise<ServicePlanComponent> {
    const response = await api.post<ApiResponse<ServicePlanComponent>>(
      `/services/catalog/${serviceId}/components`,
      data
    );
    publishServiceCatalogMutation({
      kind: 'component',
      resourceId: response.data.data.id,
      serviceId,
    });
    return response.data.data;
  },

  async updatePlanComponent(id: string, data: UpdatePlanComponentRequest): Promise<ServicePlanComponent> {
    const response = await api.put<ApiResponse<ServicePlanComponent>>(
      `/services/catalog/components/${id}`,
      data
    );
    publishServiceCatalogMutation({ kind: 'component', resourceId: id });
    return response.data.data;
  },

  async reorderPlanComponents(serviceId: string, data: ReorderCatalogItemsRequest): Promise<ServicePlanComponent[]> {
    const response = await api.put<ApiResponse<ServicePlanComponent[]>>(
      `/services/catalog/${serviceId}/components/reorder`,
      data
    );
    publishServiceCatalogMutation({ kind: 'reorder', serviceId });
    return response.data.data;
  },

  async bootstrapReferenceCatalog(dryRun = false): Promise<ServiceCatalogBootstrapResult> {
    const response = await api.post<ApiResponse<ServiceCatalogBootstrapResult>>(
      '/services/catalog/bootstrap',
      { dryRun }
    );
    if (!dryRun) {
      publishServiceCatalogMutation({ kind: 'bootstrap' });
    }
    return response.data.data;
  },

  async create(data: CreateServiceRequest): Promise<ServiceOption> {
    const response = await api.post<ApiResponse<ServiceOption>>('/services', data);
    publishServiceCatalogMutation({ kind: 'service', resourceId: response.data.data.id });
    return response.data.data;
  },

  async update(id: string, data: UpdateServiceRequest): Promise<ServiceOption> {
    const response = await api.put<ApiResponse<ServiceOption>>(`/services/${id}`, data);
    publishServiceCatalogMutation({ kind: 'service', resourceId: id });
    return response.data.data;
  },
};
