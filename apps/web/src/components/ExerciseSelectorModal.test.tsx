import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseSelectorModal } from './ExerciseSelectorModal';
import { libraryService, type Exercise } from '../services/library.service';

vi.mock('../services/library.service', () => ({
  libraryService: { listExercises: vi.fn() },
}));

const approved: Exercise = {
  id: 'exercise-approved', name: 'Agachamento aprovado',
  category: 'RESISTIDO', muscleGroup: 'Quadríceps',
  aliases: [], equipment: [], primaryMuscleGroups: [], secondaryMuscleGroups: [],
  joints: [], instructions: ['Instrução de execução'], commonErrors: [],
  regressions: [], progressions: [], alternatives: [], restrictions: [], alerts: [],
  curationStatus: 'approved', version: 1, legacyGrandfathered: false,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};

function selector(section = 'MOBILIDADE', isOpen = true, onSelectMany = vi.fn()) {
  return <ExerciseSelectorModal
    isOpen={isOpen}
    section={section}
    onClose={vi.fn()}
    onSelect={vi.fn()}
    onSelectMany={onSelectMany}
  />;
}

describe('ExerciseSelectorModal - catálogo operacional (#562)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(libraryService.listExercises).mockResolvedValue([approved]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['MOBILIDADE', 'SESSAO', 'RESFRIAMENTO'])(
    'abre a seção %s sem impor a categoria do catálogo',
    async (section) => {
      render(selector(section));
      expect(await screen.findByText('Agachamento aprovado')).toBeInTheDocument();
      expect(libraryService.listExercises).toHaveBeenCalledTimes(1);
      expect(libraryService.listExercises).toHaveBeenCalledWith({ scope: 'official' });
      expect(screen.getByRole('combobox', { name: 'Categoria' })).toHaveValue('');
      expect(screen.getByRole('combobox', { name: 'Grupo Muscular' })).toHaveValue('Todos');
    },
  );

  it('aplica apenas os filtros escolhidos pelo professor e mantém a seleção em lote', async () => {
    const user = userEvent.setup();
    const onSelectMany = vi.fn();
    render(selector('MOBILIDADE', true, onSelectMany));
    await screen.findByText('Agachamento aprovado');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'RESISTIDO');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Grupo Muscular' }), 'Quadríceps');
    await user.type(screen.getByPlaceholderText('Buscar por nome ou grupo muscular...'), 'agacha');
    await waitFor(() => expect(libraryService.listExercises).toHaveBeenCalledWith({
      scope: 'official', category: 'RESISTIDO', muscleGroup: 'Quadríceps', search: 'agacha',
    }));

    await screen.findByText('Agachamento aprovado');
    await user.click(screen.getByRole('button', { name: /Agachamento aprovado/i }));
    await user.click(screen.getByRole('button', { name: 'Adicionar selecionados' }));
    expect(onSelectMany).toHaveBeenCalledTimes(1);
    expect(onSelectMany).toHaveBeenCalledWith([approved]);
  });

  it('distingue erro de rede e permite tentar novamente sem mudar o escopo', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(libraryService.listExercises)
      .mockRejectedValueOnce(new Error('connection failed'))
      .mockResolvedValueOnce([approved]);

    render(selector());
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a biblioteca');
    expect(screen.queryByText('Nenhum exercício disponível para adicionar ao treino.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Agachamento aprovado')).toBeInTheDocument();
    expect(libraryService.listExercises).toHaveBeenLastCalledWith({ scope: 'official' });
  });

  it('explica catálogo sem exercícios elegíveis sem sugerir acesso a rascunhos', async () => {
    vi.mocked(libraryService.listExercises).mockResolvedValue([]);
    render(selector());
    expect(await screen.findByText('Nenhum exercício disponível para adicionar ao treino.')).toBeInTheDocument();
    expect(screen.getByText(/A Biblioteca pode mostrar exercícios "Aprovado \(legado\)"/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar exercícios na Biblioteca' }))
      .toHaveAttribute('href', '/library');
    expect(libraryService.listExercises).toHaveBeenCalledWith({ scope: 'official' });
  });

  it('apresenta estado vazio por filtro e oferece limpar os filtros', async () => {
    const user = userEvent.setup();
    vi.mocked(libraryService.listExercises).mockResolvedValue([]);
    render(selector());
    await screen.findByText('Nenhum exercício disponível para adicionar ao treino.');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'MOBILIDADE');
    expect(await screen.findByText('Nenhum exercício corresponde aos filtros selecionados.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByText('Nenhum exercício disponível para adicionar ao treino.')).toBeInTheDocument();
    expect(libraryService.listExercises).toHaveBeenLastCalledWith({ scope: 'official' });
  });

  it('descarta resposta antiga que chega após um filtro mais recente', async () => {
    let resolveOld!: (value: Exercise[]) => void;
    let resolveCurrent!: (value: Exercise[]) => void;
    const oldRequest = new Promise<Exercise[]>((resolve) => { resolveOld = resolve; });
    const currentRequest = new Promise<Exercise[]>((resolve) => { resolveCurrent = resolve; });
    vi.mocked(libraryService.listExercises)
      .mockReturnValueOnce(oldRequest).mockReturnValueOnce(currentRequest);

    const user = userEvent.setup();
    render(selector());
    await waitFor(() => expect(libraryService.listExercises).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'RESISTIDO');
    await waitFor(() => expect(libraryService.listExercises).toHaveBeenCalledTimes(2));

    await act(async () => { resolveCurrent([approved]); });
    expect(screen.getByText('Agachamento aprovado')).toBeInTheDocument();
    await act(async () => { resolveOld([{ ...approved, id: 'obsolete', name: 'Resposta obsoleta' }]); });
    expect(screen.queryByText('Resposta obsoleta')).not.toBeInTheDocument();
    expect(screen.getByText('Agachamento aprovado')).toBeInTheDocument();
  });

  it('limpa filtros e seleção ao fechar e reabrir', async () => {
    const user = userEvent.setup();
    const { rerender } = render(selector('MOBILIDADE'));
    await screen.findByText('Agachamento aprovado');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'RESISTIDO');
    await screen.findByText('Agachamento aprovado');
    await user.click(screen.getByRole('button', { name: /Agachamento aprovado/i }));
    expect(screen.getByText(/Selecionados: 1/)).toBeInTheDocument();

    await act(async () => { rerender(selector('MOBILIDADE', false)); });
    await act(async () => { rerender(selector('MOBILIDADE', true)); });
    expect(screen.getByRole('combobox', { name: 'Categoria' })).toHaveValue('');
    expect(screen.getByText(/Selecionados: 0/)).toBeInTheDocument();
    await waitFor(() => expect(libraryService.listExercises).toHaveBeenLastCalledWith({ scope: 'official' }));
  });
});
