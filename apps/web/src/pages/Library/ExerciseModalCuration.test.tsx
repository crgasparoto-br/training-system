import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExerciseModal from './ExerciseModal';
import { libraryService, type Exercise } from '../../services/library.service';

vi.mock('../../services/library.service', () => ({
  libraryService: { createExercise: vi.fn(), updateExercise: vi.fn() },
}));
vi.mock('./YouTubeEmbed', () => ({ default: ({ url }: { url: string }) => <div data-testid="video-preview">{url}</div> }));

const legacy: Exercise = {
  id: 'legacy-id', name: 'Exercício antigo', category: 'RESISTIDO',
  capacity: 'resistance', curationStatus: 'approved', legacyGrandfathered: true, version: 3,
  videoUrl: 'https://example.org/unknown-rights', mediaOrigin: null, mediaLicense: null,
  aliases: [], equipment: [], primaryMuscleGroups: [], secondaryMuscleGroups: [],
  joints: [], instructions: ['Posicionar-se'], commonErrors: [], regressions: [],
  progressions: [], alternatives: [], restrictions: [], alerts: [],
  createdAt: '2026-11-09T00:00:00.000Z', updatedAt: '2026-11-09T00:00:00.000Z',
};

describe('#394 capacity taxonomy and historical media in the exercise editor', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('requires selecting canonical capacity before submitting a formerly noncanonical legacy value', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(libraryService.updateExercise).mockResolvedValue(legacy);
    render(<ExerciseModal mode="edit" exercise={legacy} onClose={onClose} />);
    const capacity = screen.getByRole('combobox', { name: /capacidade física/i });
    expect(screen.getByText(/classificação legada: resistance/i)).toBeInTheDocument();
    expect((capacity as HTMLSelectElement).value).toBe('');
    expect([...capacity.querySelectorAll('option')].map(option => option.value))
      .toEqual(['', 'resisted', 'flexibility', 'cyclic', 'balance']);
    await user.selectOptions(capacity, 'resisted');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(libraryService.updateExercise).toHaveBeenCalledWith(
      'legacy-id', expect.objectContaining({ capacity: 'resisted' }), 3,
    ));
  });

  it('never previews a legacy video with no evidence of use rights while preserving its URL in the record', () => {
    render(<ExerciseModal mode="view" exercise={legacy} onClose={vi.fn()} />);
    expect(screen.getByText(/mídia legada preservada para o histórico/i)).toBeInTheDocument();
    expect(screen.queryByTestId('video-preview')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.org/unknown-rights')).toBeInTheDocument();
  });

  it('shows a video only when the live exercise has verified origin and license', () => {
    const verified = { ...legacy, legacyGrandfathered: false, capacity: 'resisted',
      mediaOrigin: 'Própria', mediaLicense: 'Contrato válido' };
    render(<ExerciseModal mode="view" exercise={verified} onClose={vi.fn()} />);
    expect(screen.getByTestId('video-preview')).toHaveTextContent('https://example.org/unknown-rights');
  });

  it.each([
    ['Instruções em etapas', 'instructions'],
    ['Erros comuns', 'commonErrors'],
    ['Regressões', 'regressions'],
    ['Progressões', 'progressions'],
    ['Alternativas sugeridas', 'alternatives'],
    ['Restrições', 'restrictions'],
    ['Alertas', 'alerts'],
    ['Outros nomes e aliases', 'aliases'],
    ['Equipamentos', 'equipment'],
    ['Grupos musculares principais', 'primaryMuscleGroups'],
    ['Grupos musculares secundários', 'secondaryMuscleGroups'],
    ['Articulações envolvidas', 'joints'],
  ] as const)('preserves spaces and newlines in %s until save', async (label, field) => {
    const user = userEvent.setup();
    vi.mocked(libraryService.createExercise).mockResolvedValue(legacy);
    render(<ExerciseModal mode="create" exercise={null} onClose={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: /nome do exercício/i }), 'Novo exercício');
    const input = screen.getByRole('textbox', { name: new RegExp(label, 'i') });
    await user.type(input, 'Primeira etapa ');
    expect(input).toHaveValue('Primeira etapa ');
    await user.type(input, 'com detalhe{enter}Segunda etapa');
    expect(input).toHaveValue('Primeira etapa com detalhe\nSegunda etapa');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(libraryService.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({ [field]: ['Primeira etapa com detalhe', 'Segunda etapa'] }),
    ));
  });

  it('clones historical technical metadata into a new draft without inherited media or review', async () => {
    const user = userEvent.setup();
    vi.mocked(libraryService.createExercise).mockResolvedValue({ ...legacy, id: 'new-draft', curationStatus: 'draft' });
    render(<ExerciseModal mode="create" exercise={legacy} onClose={vi.fn()} showHistory />);
    expect(screen.getByDisplayValue('Exercício antigo (nova versão)')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /link vídeo youtube/i })).toHaveValue('');
    expect(screen.getByText(/exercício original e seus treinos permanecem intactos/i)).toBeInTheDocument();
    expect(screen.queryByText(/Estado da curadoria/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(libraryService.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Exercício antigo (nova versão)', videoUrl: '',
        mediaOrigin: '', mediaLicense: '', mediaAuthor: '',
        instructions: ['Posicionar-se'],
      }),
    ));
    expect(libraryService.updateExercise).not.toHaveBeenCalled();
  });


});
