from pathlib import Path

ROOT = Path.cwd()

path = ROOT / "apps/web/src/features/collaborators/CollaboratorContractControl.test.tsx"
path.write_text('''import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  documentTitle: 'Contrato do colaborador', documentStatus: 'SIGNED' as const,
  renderedHtml: '<p>Conteúdo persistido</p>', pdfPath: '/storage/contracts/document-1.pdf',
};

describe('CollaboratorContractControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collaboratorContractService.summary).mockResolvedValue({
      current, candidates: [],
      history: [{
        id: 'legacy-1', collaboratorId: 'collaborator-1', contractId: null,
        status: 'legacy', origin: 'LEGACY_DECLARATION',
        createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
      }],
      all: [current],
    });
    vi.mocked(collaboratorContractService.listTemplates).mockResolvedValue([]);
    vi.mocked(collaboratorContractService.getDocument).mockResolvedValue({
      ...current, renderedHtml: '<p>Documento persistido verificado</p>',
    });
  });

  it('consulta o documento persistido em modo somente leitura', async () => {
    render(<CollaboratorContractControl collaboratorId="collaborator-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /consultar/i }));
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
});
''')

path = ROOT / "docs/CONTRATOS.md"
text = path.read_text().replace(
    "`Educator.currentCollaboratorContractId`",
    "`Professor.currentCollaboratorContractId`",
)
text = text.replace(
    "- `POST /api/v1/contracts/collaborators/:collaboratorId/documents/:documentId/pdf`;",
    "- `GET /api/v1/contracts/collaborators/:collaboratorId/documents/:documentId`;\n"
    "- `GET /api/v1/contracts/collaborators/:collaboratorId/documents/:documentId/pdf`;\n"
    "- `POST /api/v1/contracts/collaborators/:collaboratorId/documents/:documentId/pdf`;",
)
append = """
## Consulta de documentos persistidos

Na edição do colaborador, a ação **Consultar** abre o HTML persistido do documento em modo somente leitura. Quando o PDF já foi gerado, **Abrir PDF** usa uma rota autenticada que valida tenant, escopo do colaborador e vínculo do documento antes de retornar o arquivo. Caminhos locais de storage não são expostos diretamente ao navegador.

Recusas aparecem explicitamente como **Recusado**, com data e motivo quando informado. Cancelamento administrativo e recusa da parte contratante permanecem distinguíveis no histórico.

## Rollback da implantação da generalização

A migration é aditiva e preserva os campos legados durante a transição. Em caso de rollback da aplicação:

1. interrompa novas gerações para colaboradores;
2. reverta primeiro a aplicação para a versão anterior, mantendo as tabelas e colunas novas no banco;
3. não remova `CollaboratorContract`, `partyType`, `collaboratorId`, snapshots, hashes, auditorias ou tokens enquanto existir documento criado pela versão nova;
4. restaure a aplicação corrigida e execute novamente `prisma migrate deploy`;
5. somente uma migration posterior, revisada e explicitamente destrutiva, poderá remover estruturas novas após exportação e confirmação de que não existem documentos eletrônicos dependentes.

Não existe rollback automático destrutivo. Essa estratégia mantém compatibilidade de leitura e evita perda de histórico durante uma reversão emergencial.
"""
if "## Rollback da implantação da generalização" not in text:
    text += append
path.write_text(text)
