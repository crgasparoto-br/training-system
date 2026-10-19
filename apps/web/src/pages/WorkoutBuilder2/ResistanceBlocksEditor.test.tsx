import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ResistanceBlocksEditor from './ResistanceBlocksEditor';

describe('Issue #399 - editor de séries', () => {
  it('não inventa dados no modo legado; adiciona bloco e preserva valores nulos', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ResistanceBlocksEditor exerciseName="Agachamento" onChange={onChange} />);
    expect(screen.getByText(/estrutura simples \(legado\)/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Detalhar séries de Agachamento' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar bloco' }));
    const blocks = onChange.mock.calls.at(-1)?.[0];
    expect(blocks[0]).toMatchObject({ position: 1, kind: 'principal', plannedSets: [{ position: 1, repsMin: null, loadKg: null }] });
    rerender(<ResistanceBlocksEditor exerciseName="Agachamento" blocks={blocks} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Rep. mín., série 1 de Agachamento' }), { target: { value: '8' } });
    expect(onChange.mock.calls.at(-1)?.[0][0].plannedSets[0]).toMatchObject({ repsMin: 8, repsMax: null });
  });
  it('remove série, renumera as demais e mantém outros valores', () => {
    const onChange = vi.fn();
    render(<ResistanceBlocksEditor exerciseName="Supino" onChange={onChange} blocks={[{
      position: 1, kind: 'principal', plannedSets: [
        { position: 1, repsMin: 5 }, { position: 2, repsMin: 8 }, { position: 3, repsMin: 10 },
      ],
    }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Detalhar séries de Supino' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover série 2' }));
    expect(onChange.mock.calls.at(-1)?.[0][0].plannedSets).toEqual([
      expect.objectContaining({ position: 1, repsMin: 5 }),
      expect.objectContaining({ position: 2, repsMin: 10 }),
    ]);
  });
});
