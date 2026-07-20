import api from './api';

export type ContractTemplateApplicability = 'STUDENT' | 'COLLABORATOR' | 'BOTH';

export interface CollaboratorContractTemplate {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  applicability: ContractTemplateApplicability;
}

export interface CollaboratorContractRecord {
  id: string;
  collaboratorId: string;
  contractId: string | null;
  status: 'draft' | 'pending_signature' | 'active' | 'expired' | 'canceled' | 'terminated' | 'legacy';
  origin: 'ELECTRONIC' | 'LEGACY_PDF' | 'LEGACY_DECLARATION';
  startDate?: string | null;
  endDate?: string | null;
  signedAt?: string | null;
  canceledAt?: string | null;
  cancellationReason?: string | null;
  notes?: string | null;
  legacyDocumentUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  documentTitle?: string | null;
  documentStatus?: 'GENERATED' | 'SENT' | 'VIEWED' | 'SIGNED' | 'CANCELLED' | 'EXPIRED' | null;
  renderedHtml?: string | null;
  pdfPath?: string | null;
  publicTokenExpiresAt?: string | null;
  documentCreatedAt?: string | null;
}

export interface CollaboratorContractSummary {
  current: CollaboratorContractRecord | null;
  candidates: CollaboratorContractRecord[];
  history: CollaboratorContractRecord[];
  all: CollaboratorContractRecord[];
}

export interface CollaboratorContractDraftInput {
  templateId: string;
  valorMensal?: number;
  diaVencimento?: number;
  horarios?: string;
  dataInicio?: string;
  dataAssinatura?: string;
  notes?: string;
}

const unwrap = <T>(response: { data: { data: T } }) => response.data.data;

export const collaboratorContractService = {
  async listTemplates(): Promise<CollaboratorContractTemplate[]> {
    const response = await api.get<{ success: boolean; data: CollaboratorContractTemplate[] }>(
      '/contracts/templates?partyType=COLLABORATOR'
    );
    return response.data.data.filter((template) => template.status === 'ACTIVE');
  },

  async summary(collaboratorId: string): Promise<CollaboratorContractSummary> {
    const response = await api.get<{ success: boolean; data: CollaboratorContractSummary }>(
      `/contracts/collaborators/${collaboratorId}/summary`
    );
    return response.data.data;
  },

  async preview(collaboratorId: string, input: CollaboratorContractDraftInput) {
    const response = await api.post<{
      success: boolean;
      data: { html: string; context: Record<string, unknown> };
    }>(`/contracts/collaborators/${collaboratorId}/preview`, input);
    return response.data.data;
  },

  async generate(collaboratorId: string, input: CollaboratorContractDraftInput) {
    const response = await api.post<{
      success: boolean;
      data: { id: string; linkId: string; title: string; status: string };
    }>(`/contracts/collaborators/${collaboratorId}/generate`, input);
    return response.data.data;
  },

  async generatePdf(collaboratorId: string, documentId: string) {
    const response = await api.post<{ success: boolean; data: CollaboratorContractRecord }>(
      `/contracts/collaborators/${collaboratorId}/documents/${documentId}/pdf`
    );
    return response.data.data;
  },

  async sendForSignature(collaboratorId: string, documentId: string) {
    const response = await api.post<{
      success: boolean;
      data: { contract: CollaboratorContractRecord; token: string };
    }>(`/contracts/collaborators/${collaboratorId}/documents/${documentId}/send`);
    return response.data.data;
  },

  async cancel(collaboratorId: string, documentId: string, reason?: string) {
    const response = await api.post<{ success: boolean; data: CollaboratorContractRecord }>(
      `/contracts/collaborators/${collaboratorId}/documents/${documentId}/cancel`,
      { reason }
    );
    return response.data.data;
  },

  async activate(collaboratorId: string, linkId: string) {
    const response = await api.post<{ success: boolean; data: unknown }>(
      `/contracts/collaborators/${collaboratorId}/links/${linkId}/activate`
    );
    return unwrap(response);
  },
};
