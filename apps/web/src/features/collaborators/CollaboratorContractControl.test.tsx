import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollaboratorContractControl } from './CollaboratorContractControl';
import { collaboratorContractService } from '../../services/collaborator-contract.service';

vi.mock('../../access/access-control', () => ({ canAccessBlock: () => true }));
vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: () => ({ user: { professor: { id: 'manager-1' } } }),
}));
vi.mock('../../services/collaborator-contract.service', () => ({
  collaboratorContractService: {
    summary: vi.fn(), listTemplates: vi.fn(), getDocument: vi.fn(), downloadPdf: vi.fn(),
    preview: vi.fn(), generate: vi.fn(), generatePdf: vi.fn(), sendForSignature: vi.fn(),
    activate: vi.fn(), cancel: vi.fn(),
  },
}));

const current = {
  id: 'link-1', collaboratorId: 'collaborator-1', contractId: 'document-1',
  status: 'active' as const, origin: 'ELECTRONIC' as const,
  createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z',
  documentTitle: 'Contrato eletrônico vigente', documentStatus: 'SIGNED' as const,
  renderedHtml: '<p>Conteúdo persistido</p>', pdfPath: '/storage/contracts/document-1.pdf',
};

const candidate = {
  id: 'link-2', collaboratorId: 'collaborator-1', contractId: 'document-2',
  status: 'pending_signature' as const, origin: 'ELECTRONIC' as const,
  createdAt: '2026-07-21T10:00:00.000Z', updatedAt: '2026-07-21T10:00:00.000Z',
  documentTitle: 'Contrato candidato', documentStatus: 'SENT' as const,
};

const legacy = {
  id: 'legacy-1', collaboratorId: 'collaborator-1', contractId: null,
  status: 'legacy' as const, origin: 'LEGACY_DECLARATION' as const,
  createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
};

describe('CollaboratorContractControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collaboratorContractService.summary).mockResolvedValue({
      current,
      candidates: [candidate],
      history: [legacy],
      all: [current, candidate, legacy],
    });
    vi.mocked(collaboratorContractService.listTemplates).mockResolvedValue([]);
    vi.mocked(collaboratorContractService.getDocument).mockResolvedValue({
      ...current, renderedHtml: '<p>Documento persistido verificado</p>',
    });
  });

  it('consulta o documento persistido em modo somente leitura', async () => {
    render(<CollaboratorContractControl collaboratorId="collaborator-1" />);
    const consultButtons = await screen.findAllByRole('button', { name: /consultar/i });
    fireEvent.click(consultButtons[0]);
    await waitFor(() => expect(collaboratorContractService.getDocument).toHaveBeenCalledWith(
      'collaborator-1', 'document-1'
    ));
    expect(screen.getByTitle('Documento persistido do contrato do colaborador'))
      .toHaveAttribute('sandbox', '');
  });

  it('distingue declaração legada sem documento eletrônico verificável', async () => {
    render(<CollaboratorContractControl collaboratorId="collaborator-1" />);
    fireEvent.click(await screen.findByText('Histórico (1)'));
    expect(await screen.findByText(
      'Contrato informado no cadastro, sem documento eletrônico verificável.'
    )).toBeInTheDocument();
  });

  it('mostra vigente, candidato e histórico sem ações de escrita no modo de consulta', async () => {
    render(<CollaboratorContractControl collaboratorId="collaborator-1" readOnly />);

    expect(await screen.findByText('Contrato eletrônico vigente')).toBeInTheDocument();
    expect(screen.getByText('Contrato candidato')).toBeInTheDocument();
    expect(screen.getByText('Histórico (1)')).toBeInTheDocument();
    expect(collaboratorContractService.listTemplates).not.toHaveBeenCalled();
    expect(screen.queryByText('Preparar novo contrato')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /colocar em vigor/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /consultar/i })).toHaveLength(2);
  });
});
