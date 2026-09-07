import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProfileReview: vi.fn(),
  getProfile: vi.fn(),
  completeProfileReview: vi.fn(),
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
      getProfile: mocks.getProfile,
      completeProfileReview: mocks.completeProfileReview,
    },
  };
});

import { StudentProfileReview } from './StudentProfileReview';

const pendingReview = {
  id: 'review-1',
  alunoId: 'aluno-1',
  requestedAt: '2026-08-10T12:00:00.000Z',
  dueAt: '2026-08-20T12:00:00.000Z',
  status: 'pending',
  sectionsRequested: ['personal', 'contact'],
};

const profile = {
  id: 'aluno-1',
  email: 'aluno@example.com',
  profile: {
    name: 'Aluno Teste',
    phone: '11999999999',
    birthDate: '1990-01-01T00:00:00.000Z',
    gender: 'male' as const,
    maritalStatus: 'single' as const,
    instagramHandle: '@aluno',
  },
  physical: {
    age: 36,
    weight: 78,
    height: 178,
  },
  intakeForm: {
    mainGoal: 'Condicionamento',
  },
};

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
    mocks.getProfileReview.mockResolvedValue(pendingReview);
    mocks.getProfile.mockResolvedValue(profile);
  });

  it('carrega a revisão e os dados atuais no vínculo selecionado', async () => {
    renderPage('/student/profile-review?contractId=contract-1');

    expect(await screen.findByText('Revisão pendente')).toBeInTheDocument();
    expect(mocks.getProfileReview).toHaveBeenCalledWith('contract-1');
    expect(mocks.getProfile).toHaveBeenCalledWith('contract-1');
    expect(screen.getByLabelText('Nome')).toHaveValue('Aluno Teste');
    expect(screen.getByLabelText('Telefone')).toHaveValue('11999999999');
    expect(screen.queryByText('Endereço')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para início' })).toHaveAttribute(
      'href',
      '/inicio?contractId=contract-1'
    );
  });

  it('conclui sem alterações somente após confirmação da API', async () => {
    const user = userEvent.setup();
    mocks.completeProfileReview.mockResolvedValue({
      id: 'review-1',
      status: 'completed_no_changes',
      approval: { requiresApproval: false, hasPendingApproval: false },
    });

    renderPage('/student/profile-review?contractId=contract-1');
    await user.click(await screen.findByRole('button', { name: 'Concluir sem alterações' }));

    expect(mocks.completeProfileReview).toHaveBeenCalledWith(
      'review-1',
      { noChanges: true },
      'contract-1'
    );
    expect(await screen.findByText('Revisão concluída')).toBeInTheDocument();
    expect(screen.getByText('Sua revisão cadastral foi concluída com sucesso.')).toBeInTheDocument();
  });

  it('envia apenas a alteração feita e mostra sucesso direto conforme resposta da API', async () => {
    const user = userEvent.setup();
    mocks.completeProfileReview.mockResolvedValue({
      id: 'review-1',
      status: 'completed_with_changes',
      approval: { requiresApproval: false, hasPendingApproval: false },
    });

    renderPage();
    const phone = await screen.findByLabelText('Telefone');
    await user.clear(phone);
    await user.type(phone, '11988887777');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações e concluir' }));

    expect(mocks.completeProfileReview).toHaveBeenCalledWith(
      'review-1',
      { changes: { profile: { phone: '11988887777' } } },
      undefined
    );
    expect(await screen.findByText('Sua revisão cadastral foi concluída com sucesso.')).toBeInTheDocument();
  });

  it('informa análise posterior somente quando o backend confirma pendência', async () => {
    const user = userEvent.setup();
    mocks.completeProfileReview.mockResolvedValue({
      id: 'review-1',
      status: 'completed_with_changes',
      approval: { requiresApproval: true, hasPendingApproval: true },
    });

    renderPage();
    const birthDate = await screen.findByLabelText('Data de nascimento');
    await user.clear(birthDate);
    await user.type(birthDate, '1991-02-03');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações e concluir' }));

    expect(mocks.completeProfileReview).toHaveBeenCalledWith(
      'review-1',
      { changes: { profile: { birthDate: '1991-02-03' } } },
      undefined
    );
    expect(
      await screen.findByText(
        'Recebemos suas alterações. Alguns dados serão analisados pelo profissional antes de serem atualizados.'
      )
    ).toBeInTheDocument();
  });

  it('não mostra sucesso falso quando o envio falha e a revisão continua pendente', async () => {
    const user = userEvent.setup();
    mocks.completeProfileReview.mockRejectedValue({
      response: { status: 500, data: { message: 'Falha temporária' } },
    });
    mocks.getProfileReview
      .mockResolvedValueOnce(pendingReview)
      .mockResolvedValueOnce(pendingReview);

    renderPage();
    const phone = await screen.findByLabelText('Telefone');
    await user.clear(phone);
    await user.type(phone, '11977776666');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações e concluir' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha temporária');
    expect(screen.queryByText('Revisão concluída')).not.toBeInTheDocument();
    expect(mocks.getProfileReview).toHaveBeenCalledTimes(2);
  });

  it('trata reenvio concorrente como revisão não mais disponível sem presumir sucesso', async () => {
    const user = userEvent.setup();
    mocks.completeProfileReview.mockRejectedValue({ response: { status: 400 } });
    mocks.getProfileReview.mockResolvedValueOnce(pendingReview).mockResolvedValueOnce(null);

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Concluir sem alterações' }));

    expect(await screen.findByText('Esta revisão não está mais disponível')).toBeInTheDocument();
    expect(screen.queryByText('Revisão concluída')).not.toBeInTheDocument();
  });

  it('trata ausência de revisão sem CTA falso', async () => {
    mocks.getProfileReview.mockResolvedValue(null);

    renderPage();

    expect(await screen.findByText('Nenhuma revisão cadastral pendente')).toBeInTheDocument();
    expect(mocks.getProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /concluir|enviar/i })).not.toBeInTheDocument();
  });

  it('orienta seleção de vínculo no erro de contexto obrigatório', async () => {
    mocks.getProfileReview.mockRejectedValue({ response: { status: 409 } });

    renderPage();

    expect(await screen.findByText('Selecione o vínculo para continuar')).toBeInTheDocument();
  });

  it('apresenta falha segura quando os dados necessários não podem ser carregados', async () => {
    mocks.getProfile.mockRejectedValue({ response: { status: 500 } });

    renderPage();

    expect(await screen.findByText('Não foi possível carregar a revisão')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
