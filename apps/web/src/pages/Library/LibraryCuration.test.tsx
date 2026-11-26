import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { libraryService, type Exercise } from '../../services/library.service';
import { useAuthStore } from '../../stores/useAuthStore';
import Library from './index';

vi.mock('../../services/library.service', () => ({
  libraryService: {
    listExercises: vi.fn(),
    reviewExercise: vi.fn(),
    deleteExercise: vi.fn(),
    createExercise: vi.fn(),
    createExerciseVersion: vi.fn(),
    updateExercise: vi.fn(),
    listExerciseRevisions: vi.fn(),
  },
}));
vi.mock('../../stores/useAuthStore', () => ({ useAuthStore: vi.fn() }));

const draft: Exercise = {
  id: 'exercise-1', name: 'Agachamento', category: 'RESISTIDO',
  aliases: [], equipment: ['Halteres'], primaryMuscleGroups: ['Quadríceps'],
  secondaryMuscleGroups: [], joints: [], instructions: ['Posicionar os pés'],
  commonErrors: [], regressions: [], progressions: [], alternatives: [],
  restrictions: [], alerts: [], curationStatus: 'draft', version: 1,
  legacyGrandfathered: false, createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
};
const master = { type: 'professor', professor: { role: 'master' } };
const professor = { type: 'professor', professor: { role: 'professor' } };

