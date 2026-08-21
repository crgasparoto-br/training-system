import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { periodizationService, type TrainingParameter } from '../../services/periodization.service';
import SettingsParameters from './Parameters';

vi.mock('../../services/periodization.service', () => ({
  periodizationService: {
    getAllParameters: vi.fn(),
    createParameter: vi.fn(),
    updateParameter: vi.fn(),
    deleteParameter: vi.fn(),
    renameParameterCategory: vi.fn(),
  },
}));

const parameter: TrainingParameter = {
  id: 'parameter-1',
  category: 'objetivo',
  code: 'ADP',
  description: 'Adaptação',
  order: 1,
  active: true,
};

const mockRefreshFailureAfterInitialLoad = () => {
  vi.mocked(periodizationService.getAllParameters)
    .mockResolvedValueOnce([parameter])
    .mockRejectedValueOnce(new Error('refresh indisponível'));
};

describe('SettingsParameters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(periodizationService.getAllParameters).mockResolvedValue([parameter]);
    vi.mocked(periodizationService.createParameter).mockResolvedValue(parameter);
    vi.mocked(periodizationService.updateParameter).mockResolvedValue(parameter);
    vi.mocked(periodizationService.deleteParameter).mockResolvedValue(undefined);
    vi.mocked(periodizationService.renameParameterCategory).mockResolvedValue({ updated: 1 });
  });

  it('inicia na lista, mantém categorias recolhidas e substitui a tabela pelo editor', async () => {
    const user = userEvent.setup();
    render(<SettingsParameters />);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerenciar categorias' })).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('button', { name: 'Novo parâmetro' }));

    expect(screen.getByRole('heading', { name: 'Novo parâmetro' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Categoria/)).toHaveFocus();
    expect(screen.getByText('Novos parâmetros são criados como ativos.')).toBeInTheDocument();
  });

  it('mostra erros por campo e foca a primeira informação obrigatória inválida', async () => {
    const user = userEvent.setup();
    render(<SettingsParameters />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Novo parâmetro' }));
    await user.click(screen.getByRole('button', { name: 'Salvar parâmetro' }));

    expect(screen.getByText('Informe a categoria.')).toBeInTheDocument();
    expect(screen.getByText('Informe o código.')).toBeInTheDocument();
    expect(screen.getByText('Informe a descrição.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Categoria/)).toHaveFocus();
    expect(periodizationService.createParameter).not.toHaveBeenCalled();
  });

  it('cria parâmetro, retorna para a lista e anuncia sucesso', async () => {
    const user = userEvent.setup();
    render(<SettingsParameters />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Novo parâmetro' }));
    await user.selectOptions(screen.getByLabelText(/Categoria/), 'objetivo');
    await user.type(screen.getByLabelText(/Código/), 'for');
    await user.type(screen.getByLabelText(/Descrição/), 'Força');
    await user.click(screen.getByRole('button', { name: 'Salvar parâmetro' }));

    await waitFor(() => expect(periodizationService.createParameter).toHaveBeenCalledTimes(1));
    expect(periodizationService.createParameter).toHaveBeenCalledWith({
      category: 'objetivo',
      code: 'FOR',
      description: 'Força',
      order: 1,
    });
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Parâmetro criado com sucesso.');
  });

  it('edita somente campos permitidos e permite cancelar sem persistir', async () => {
    const user = userEvent.setup();
    render(<SettingsParameters />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getByLabelText(/Categoria/)).toBeDisabled();
    expect(screen.getByLabelText(/Código/)).toBeDisabled();
    expect(screen.getByLabelText(/Descrição/)).toHaveFocus();

    await user.clear(screen.getByLabelText(/Descrição/));
    await user.type(screen.getByLabelText(/Descrição/), 'Alteração não salva');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(periodizationService.updateParameter).not.toHaveBeenCalled();
  });

  it('salva edição e anuncia sucesso sem alterar categoria ou código', async () => {
    const user = userEvent.setup();
    render(<SettingsParameters />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.clear(screen.getByLabelText(/Descrição/));
    await user.type(screen.getByLabelText(/Descrição/), 'Adaptação revisada');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(periodizationService.updateParameter).toHaveBeenCalledTimes(1));
    expect(periodizationService.updateParameter).toHaveBeenCalledWith('parameter-1', {
      description: 'Adaptação revisada',
      order: 1,
      active: true,
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Parâmetro atualizado com sucesso.');
  });

  it('não exclui antes da confirmação e anuncia a exclusão confirmada', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SettingsParameters />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(periodizationService.deleteParameter).not.toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('ADP — Adaptação'));

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(periodizationService.deleteParameter).toHaveBeenCalledWith('parameter-1'));
    expect(await screen.findByRole('status')).toHaveTextContent('Parâmetro ADP excluído com sucesso.');
  });

  it('mantém renomeação de categoria como ação avançada com confirmação', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SettingsParameters />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Gerenciar categorias' }));
    await user.selectOptions(screen.getByLabelText('Categoria atual'), 'objetivo');
    await user.type(screen.getByLabelText('Nova categoria'), 'objetivo_principal');
    await user.click(screen.getByRole('button', { name: 'Renomear categoria' }));

    expect(periodizationService.renameParameterCategory).not.toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Todos os parâmetros dessa categoria'));

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Renomear categoria' }));
    await waitFor(() =>
      expect(periodizationService.renameParameterCategory).toHaveBeenCalledWith({
        fromCategory: 'objetivo',
        toCategory: 'objetivo_principal',
      })
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Categoria renomeada de objetivo para objetivo_principal.'
    );
  });

  it('distingue filtros sem resultado de base vazia e oferece caminho de recuperação', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsParameters />);

    await screen.findByRole('table');
    await user.type(screen.getByLabelText('Buscar'), 'inexistente');
    expect(await screen.findByText('Nenhum resultado com estes filtros')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();

    unmount();
    vi.mocked(periodizationService.getAllParameters).mockResolvedValue([]);
    render(<SettingsParameters />);
    expect(await screen.findByText('Nenhum parâmetro cadastrado')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Novo parâmetro' }).length).toBeGreaterThan(0);
  });

  it('não anuncia sucesso quando criação persiste mas o refresh falha, e permite recuperar com Atualizar', async () => {
    const user = userEvent.setup();
    mockRefreshFailureAfterInitialLoad();
    render(<SettingsParameters />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Novo parâmetro' }));
    await user.selectOptions(screen.getByLabelText(/Categoria/), 'objetivo');
    await user.type(screen.getByLabelText(/Código/), 'for');
    await user.type(screen.getByLabelText(/Descrição/), 'Força');
    await user.click(screen.getByRole('button', { name: 'Salvar parâmetro' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Parâmetro criado, mas não foi possível atualizar a lista.'
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(periodizationService.createParameter).toHaveBeenCalledTimes(1);
    expect(periodizationService.getAllParameters).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(periodizationService.getAllParameters).toHaveBeenCalledTimes(3);
  });

  it('não anuncia sucesso quando edição persiste mas o refresh falha', async () => {
    const user = userEvent.setup();
    mockRefreshFailureAfterInitialLoad();
    render(<SettingsParameters />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.clear(screen.getByLabelText(/Descrição/));
    await user.type(screen.getByLabelText(/Descrição/), 'Adaptação revisada');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Parâmetro atualizado, mas não foi possível atualizar a lista.'
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(periodizationService.updateParameter).toHaveBeenCalledTimes(1);
    expect(periodizationService.getAllParameters).toHaveBeenCalledTimes(2);
  });

  it('não anuncia sucesso quando exclusão persiste mas o refresh falha', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockRefreshFailureAfterInitialLoad();
    render(<SettingsParameters />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Parâmetro ADP foi excluído, mas não foi possível atualizar a lista.'
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(periodizationService.deleteParameter).toHaveBeenCalledTimes(1);
    expect(periodizationService.getAllParameters).toHaveBeenCalledTimes(2);
  });

  it('não anuncia sucesso quando renomeação persiste mas o refresh falha', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockRefreshFailureAfterInitialLoad();
    render(<SettingsParameters />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Gerenciar categorias' }));
    await user.selectOptions(screen.getByLabelText('Categoria atual'), 'objetivo');
    await user.type(screen.getByLabelText('Nova categoria'), 'objetivo_principal');
    await user.click(screen.getByRole('button', { name: 'Renomear categoria' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Categoria renomeada, mas não foi possível atualizar a lista.'
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(periodizationService.renameParameterCategory).toHaveBeenCalledTimes(1);
    expect(periodizationService.getAllParameters).toHaveBeenCalledTimes(2);
  });

  it('preserva o formulário quando a API falha ao salvar', async () => {
    const user = userEvent.setup();
    vi.mocked(periodizationService.createParameter).mockRejectedValue(new Error('falha ao salvar'));
    render(<SettingsParameters />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Novo parâmetro' }));
    await user.selectOptions(screen.getByLabelText(/Categoria/), 'objetivo');
    await user.type(screen.getByLabelText(/Código/), 'for');
    await user.type(screen.getByLabelText(/Descrição/), 'Força');
    await user.click(screen.getByRole('button', { name: 'Salvar parâmetro' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('falha ao salvar');
    expect(screen.getByLabelText(/Código/)).toHaveValue('FOR');
    expect(screen.getByLabelText(/Descrição/)).toHaveValue('Força');
    expect(screen.getByRole('heading', { name: 'Novo parâmetro' })).toBeInTheDocument();
  });
});
