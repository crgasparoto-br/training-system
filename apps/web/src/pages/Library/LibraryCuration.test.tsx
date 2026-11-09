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

  it('only requests approved exercises for a regular professor and hides mutation buttons', async () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: professor } as never);
    vi.mocked(libraryService.listExercises).mockResolvedValue([{ ...draft, curationStatus: 'approved' }]);
    render(<Library />);
    expect(await screen.findByText('Agachamento')).toBeInTheDocument();
    expect(libraryService.listExercises).toHaveBeenCalledWith(expect.objectContaining({ scope: 'official' }));
    expect(screen.queryByRole('button', { name: /novo exercício/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aprovar agachamento|revisar agachamento|desativar agachamento/i })).not.toBeInTheDocument();
  });

  it('submits a draft for review with an explicit version without auto-approving it', async () => {
    const actor = userEvent.setup();
    render(<Library />);
    await screen.findByRole('button', { name: /revisar agachamento/i });
    await actor.click(screen.getByRole('button', { name: /revisar agachamento/i }));
    await waitFor(() => expect(libraryService.reviewExercise).toHaveBeenCalledWith('exercise-1', 'submit', 1));
    expect(libraryService.reviewExercise).not.toHaveBeenCalledWith('exercise-1', 'approve', expect.anything());
  });
});