describe('library administrative curation (#394)', () => {
  beforeEach(() => {
    vi.mocked(useAuthStore).mockReturnValue({ user: master } as never);
    vi.mocked(libraryService.listExercises).mockResolvedValue([draft]);
    vi.mocked(libraryService.reviewExercise).mockResolvedValue({ ...draft, curationStatus: 'in_review', version: 2 });
    vi.mocked(libraryService.listExerciseRevisions).mockResolvedValue([]);
    vi.stubGlobal('confirm', vi.fn(() => true));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows the unpublished draft and administrative actions only to the master', async () => {
    render(<Library />);
    expect(await screen.findByText('Agachamento')).toBeInTheDocument();
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /novo exercício/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revisar agachamento/i })).toBeInTheDocument();
    expect(libraryService.listExercises).toHaveBeenCalledWith(expect.objectContaining({ scope: 'all' }));
  });

  it('#570 labels system-approved defaults and shows an editorial version, not a technical action counter', async () => {
    vi.mocked(libraryService.listExercises).mockResolvedValue([{
      ...draft, systemDefault: true, curationStatus: 'approved', contentVersion: 1, version: 4,
    }]);
    render(<Library />);
    expect(await screen.findByText('Aprovado pelo sistema')).toBeInTheDocument();
    expect(screen.getByText('Versão do conteúdo 1')).toBeInTheDocument();
    expect(screen.queryByText('Versão 4')).not.toBeInTheDocument();
  });

  it('only requests approved exercises for a regular professor and hides mutation buttons', async () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: professor } as never);
    vi.mocked(libraryService.listExercises).mockResolvedValue([{ ...draft, curationStatus: 'approved' }]);
    render(<Library />);
    expect(await screen.findByText('Agachamento')).toBeInTheDocument();
    expect(libraryService.listExercises).toHaveBeenCalledWith(expect.objectContaining({ scope: 'official' }));
    expect(screen.queryByRole('region', { name: 'Disponibilidade para novos treinos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /novo exercício/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aprovar agachamento|revisar agachamento|desativar agachamento/i })).not.toBeInTheDocument();
  });

  it('#576 displays the approval rejection and permits editing the same exercise', async () => {
    const actor = userEvent.setup();
    const pending = { ...draft, instructions: [], curationStatus: 'in_review' as const, version: 2 };
    const corrected = { ...draft, capacity: 'resisted' as const, curationStatus: 'draft' as const, version: 3 };
    const resubmitted = { ...corrected, curationStatus: 'in_review' as const, version: 4 };
    vi.mocked(libraryService.updateExercise).mockResolvedValue(corrected);
    vi.mocked(libraryService.listExercises).mockResolvedValue([pending]);
    vi.mocked(libraryService.reviewExercise).mockRejectedValueOnce({
      isAxiosError: true, response: { status: 422, data: { message: 'Preencha: Capacidade física; Instruções em etapas.' } },
    });
    render(<Library />);
    await actor.click(await screen.findByRole('button', { name: 'Aprovar Agachamento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Capacidade física; Instruções em etapas.');
    expect(screen.getByText('Em revisão')).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Editar exercício' }));
    expect(screen.getByRole('heading', { name: 'Editar Exercício' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Agachamento')).toBeInTheDocument();
    await actor.selectOptions(screen.getByRole('combobox', { name: /capacidade física/i }), 'resisted');
    await actor.type(screen.getByRole('textbox', { name: /instruções em etapas/i }), 'Posicionar os pés');
    vi.mocked(libraryService.listExercises).mockResolvedValue([corrected]);
    await actor.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(libraryService.updateExercise).toHaveBeenCalledWith('exercise-1', expect.objectContaining({ capacity: 'resisted', instructions: ['Posicionar os pés'] }), 2));
    const submit = await screen.findByRole('button', { name: 'Revisar Agachamento' });
    vi.mocked(libraryService.reviewExercise).mockResolvedValueOnce(resubmitted);
    vi.mocked(libraryService.listExercises).mockResolvedValue([resubmitted]);
    await actor.click(submit);
    await waitFor(() => expect(libraryService.reviewExercise).toHaveBeenCalledWith('exercise-1', 'submit', 3));
    expect(await screen.findByRole('button', { name: 'Aprovar Agachamento' })).toBeInTheDocument();
    expect(libraryService.reviewExercise).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [403, 'Você não possui permissão'],
    [409, 'O exercício foi alterado'],
  ])('#576 distinguishes HTTP %i without changing review state', async (status, message) => {
    const actor = userEvent.setup();
    vi.mocked(libraryService.listExercises).mockResolvedValue([{ ...draft, curationStatus: 'in_review', version: 2 }]);
    vi.mocked(libraryService.reviewExercise).mockRejectedValueOnce({
      isAxiosError: true, response: { status, data: { message: 'internal details' } },
    });
    render(<Library />);
    await actor.click(await screen.findByRole('button', { name: 'Aprovar Agachamento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByText('Em revisão')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar exercício' })).not.toBeInTheDocument();
    expect(screen.queryByText('internal details')).not.toBeInTheDocument();
    expect(libraryService.updateExercise).not.toHaveBeenCalled();
    await actor.click(screen.getByRole('button', { name: 'Recarregar biblioteca' }));
    await waitFor(() => expect(libraryService.listExercises).toHaveBeenCalledTimes(2));
  });

  it('#576 never exposes internal server details after an unexpected approval error', async () => {
    const actor = userEvent.setup();
    vi.mocked(libraryService.listExercises).mockResolvedValue([{ ...draft, curationStatus: 'in_review', version: 2 }]);
    vi.mocked(libraryService.reviewExercise).mockRejectedValueOnce({
      isAxiosError: true, response: { status: 500, data: { message: 'internal SQL details' } },
    });
    render(<Library />);
    await actor.click(await screen.findByRole('button', { name: 'Aprovar Agachamento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Recarregue a biblioteca');
    expect(screen.queryByText(/internal SQL details/)).not.toBeInTheDocument();
  });

  it('submits a draft for review with an explicit version without auto-approving it', async () => {
    const actor = userEvent.setup();
    render(<Library />);
    await screen.findByRole('button', { name: /revisar agachamento/i });
    await actor.click(screen.getByRole('button', { name: /revisar agachamento/i }));
    await waitFor(() => expect(libraryService.reviewExercise).toHaveBeenCalledWith('exercise-1', 'submit', 1));
    expect(libraryService.reviewExercise).not.toHaveBeenCalledWith('exercise-1', 'approve', expect.anything());
  });

  it('distingue aprovações históricas do catálogo disponível e permite filtrar legados', async () => {
    const actor = userEvent.setup();
    const historical = { ...draft, id: 'historical-1', curationStatus: 'approved' as const, legacyGrandfathered: true };
    const operational = { ...draft, id: 'operational-1', name: 'Remada liberada', curationStatus: 'approved' as const, legacyGrandfathered: false, version: 3 };
    vi.mocked(libraryService.listExercises).mockResolvedValue([historical, operational]);

    render(<Library />);
    expect(await screen.findByText('Agachamento')).toBeInTheDocument();
    expect(screen.getByText('Aprovado (legado)')).toBeInTheDocument();
    expect(screen.getByText('Não liberado para novos treinos')).toBeInTheDocument();
    expect(screen.getByText('Liberado para novos treinos')).toBeInTheDocument();
    expect(screen.getByText(/1 exercício liberado para novos treinos/)).toBeInTheDocument();
    expect(libraryService.listExercises).toHaveBeenCalledWith(expect.objectContaining({ scope: 'all' }));

    await actor.click(screen.getByRole('button', { name: 'Mostrar apenas legados (1)' }));
    expect(screen.getByText('Agachamento')).toBeInTheDocument();
    expect(screen.queryByText('Remada liberada')).not.toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Mostrar todos' }));
    expect(screen.getByText('Remada liberada')).toBeInTheDocument();
  });

  it('offers a new draft for a grandfathered exercise without rewriting its historical record', async () => {
    const actor = userEvent.setup();
    const historical = { ...draft, id: 'historical-1', legacyGrandfathered: true, curationStatus: 'approved' as const };
    vi.mocked(libraryService.listExercises).mockResolvedValue([historical]);
    vi.mocked(libraryService.createExerciseVersion).mockResolvedValue({ ...historical, id: 'new-1', curationStatus: 'draft' });
    render(<Library />);
    const clone = await screen.findByRole('button', { name: /criar nova versão para curadoria de agachamento/i });
    await actor.click(clone);
    expect(screen.getByRole('heading', { name: /nova versão para curadoria/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /nome do exercício/i }))
      .toHaveValue('Agachamento');
    await actor.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(libraryService.createExerciseVersion).toHaveBeenCalledWith(
      'historical-1', expect.objectContaining({ name: 'Agachamento' }), historical.version,
    ));
    expect(libraryService.updateExercise).not.toHaveBeenCalled();
    expect(libraryService.reviewExercise).not.toHaveBeenCalledWith(
      'historical-1', 'approve', expect.anything(),
    );
  });


});
