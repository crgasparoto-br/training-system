import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfessorSummary } from '@corrida/types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  listFunctions: vi.fn(),
  contractSummary: vi.fn(),
  listTemplates: vi.fn(),
  canEdit: false,
  canAccessAdministrativeBlock: false,
  dataScope: 'self' as 'self' | 'managed' | 'contract',
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ id: 'professor-1' }) };
});

vi.mock('../services/professor.service', () => ({
  professorService: {
    get: (...args: unknown[]) => mocks.get(...args),
    validateLegalFinancial: vi.fn(),
    resetPassword: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
  },
}));

vi.mock('../services/collaborator-function.service', () => ({
  collaboratorFunctionService: { list: (...args: unknown[]) => mocks.listFunctions(...args) },
}));

vi.mock('../services/collaborator-contract.service', () => ({
  collaboratorContractService: {
    summary: (...args: unknown[]) => mocks.contractSummary(...args),
    listTemplates: (...args: unknown[]) => mocks.listTemplates(...args),
    getDocument: vi.fn(),
    downloadPdf: vi.fn(),
    preview: vi.fn(),
    generate: vi.fn(),
    generatePdf: vi.fn(),
    sendForSignature: vi.fn(),
    activate: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: () => ({ user: { professor: { id: 'viewer' } } }),
}));
vi.mock('../access/access-control', () => ({
  canAccessScreen: () => mocks.canEdit,
  canAccessBlock: () => mocks.canAccessAdministrativeBlock,
  getDataScopeForScreen: () => mocks.dataScope,
}));

import { CollaboratorDetails } from './CollaboratorDetails';

const collaborator = {
  id: 'professor-1',
  role: 'professor',
  collaboratorFunction: { id: 'function-1', name: 'Professor', code: 'professor', isActive: true },
  responsibleManager: null,
  operationalRoleIds: ['function-1'],
  hourlyRates: null,
  hasSignedContract: false,
  signedContractDocumentUrl: null,
  user: {
    id: 'user-1',
    email: 'teste@example.com',
    isActive: true,
    profile: { name: 'Colaborador Teste', companyDocument: '12.345.678/0001-90' },
  },
  contract: { id: 'contract-1', type: 'academy', document: '123' },
  createdAt: '2026-01-01T00:00:00.000Z',
} as ProfessorSummary;

const currentContract = {
  id: 'link-current',
  collaboratorId: 'professor-1',
  contractId: 'document-current',
  status: 'active' as const,
  origin: 'ELECTRONIC' as const,
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T10:00:00.000Z',
  documentTitle: 'Contrato eletrônico vigente',
  documentStatus: 'SIGNED' as const,
  pdfPath: '/storage/contracts/document-current.pdf',
};

const candidateContract = {
  id: 'link-candidate',
  collaboratorId: 'professor-1',
  contractId: 'document-candidate',
  status: 'pending_signature' as const,
  origin: 'ELECTRONIC' as const,
  createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
  documentTitle: 'Contrato candidato futuro',
  documentStatus: 'SENT' as const,
};

const legacyContract = {
  id: 'link-legacy',
  collaboratorId: 'professor-1',
  contractId: null,
  status: 'legacy' as const,
  origin: 'LEGACY_DECLARATION' as const,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const administrativeActionNames = [
  /validar dados financeiros/i,
  /redefinir senha/i,
  /reativar/i,
  /desativar/i,
];

describe('CollaboratorDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canEdit = false;
    mocks.canAccessAdministrativeBlock = false;
    mocks.dataScope = 'self';
    mocks.get.mockResolvedValue(collaborator);
    mocks.listFunctions.mockResolvedValue([
      { id: 'function-1', name: 'Professor', code: 'professor', isActive: true },
    ]);
    mocks.contractSummary.mockResolvedValue({
      current: currentContract,
      candidates: [candidateContract],
      history: [legacyContract],
      all: [currentContract, candidateContract, legacyContract],
    });
    mocks.listTemplates.mockResolvedValue([]);
  });

  it('carrega o registro individual e renderiza a consulta em modo estritamente somente leitura', async () => {
    render(<MemoryRouter><CollaboratorDetails /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Colaborador Teste' })).toBeInTheDocument();
    expect(await screen.findByText('Contrato eletrônico vigente')).toBeInTheDocument();
    expect(screen.getByText('Contrato candidato futuro')).toBeInTheDocument();
    expect(screen.getByText('Histórico (1)')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('professor-1');
    expect(mocks.contractSummary).toHaveBeenCalledWith('professor-1');
    expect(mocks.listTemplates).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Editar colaborador')).not.toBeInTheDocument();
    expect(screen.queryByText('Contrato pendente')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Contrato legado' })).not.toBeInTheDocument();
    expect(screen.queryByText('Preparar novo contrato')).not.toBeInTheDocument();
  });

  it('não expõe mutações nem com escopo de contrato e blocos administrativos habilitados', async () => {
    mocks.canEdit = true;
    mocks.canAccessAdministrativeBlock = true;
    mocks.dataScope = 'contract';

    render(<MemoryRouter><CollaboratorDetails /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Colaborador Teste' })).toBeInTheDocument();
    expect(await screen.findByText('Contrato eletrônico vigente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /editar colaborador/i })).toBeInTheDocument();
    expect(screen.queryByText('Preparar novo contrato')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
    for (const actionName of administrativeActionNames) {
      expect(screen.queryByRole('button', { name: actionName })).not.toBeInTheDocument();
    }
  });

  it('mostra resposta uniforme para id inexistente ou fora do escopo', async () => {
    mocks.get.mockRejectedValue(new Error('Not found'));
    render(<MemoryRouter><CollaboratorDetails /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Colaborador não encontrado')).toBeInTheDocument());
    expect(screen.getByText(/não existe ou não está disponível/i)).toBeInTheDocument();
    expect(mocks.contractSummary).not.toHaveBeenCalled();
  });
});
