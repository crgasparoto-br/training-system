import api from './api';
import {
  buildAvailableStudentContractQuery,
  type AvailableStudentContractFilters,
} from './contract-query';
import {
  buildActiveContractTemplateOptions,
  type ContractTemplateOptionService,
} from './contract-template-options';
import {
  CONTRACT_VARIABLES,
  normalizeContractVariables,
  type ContractVariableDefinition,
} from './contractVariables';

export { CONTRACT_VARIABLES };
export type { ContractVariableDefinition };

export interface Contract {
  id: string;
  type: 'academy' | 'personal';
  document: string;
  name?: string | null;
  tradeName?: string | null;
  cref?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressComplement?: string | null;
  addressZipCode?: string | null;
  logoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractTemplateClause {
  id?: string;
  order: number;
  title: string;
  bodyHtml: string;
  required: boolean;
  editable: boolean;
}

export interface ContractTemplate {
  id: string;
  name: string;
  description?: string | null;
  serviceId?: string | null;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  headerHtml: string;
  footerHtml: string;
  clauses: ContractTemplateClause[];
}

export interface ContractRejection {
  rejected: boolean;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

export interface GeneratedContract {
  id: string;
  title: string;
  status:
    | 'DRAFT'
    | 'GENERATED'
    | 'SENT'
    | 'VIEWED'
    | 'SIGNED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'EXPIRED';
  renderedHtml: string;
  pdfPath?: string | null;
  signedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
}

export interface ContractSignatureResult {
  activation: {
    effectiveAt: string;
    scheduled: boolean;
    studentContractStatus: 'pending_signature' | 'active';
  };
}

export interface AvailableStudentContract {
  id: string;
  title: string;
  status:
    | 'ACTIVE'
    | 'DRAFT'
    | 'GENERATED'
    | 'SENT'
    | 'VIEWED'
    | 'SIGNED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'EXPIRED';
  alunoId: string;
  serviceId?: string | null;
  createdAt: string;
  signedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  cancelledAt?: string | null;
  sourceType?: 'generated' | 'template';
  templateId?: string;
  service?: {
    id: string;
    name: string;
    code?: string | null;
    description?: string | null;
    monthlyPrice?: number | null;
    isActive?: boolean;
  } | null;
  studentContracts?: Array<{
    id: string;
    alunoId: string;
    status: 'draft' | 'pending_signature' | 'active' | 'expired' | 'canceled' | 'terminated';
  }>;
}

const loadContractRejection = async (id: string): Promise<ContractRejection> => {
  try {
    const response = await api.get<{ success: boolean; data: ContractRejection }>(
      `/contracts/documents/${id}/rejection`
    );
    return response.data.data;
  } catch {
    return { rejected: false, rejectedAt: null, rejectionReason: null };
  }
};

const applyContractRejection = <T extends GeneratedContract | AvailableStudentContract>(
  contract: T,
  rejection: ContractRejection
): T => {
  if (!rejection.rejected) return contract;

  return {
    ...contract,
    status: 'REJECTED',
    rejectedAt: rejection.rejectedAt || null,
    rejectionReason: rejection.rejectionReason || null,
  } as T;
};

export const contractService = {
  async getMe(): Promise<Contract> {
    const response = await api.get<{ success: boolean; data: Contract }>('/contracts/me');
    return response.data.data;
  },

  async updateMe(data: {
    name?: string;
    document?: string;
    tradeName?: string | null;
    cref?: string | null;
    addressStreet?: string | null;
    addressNumber?: string | null;
    addressNeighborhood?: string | null;
    addressCity?: string | null;
    addressState?: string | null;
    addressComplement?: string | null;
    addressZipCode?: string | null;
    logoUrl?: string | null;
  }): Promise<Contract> {
    const response = await api.put<{ success: boolean; data: Contract }>(
      '/contracts/me',
      data
    );
    return response.data.data;
  },

  async uploadLogo(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<{ success: boolean; data: { url: string } }>(
      '/contracts/logo-upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data.data.url;
  },

  async listVariables(): Promise<ContractVariableDefinition[]> {
    try {
      const response = await api.get<{
        success: boolean;
        data: Array<Partial<ContractVariableDefinition> & { key: string; token?: string }>;
      }>('/contracts/variables');
      return response.data.data?.length
        ? normalizeContractVariables(response.data.data)
        : CONTRACT_VARIABLES;
    } catch {
      return CONTRACT_VARIABLES;
    }
  },

  async listTemplates(): Promise<ContractTemplate[]> {
    const response = await api.get<{ success: boolean; data: ContractTemplate[] }>('/contracts/templates');
    return response.data.data;
  },

  async createTemplate(data: Partial<ContractTemplate>): Promise<ContractTemplate> {
    const response = await api.post<{ success: boolean; data: ContractTemplate }>('/contracts/templates', data);
    return response.data.data;
  },

  async updateTemplate(id: string, data: Partial<ContractTemplate>): Promise<ContractTemplate> {
    const response = await api.put<{ success: boolean; data: ContractTemplate }>(`/contracts/templates/${id}`, data);
    return response.data.data;
  },

  async duplicateTemplate(id: string): Promise<ContractTemplate> {
    const response = await api.post<{ success: boolean; data: ContractTemplate }>(`/contracts/templates/${id}/duplicate`);
    return response.data.data;
  },

  async setTemplateStatus(id: string, status: ContractTemplate['status']): Promise<ContractTemplate> {
    const response = await api.post<{ success: boolean; data: ContractTemplate }>(`/contracts/templates/${id}/status`, { status });
    return response.data.data;
  },

  async preview(data: Record<string, unknown>): Promise<{ html: string; context: Record<string, unknown> }> {
    const response = await api.post<{ success: boolean; data: { html: string; context: Record<string, unknown> } }>('/contracts/preview', data);
    return response.data.data;
  },

  async generate(data: Record<string, unknown>): Promise<GeneratedContract> {
    const response = await api.post<{ success: boolean; data: GeneratedContract }>('/contracts/generate', data);
    return response.data.data;
  },

  async listAlunoContracts(alunoId: string): Promise<GeneratedContract[]> {
    const response = await api.get<{ success: boolean; data: GeneratedContract[] }>(`/contracts/alunos/${alunoId}`);
    return Promise.all(
      response.data.data.map(async (contract) =>
        applyContractRejection(contract, await loadContractRejection(contract.id))
      )
    );
  },

  async getDocument(id: string): Promise<GeneratedContract> {
    const [documentResponse, rejection] = await Promise.all([
      api.get<{ success: boolean; data: GeneratedContract }>(`/contracts/documents/${id}`),
      loadContractRejection(id),
    ]);
    return applyContractRejection(documentResponse.data.data, rejection);
  },

  async listAvailableForStudent(
    filters?: AvailableStudentContractFilters
  ): Promise<AvailableStudentContract[]> {
    const query = buildAvailableStudentContractQuery(filters);
    const [generatedResponse, templatesResponse, servicesResponse] = await Promise.all([
      api.get<{ success: boolean; data: AvailableStudentContract[] }>(
        query ? `/contracts/available-for-student?${query}` : '/contracts/available-for-student'
      ),
      api.get<{ success: boolean; data: ContractTemplate[] }>('/contracts/templates'),
      api.get<{ success: boolean; data: ContractTemplateOptionService[] }>('/services'),
    ]);

    const activeTemplateOptions = buildActiveContractTemplateOptions(
      templatesResponse.data.data,
      servicesResponse.data.data,
      {
        alunoId: filters?.alunoId,
        serviceId: filters?.serviceId,
      }
    );

    const generatedContracts = filters?.alunoId
      ? await Promise.all(
          generatedResponse.data.data.map(async (contract) =>
            applyContractRejection(
              {
                ...contract,
                sourceType: 'generated' as const,
              },
              await loadContractRejection(contract.id)
            )
          )
        )
      : [];

    return [...activeTemplateOptions, ...generatedContracts];
  },

  async generatePdf(id: string): Promise<GeneratedContract> {
    const response = await api.post<{ success: boolean; data: GeneratedContract }>(`/contracts/documents/${id}/pdf`);
    return response.data.data;
  },

  async sendForSignature(id: string): Promise<{ contract: GeneratedContract; token: string }> {
    const response = await api.post<{ success: boolean; data: { contract: GeneratedContract; token: string } }>(`/contracts/documents/${id}/send`);
    return response.data.data;
  },

  async cancelGenerated(id: string): Promise<GeneratedContract> {
    const response = await api.post<{ success: boolean; data: GeneratedContract }>(`/contracts/documents/${id}/cancel`);
    return response.data.data;
  },

  async openPublic(token: string): Promise<GeneratedContract> {
    const response = await api.get<{ success: boolean; data: GeneratedContract }>(`/contracts/public/${token}`);
    return response.data.data;
  },

  async signPublic(
    token: string,
    data: { signerName: string; signerCpf: string; signerEmail?: string }
  ): Promise<ContractSignatureResult> {
    const response = await api.post<{ success: boolean; data: ContractSignatureResult }>(
      `/contracts/public/${token}/sign`,
      data
    );
    return response.data.data;
  },

  async rejectPublic(token: string, reason?: string): Promise<GeneratedContract> {
    const response = await api.post<{ success: boolean; data: GeneratedContract }>(
      `/contracts/public/${token}/reject`,
      { reason }
    );
    return response.data.data;
  },
};
