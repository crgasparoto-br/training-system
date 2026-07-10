import api from './api';

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

export interface GeneratedContract {
  id: string;
  title: string;
  status: 'DRAFT' | 'GENERATED' | 'SENT' | 'VIEWED' | 'SIGNED' | 'CANCELLED' | 'EXPIRED';
  renderedHtml: string;
  pdfPath?: string | null;
  signedAt?: string | null;
  createdAt: string;
}

export interface AvailableStudentContract {
  id: string;
  title: string;
  status: 'DRAFT' | 'GENERATED' | 'SENT' | 'VIEWED' | 'SIGNED' | 'CANCELLED' | 'EXPIRED';
  alunoId: string;
  serviceId?: string | null;
  createdAt: string;
  signedAt?: string | null;
  cancelledAt?: string | null;
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

export const CONTRACT_VARIABLES = [
  'aluno.nome',
  'aluno.cpf',
  'aluno.rg',
  'aluno.enderecoCompleto',
  'responsavel.nome',
  'responsavel.cpf',
  'responsavel.email',
  'empresa.razaoSocial',
  'empresa.cnpj',
  'empresa.cref',
  'empresa.endereco',
  'professor.nome',
  'professor.cref',
  'servico.nome',
  'servico.valor',
  'servico.duracaoSessao',
  'servico.quantidadeSemanal',
  'contrato.valorMensal',
  'contrato.valorMensalExtenso',
  'contrato.diaVencimento',
  'contrato.horarios',
  'contrato.dataInicio',
  'contrato.dataAssinatura',
].map((key) => ({
  key,
  token: `{{${key}}}`,
}));

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

  async listVariables(): Promise<Array<{ key: string; token: string }>> {
    try {
      const response = await api.get<{ success: boolean; data: Array<{ key: string; token: string }> }>('/contracts/variables');
      return response.data.data?.length ? response.data.data : CONTRACT_VARIABLES;
    } catch (error) {
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
    return response.data.data;
  },

  async listAvailableForStudent(filters?: {
    alunoId?: string;
    serviceId?: string;
    onlyUnlinked?: boolean;
    status?: string[];
  }): Promise<AvailableStudentContract[]> {
    const params = new URLSearchParams();

    if (filters?.alunoId) {
      params.set('alunoId', filters.alunoId);
    }

    if (filters?.serviceId) {
      params.set('serviceId', filters.serviceId);
    }

    if (filters?.onlyUnlinked !== undefined) {
      params.set('onlyUnlinked', String(filters.onlyUnlinked));
    }

    if (filters?.status?.length) {
      params.set('status', filters.status.join(','));
    }

    const query = params.toString();
    const response = await api.get<{ success: boolean; data: AvailableStudentContract[] }>(
      query ? `/contracts/available-for-student?${query}` : '/contracts/available-for-student'
    );

    return response.data.data;
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

  async signPublic(token: string, data: { signerName: string; signerCpf: string; signerEmail?: string }): Promise<void> {
    await api.post(`/contracts/public/${token}/sign`, data);
  },
};
