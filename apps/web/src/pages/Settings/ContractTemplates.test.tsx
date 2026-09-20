import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Aluno } from '../../services/aluno.service';
import SettingsContractTemplates from './ContractTemplates';

const listTemplatesMock = vi.fn();
const listVariablesMock = vi.fn();
const previewMock = vi.fn();
const loadActiveStudentsMock = vi.fn();
const listProfessorsMock = vi.fn();
const collaboratorPreviewMock = vi.fn();
const scrollIntoViewMock = vi.fn();

vi.mock('../../services/contract.service', () => ({
  contractService: {
    listTemplates: (...args: unknown[]) => listTemplatesMock(...args),
    listVariables: (...args: unknown[]) => listVariablesMock(...args),
    preview: (...args: unknown[]) => previewMock(...args),
    updateTemplate: vi.fn(),
    createTemplate: vi.fn(),
    duplicateTemplate: vi.fn(),
  },
}));

vi.mock('../../services/collaborator-contract.service', () => ({
  collaboratorContractService: {
    preview: (...args: unknown[]) => collaboratorPreviewMock(...args),
  },
}));

vi.mock('../../services/professor.service', () => ({
  professorService: {
    list: (...args: unknown[]) => listProfessorsMock(...args),
  },
}));

vi.mock('./contractPreviewStudents', () => ({
  loadActiveStudentsForContractPreview: (...args: unknown[]) => loadActiveStudentsMock(...args),
}));

const template = {
  id: 'template-1',
  name: 'Contrato ACESSO',
  description: 'Modelo de teste',
  version: 1,
  status: 'ACTIVE' as const,
  applicability: 'STUDENT' as const,
  headerHtml: '<p>{{empresa.razaoSocial}}</p>',
  footerHtml: '<p>{{contrato.dataAssinatura}}</p>',
  clauses: [
    {
      id: 'clause-1',
      order: 1,
      title: 'Objeto',
      bodyHtml: '<p>{{aluno.nome}}</p>',
      required: true,
      editable: true,
    },
  ],
};

function student(id: string, name: string): Aluno {
  return {
    id,
    userId: `user-${id}`,
    professorId: 'professor-1',
    schedulePlan: 'free',
    age: 30,
    user: {
      email: `${id}@example.com`,
      profile: { name },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('SettingsContractTemplates preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });

    listTemplatesMock.mockResolvedValue([template]);
    listVariablesMock.mockResolvedValue([]);
    loadActiveStudentsMock.mockResolvedValue([
      student('student-1', 'Aluno Um'),
      student('student-2', 'Aluno Dois'),
    ]);
    listProfessorsMock.mockResolvedValue([]);
    collaboratorPreviewMock.mockResolvedValue({ html: '<p>Colaborador</p>', context: {} });
  });

  async function openPreview(user: ReturnType<typeof userEvent.setup>) {
    render(<SettingsContractTemplates />);
    await user.click(await screen.findByRole('button', { name: 'Prévia' }));
    await waitFor(() => expect(screen.getByLabelText('Aluno')).toHaveValue('student-1'));
  }

  it('fecha o modal e leva o foco para a prévia gerada com sucesso', async () => {
    const user = userEvent.setup();
    previewMock.mockResolvedValue({
      html: '<p>Contrato preenchido</p>',
      context: {},
    });

    await openPreview(user);
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));

    expect(await screen.findByTitle('Prévia do contrato')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const resultRegion = screen.getByRole('region', { name: 'Prévia' });
    await waitFor(() => expect(resultRegion).toHaveFocus());
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(previewMock).toHaveBeenCalledWith({
      templateId: 'template-1',
      alunoId: 'student-1',
    });
  });

  it('mantém o modal aberto e mostra o erro da API no contexto da ação', async () => {
    const user = userEvent.setup();
    previewMock.mockRejectedValueOnce({
      response: { data: { error: 'Há variáveis obrigatórias sem valor.' } },
    });

    await openPreview(user);
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Há variáveis obrigatórias sem valor.'
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Aluno'), 'student-2');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
