import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ResistanceGroupsEditor from './ResistanceGroupsEditor';
import type { ResistanceGroupDraft } from './workout-builder-structure';

const exercises = [
  { id: 'a', name: 'Agachamento', section: 'sessao' as const, category: 'Resistido' },
  { id: 'b', name: 'Remada', section: 'sessao' as const, category: 'Resistido' },
  { id: 'c', name: 'Supino', section: 'sessao' as const, category: 'Resistido' },
  { id: 'd', name: 'Trote', section: 'sessao' as const, category: 'Cíclico' },
];

describe('#400 - editor explícito de grupos', () => {
  it('cria agrupamento com exercícios canônicos sem adicionar cópias', () => {
    const onChange = vi.fn();
    render(<ResistanceGroupsEditor groups={[]} exercises={exercises} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({
      position: 1, kind: 'bi_set', rounds: null,
      members: [{ exerciseRowId: 'a' }, { exerciseRowId: 'b' }],
    })]);
    expect(onChange.mock.calls[0][0][0].members).toHaveLength(2);
  });
  it('permite trocar tipo, adicionar membro, prescrever rodadas e desfazer grupo', () => {
    const onChange = vi.fn();
    const initial: ResistanceGroupDraft[] = [{
      position: 1, kind: 'bi_set', rounds: null, members: [{ exerciseRowId: 'a' }, { exerciseRowId: 'b' }],
    }];
    const { rerender } = render(<ResistanceGroupsEditor groups={initial} exercises={exercises} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Grupo 1 · Tipo'), { target: { value: 'tri_set' } });
    const changed = onChange.mock.calls.at(-1)?.[0] as ResistanceGroupDraft[];
    expect(changed[0].kind).toBe('tri_set');
    expect(changed[0].members.map((row) => row.exerciseRowId)).toEqual(['a', 'b', 'c']);
    rerender(<ResistanceGroupsEditor groups={changed} exercises={exercises} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Rodadas (opcional)'), { target: { value: '4' } });
    expect(onChange.mock.calls.at(-1)?.[0][0].rounds).toBe(4);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir grupo 1' }));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual([]);
  });
  it('substitui um participante sem desfazer o bi-set nem duplicar exercício', () => {
    const onChange = vi.fn();
    const initial: ResistanceGroupDraft[] = [{
      position: 1, kind: 'bi_set', rounds: 3, members: [
        { exerciseRowId: 'a' }, { exerciseRowId: 'b' },
      ],
    }];
    render(<ResistanceGroupsEditor groups={initial} exercises={exercises} onChange={onChange} />);
    const selector = screen.getByRole('combobox', { name: 'Participante 2 do grupo 1' });
    expect(selector).toHaveValue('b');
    expect(Array.from((selector as HTMLSelectElement).options).map((option) => option.value))
      .not.toContain('a');
    expect(Array.from((selector as HTMLSelectElement).options).map((option) => option.value))
      .not.toContain('d');
    fireEvent.change(selector, { target: { value: 'c' } });
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({
      position: 1, kind: 'bi_set', rounds: 3,
      members: [{ exerciseRowId: 'a' }, { exerciseRowId: 'c' }],
    })]);
  });

  it('explica quando faltam exercícios livres para criar agrupamento', () => {
    const onChange = vi.fn();
    render(<ResistanceGroupsEditor groups={[]} exercises={exercises.slice(0, 1)} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Criar grupo' })).toBeDisabled();
    expect(screen.getByText(/adicione pelo menos 2 exercícios livres/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('não habilita alterações em treino liberado ou dia somente leitura', () => {
    const onChange = vi.fn();
    render(<fieldset disabled><ResistanceGroupsEditor groups={[]} exercises={exercises} onChange={onChange} /></fieldset>);
    expect(screen.getByRole('button', { name: 'Criar grupo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
