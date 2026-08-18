import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { professorManualService, type ProfessorManualItem } from '../../services/professor-manual.service';
import SettingsProfessorManual from './ProfessorManual';

vi.mock('../../services/professor-manual.service', () => ({
  professorManualService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const manualItem: ProfessorManualItem = {
  id: 'manual-1',
  contractId: 'contract-1',
  code: 'VESTIMENTA_PADRAO',
  title: 'Vestimenta no atendimento',
  content: 'Use o uniforme definido para o atendimento.',
  format: 'dica_rapida',
  context: 'avaliacao_fisica',
  servicoContratado: 'Todos',
  setor: 'Todos',
  item: 'Vestimenta',
  frase: 'Estar sempre uniformizado durante o atendimento.',
  productArea: 'physical_assessment',
  productMoment: 'antes da avaliação',
  linkLabel: 'Abrir manual',
  linkHref: '/settings/professor-manual',
  order: 1,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function fillRequiredCreateFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /^Item/ }), 'Postura');
  await user.type(screen.getByLabelText(/Frase/), 'Oriente a postura.');
  await user.type(screen.getByLabelText(/Título no sistema/), 'Postura durante a avaliação');
  await user.type(screen.getByLabelText(/Texto de apoio/), 'Ajuste a postura antes de iniciar.');
  await user.type(screen.getByLabelText(/Código/), 'POSTURA');
  await user.type(screen.getByLabelText(/Ponto do produto/), 'physical_assessment');
}

describe('SettingsProfessorManual', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(professorManualService.list).mockResolvedValue([manualItem]);
    vi.mocked(professorManualService.create).mockResolvedValue(manualItem);
    vi.mocked(professorManualService.update).mockResolvedValue(manualItem);
    vi.mocked(professorManualService.remove).mockResolvedValue(undefined);
  });

  it('abre priorizando a lista e substitui a listagem pelo editor ao criar', async () => {
    const user = userEvent.setup();
    render(<SettingsProfessorManual />);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Novo item do manual' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Novo item' }));

    expect(screen.getByRole('heading', { name: 'Novo item do manual' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Código/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ponto do produto/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configurações avançadas' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('cria item com os campos obrigatórios e retorna para a lista', async () => {
    const user = userEvent.setup();
    render(<SettingsProfessorManual />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Novo item' }));
    await fillRequiredCreateFields(user);
    await user.click(screen.getByRole('button', { name: 'Salvar item' }));

    await waitFor(() => expect(professorManualService.create).toHaveBeenCalledTimes(1));
    expect(professorManualService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        setor: 'Todos',
        item: 'Postura',
        frase: 'Oriente a postura.',
        title: 'Postura durante a avaliação',
        content: 'Ajuste a postura antes de iniciar.',
        code: 'POSTURA',
        productArea: 'physical_assessment',
      })
    );
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('edita item, persiste as alterações e retorna para a lista', async () => {
    const user = userEvent.setup();
    render(<SettingsProfessorManual />);

    await screen.findByRole('table');
    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    const title = screen.getByLabelText(/Título no sistema/);
    await user.clear(title);
    await user.type(title, 'Vestimenta revisada');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(professorManualService.update).toHaveBeenCalledTimes(1));
    expect(professorManualService.update).toHaveBeenCalledWith(
      'manual-1',
      expect.objectContaining({ title: 'Vestimenta revisada' })
    );
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('cancela edição sem persistir alterações e retorna para a lista', async () => {
    const user = userEvent.setup();
    render(<SettingsProfessorManual />);

    await screen.findByRole('table');
    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    expect(screen.getByRole('heading', { name: 'Editar item do manual' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Título no sistema/));
    await user.type(screen.getByLabelText(/Título no sistema/), 'Título não salvo');
    await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(professorManualService.update).not.toHaveBeenCalled();
  });

  it('mostra erros próximos aos campos e foca o primeiro inválido na ordem visual', async () => {
    const user = userEvent.setup();
    render(<SettingsProfessorManual />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Novo item' }));
    const setor = screen.getByLabelText(/Setor/);
    await user.clear(setor);

    await user.click(screen.getByRole('button', { name: 'Salvar item' }));

    expect(screen.getByText('Informe o setor.')).toBeInTheDocument();
    expect(screen.getByText('Informe o item.')).toBeInTheDocument();
    expect(screen.getByText('Informe o código.')).toBeInTheDocument();
    expect(screen.getByText('Informe o ponto do produto.')).toBeInTheDocument();
    expect(setor).toHaveFocus();
    expect(professorManualService.create).not.toHaveBeenCalled();
  });

  it('mantém filtros de contexto, formato, status e busca textual funcionais', async () => {
    const user = userEvent.setup();
    render(<SettingsProfessorManual />);

    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText('Contexto'), 'montagem_treino');
    expect(await screen.findByText('Nenhum resultado com estes filtros')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Contexto'), 'avaliacao_fisica');
    expect(await screen.findByRole('table')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Formato'), 'alerta');
    expect(await screen.findByText('Nenhum resultado com estes filtros')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Formato'), 'dica_rapida');
    expect(await screen.findByRole('table')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'inactive');
    expect(await screen.findByText('Nenhum resultado com estes filtros')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Status'), 'active');
    expect(await screen.findByRole('table')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar'), 'uniformizado');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Buscar'));
    await user.type(screen.getByLabelText('Buscar'), 'inexistente');
    expect(await screen.findByText('Nenhum resultado com estes filtros')).toBeInTheDocument();
  });

  it('distingue base vazia de filtro sem resultado', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsProfessorManual />);

    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText('Status'), 'inactive');
    expect(await screen.findByText('Nenhum resultado com estes filtros')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument();

    unmount();
    vi.mocked(professorManualService.list).mockResolvedValue([]);
    render(<SettingsProfessorManual />);

    expect(await screen.findByText('Nenhum item cadastrado')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Novo item' }).length).toBeGreaterThan(0);
  });

  it('não chama exclusão ao cancelar a confirmação e remove somente após confirmar', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SettingsProfessorManual />);

    await screen.findByRole('table');
    await user.click(screen.getAllByRole('button', { name: 'Excluir' })[0]);
    expect(professorManualService.remove).not.toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Vestimenta'));

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getAllByRole('button', { name: 'Excluir' })[0]);
    await waitFor(() => expect(professorManualService.remove).toHaveBeenCalledTimes(1));
    expect(professorManualService.remove).toHaveBeenCalledWith('manual-1');
  });

  it('preserva o formulário quando a API falha ao salvar', async () => {
    const user = userEvent.setup();
    vi.mocked(professorManualService.create).mockRejectedValue(new Error('falha ao salvar'));
    render(<SettingsProfessorManual />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Novo item' }));
    await fillRequiredCreateFields(user);
    await user.click(screen.getByRole('button', { name: 'Salvar item' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('falha ao salvar');
    expect(screen.getByLabelText(/Título no sistema/)).toHaveValue('Postura durante a avaliação');
    expect(screen.getByRole('heading', { name: 'Novo item do manual' })).toBeInTheDocument();
  });
});
