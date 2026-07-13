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
  ServiceCatalogSummary,
  ServiceCommercialOption,
  ServiceOption,
  ServicePlanComponent,
  ServicePresentationItem,
  UpdateCommercialOptionRequest,
  UpdatePlanComponentRequest,
  UpdatePresentationItemRequest,
  UpdateServiceRequest,
} from '@corrida/types';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export const serviceCatalogService = {
  async list(includeInactive = false): Promise<ServiceOption[]> {
    const response = await api.get<ApiResponse<ServiceOption[]>>(
      `/services${includeInactive ? '?includeInactive=true' : ''}`
    );
    return response.data.data;
  },

  async listCatalog(includeInactive = true): Promise<ServiceCatalogSummary[]> {
    const response = await api.get<ApiResponse<ServiceCatalogSummary[]>>(
      `/services/catalog${includeInactive ? '?includeInactive=true' : ''}`
    );
    return response.data.data;
  },

  async getCatalogDetail(id: string): Promise<ServiceCatalogDetail> {
    const response = await api.get<ApiResponse<ServiceCatalogDetail>>(`/services/catalog/${id}`);
    return response.data.data;
  },

  async getCatalogImpact(id: string): Promise<ServiceCatalogImpact> {
    const response = await api.get<ApiResponse<ServiceCatalogImpact>>(
      `/services/catalog/${id}/impact`
    );
    return response.data.data;
  },

  async createCatalogService(data: CreateServiceRequest): Promise<ServiceCatalogDetail> {
    const response = await api.post<ApiResponse<ServiceCatalogDetail>>('/services/catalog', data);
    return response.data.data;
  },

  async updateCatalogService(id: string, data: UpdateServiceRequest): Promise<ServiceCatalogDetail> {
    const response = await api.put<ApiResponse<ServiceCatalogDetail>>(`/services/catalog/${id}`, data);
    return response.data.data;
  },

  async createCommercialOption(serviceId: string, data: CreateCommercialOptionRequest): Promise<ServiceCommercialOption> {
    const response = await api.post<ApiResponse<ServiceCommercialOption>>(
      `/services/catalog/${serviceId}/options`,
      data
    );
    return response.data.data;
  },

  async updateCommercialOption(id: string, data: UpdateCommercialOptionRequest): Promise<ServiceCommercialOption> {
    const response = await api.put<ApiResponse<ServiceCommercialOption>>(
      `/services/catalog/options/${id}`,
      data
    );
    return response.data.data;
  },

  async reorderCommercialOptions(serviceId: string, data: ReorderCatalogItemsRequest): Promise<ServiceCommercialOption[]> {
    const response = await api.put<ApiResponse<ServiceCommercialOption[]>>(
      `/services/catalog/${serviceId}/options/reorder`,
      data
    );
    return response.data.data;
  },

  async createPresentationItem(serviceId: string, data: CreatePresentationItemRequest): Promise<ServicePresentationItem> {
    const response = await api.post<ApiResponse<ServicePresentationItem>>(
      `/services/catalog/${serviceId}/presentation-items`,
      data
    );
    return response.data.data;
  },

  async updatePresentationItem(id: string, data: UpdatePresentationItemRequest): Promise<ServicePresentationItem> {
    const response = await api.put<ApiResponse<ServicePresentationItem>>(
      `/services/catalog/presentation-items/${id}`,
      data
    );
    return response.data.data;
  },

  async reorderPresentationItems(serviceId: string, data: ReorderCatalogItemsRequest): Promise<ServicePresentationItem[]> {
    const response = await api.put<ApiResponse<ServicePresentationItem[]>>(
      `/services/catalog/${serviceId}/presentation-items/reorder`,
      data
    );
    return response.data.data;
  },

  async createPlanComponent(serviceId: string, data: CreatePlanComponentRequest): Promise<ServicePlanComponent> {
    const response = await api.post<ApiResponse<ServicePlanComponent>>(
      `/services/catalog/${serviceId}/components`,
      data
    );
    return response.data.data;
  },

  async updatePlanComponent(id: string, data: UpdatePlanComponentRequest): Promise<ServicePlanComponent> {
    const response = await api.put<ApiResponse<ServicePlanComponent>>(
      `/services/catalog/components/${id}`,
      data
    );
    return response.data.data;
  },

  async reorderPlanComponents(serviceId: string, data: ReorderCatalogItemsRequest): Promise<ServicePlanComponent[]> {
    const response = await api.put<ApiResponse<ServicePlanComponent[]>>(
      `/services/catalog/${serviceId}/components/reorder`,
      data
    );
    return response.data.data;
  },

  async bootstrapReferenceCatalog(dryRun = false): Promise<ServiceCatalogBootstrapResult> {
    const response = await api.post<ApiResponse<ServiceCatalogBootstrapResult>>(
      '/services/catalog/bootstrap',
      { dryRun }
    );
    return response.data.data;
  },

  async create(data: CreateServiceRequest): Promise<ServiceOption> {
    const response = await api.post<ApiResponse<ServiceOption>>('/services', data);
    return response.data.data;
  },

  async update(id: string, data: UpdateServiceRequest): Promise<ServiceOption> {
    const response = await api.put<ApiResponse<ServiceOption>>(`/services/${id}`, data);
    return response.data.data;
  },
};
