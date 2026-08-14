import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProfileReview: vi.fn(),
}));

vi.mock('../services/student-self.service', async () => {
  const actual = await vi.importActual<typeof import('../services/student-self.service')>(
    '../services/student-self.service'
  );
  return {
    ...actual,
    studentSelfService: {
      ...actual.studentSelfService,
      getProfileReview: mocks.getProfileReview,
    },
  };
});

import { StudentProfileReview } from './StudentProfileReview';

function renderPage(entry = '/student/profile-review') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <StudentProfileReview />
    </MemoryRouter>
  );
}

describe('StudentProfileReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consulta a revisão no vínculo selecionado e mantém o retorno contextual', async () => {
    mocks.getProfileReview.mockResolvedValue({
      id: 'review-1',
      alunoId: 'aluno-1',
      requestedAt: '2026-08-10T12:00:00.000Z',
      dueAt: '2026-08-20T12:00:00.000Z',
      status: 'pending',
    });

    renderPage('/student/profile-review?contractId=contract-1');

    expect(await screen.findByText('Revisão pendente')).toBeInTheDocument();
    expect(mocks.getProfileReview).toHaveBeenCalledWith('contract-1');
    expect(screen.getByRole('link', { name: 'Voltar para início' })).toHaveAttribute(
      'href',
      '/inicio?contractId=contract-1'
    );
    expect(screen.queryByRole('button', { name: /concluir|enviar/i })).not.toBeInTheDocument();
  });

  it('trata ausência de revisão sem CTA falso', async () => {
    mocks.getProfileReview.mockResolvedValue(null);

    renderPage();

    expect(await screen.findByText('Nenhuma revisão cadastral pendente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /concluir|enviar/i })).not.toBeInTheDocument();
  });

  it('orienta seleção de vínculo no erro de contexto obrigatório', async () => {
    mocks.getProfileReview.mockRejectedValue({ response: { status: 409 } });

    renderPage();

    expect(await screen.findByText('Selecione o vínculo para continuar')).toBeInTheDocument();
  });

  it('apresenta falha segura quando a revisão não pode ser carregada', async () => {
    mocks.getProfileReview.mockRejectedValue({ response: { status: 500 } });

    renderPage();

    expect(await screen.findByText('Não foi possível carregar a revisão')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
