import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

vi.mock('../../services/periodization.service', () => ({
  periodizationService: {
    getParametersByCategory: vi.fn().mockResolvedValue([
      { id: 'SER', category: 'metodo', code: 'SER', description: 'Séries', order: 1, active: true },
      { id: 'BS', category: 'metodo', code: 'BS', description: 'Bi-Set', order: 2, active: true },
      { id: 'CIR', category: 'metodo', code: 'CIR', description: 'Circuito', order: 3, active: true },
    ]),
  },
}));

vi.mock('../../services/library.service', () => ({
  libraryService: { getAlunoProgress: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../../components/ExerciseSelectorModal', () => ({
  ExerciseSelectorModal: ({
    isOpen,
    onSelect,
    onSelectMany,
  }: {
    isOpen: boolean;
    onSelect: (exercise: { id: string; name: string; category: string }) => void;
    onSelectMany: (exercises: Array<{ id: string; name: string; category: string }>) => void;
  }) =>
    isOpen ? (
      <div>
        <button
          type="button"
          onClick={() => onSelect({ id: 'new-1', name: 'Supino reto', category: 'Resistido' })}
        >
          Selecionar exercício individual
        </button>
        <button
          type="button"
          onClick={() =>
            onSelectMany([
              { id: 'new-2', name: 'Puxada alta', category: 'Resistido' },
              { id: 'new-3', name: 'Leg press', category: 'Resistido' },
            ])
          }
        >
          Selecionar dois exercícios
        </button>
      </div>
    ) : null,
}));

import WorkoutBuilderResistance from './WorkoutBuilderResistance';

const exercise = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  exerciseId: id,
  name,
  category: 'Resistido',
  system: 'SER',
  sets: 3,
  reps: 10,
  interval: 30,
  cParam: 2,
  eParam: 1,
  load: null,
  adjustment: '',
  ...extra,
});

const templateData = {
  id: 'tpl-1',
  planId: 'plan-1',
  mesocycleNumber: 5,
  weekNumber: 2,
  weekStartDate: '2026-09-28',
  resistedExercises: {
    1: {
      mobilidade: [],
      sessao: [exercise('s1', 'Agachamento livre'), exercise('s2', 'Remada curvada', { reps: null })],
      resfriamento: [],
    },
    6: { mobilidade: [], sessao: [exercise('z1', 'Cadeira extensora')], resfriamento: [] },
  },
};

const renderResistance = (onChange = vi.fn()) => {
  render(
    <WorkoutBuilderResistance
      templateData={templateData}
      resistedSummary={{ id: 'r', matrixId: 'm', mesocycleNumber: 5, weekNumber: 2, repZone: 12, method: 'SER' } as any}
      onChange={onChange}
      dayEditability={[true, true, true, true, true, false, false]}
    />
  );
  return onChange;
};

const lastSessao = (onChange: ReturnType<typeof vi.fn>) =>
  onChange.mock.calls.at(-1)?.[0].resistedExercises[1].sessao as Array<Record<string, unknown>>;

describe('WorkoutBuilderResistance', () => {
  let confirmSpy: MockInstance<[message?: string], boolean>;

  beforeEach(() => {
    confirmSpy = vi.spyOn(window, 'confirm');
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('abre o primeiro dia com exercícios e mostra um dia por vez', () => {
    renderResistance();

    expect(screen.getByRole('tab', { name: /Seg/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Segunda-feira, 28/09' })).toBeInTheDocument();
    expect(screen.getByText('Agachamento livre')).toBeInTheDocument();
    expect(screen.queryByText('Cadeira extensora')).not.toBeInTheDocument();
  });

  it('preenchimento rápido mantém os valores atuais nos campos deixados vazios', () => {
    const onChange = renderResistance();
    const sessao = screen.getByRole('region', { name: /Sessão/ });

    fireEvent.click(within(sessao).getByRole('button', { name: 'Preenchimento rápido' }));
    const dialog = screen.getByRole('dialog', { name: 'Preenchimento rápido' });
    fireEvent.change(within(dialog).getByLabelText('C'), { target: { value: '5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }));

    expect(lastSessao(onChange)).toEqual([
      expect.objectContaining({ sets: 3, interval: 30, cParam: 5, eParam: 1 }),
      expect.objectContaining({ sets: 3, interval: 30, cParam: 5, eParam: 1 }),
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fecha o preenchimento rápido com Escape sem alterar dados', () => {
    const onChange = renderResistance();
    const sessao = screen.getByRole('region', { name: /Sessão/ });

    fireEvent.click(within(sessao).getByRole('button', { name: 'Preenchimento rápido' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('bloqueia de fato a edição em dias fora do período do plano', () => {
    renderResistance();

    fireEvent.click(screen.getByRole('tab', { name: /Sáb/ }));

    expect(screen.getByText('Dia fora do período do plano: somente leitura.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Exercícios de Sábado' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Séries de Cadeira extensora' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir Cadeira extensora' })).toBeDisabled();
  });

  it('exibe a zona de repetições como sugestão sem apresentá-la como valor salvo', () => {
    renderResistance();

    const reps = screen.getByRole('spinbutton', { name: 'Repetições de Remada curvada' });
    expect(reps).toHaveValue(null);
    expect(reps).toHaveAttribute('placeholder', '12');
  });

  it('pede confirmação antes de excluir um exercício', () => {
    confirmSpy.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onChange = renderResistance();
    const deleteButton = screen.getByRole('button', { name: 'Excluir Agachamento livre' });

    fireEvent.click(deleteButton);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(deleteButton);
    expect(lastSessao(onChange).map((item) => item.name)).toEqual(['Remada curvada']);
  });

  it('mantém a zona semanal apenas como placeholder ao adicionar um exercício', () => {
    const onChange = renderResistance();
    const sessao = screen.getByRole('region', { name: /Sessão/ });

    fireEvent.click(within(sessao).getByRole('button', { name: 'Adicionar exercício' }));
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar exercício individual' }));

    expect(lastSessao(onChange).at(-1)).toEqual(
      expect.objectContaining({ name: 'Supino reto', reps: null })
    );
    const reps = screen.getByRole('spinbutton', { name: 'Repetições de Supino reto' });
    expect(reps).toHaveValue(null);
    expect(reps).toHaveAttribute('placeholder', '12');
  });

  it('mantém a zona semanal apenas como placeholder ao adicionar vários exercícios', () => {
    const onChange = renderResistance();
    const sessao = screen.getByRole('region', { name: /Sessão/ });

    fireEvent.click(within(sessao).getByRole('button', { name: 'Adicionar exercício' }));
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar dois exercícios' }));

    const added = lastSessao(onChange).slice(-2);
    expect(added).toEqual([
      expect.objectContaining({ name: 'Puxada alta', reps: null }),
      expect.objectContaining({ name: 'Leg press', reps: null }),
    ]);
    expect(screen.getByRole('spinbutton', { name: 'Repetições de Puxada alta' })).toHaveAttribute(
      'placeholder',
      '12'
    );
    expect(screen.getByRole('spinbutton', { name: 'Repetições de Leg press' })).toHaveAttribute(
      'placeholder',
      '12'
    );
  });

  it('reabre o preenchimento rápido com os campos limpos', () => {
    renderResistance();
    let sessao = screen.getByRole('region', { name: /Sessão/ });

    fireEvent.click(within(sessao).getByRole('button', { name: 'Preenchimento rápido' }));
    let dialog = screen.getByRole('dialog', { name: 'Preenchimento rápido' });
    fireEvent.change(within(dialog).getByLabelText('C'), { target: { value: '5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }));

    sessao = screen.getByRole('region', { name: /Sessão/ });
    fireEvent.click(within(sessao).getByRole('button', { name: 'Preenchimento rápido' }));
    dialog = screen.getByRole('dialog', { name: 'Preenchimento rápido' });

    expect(within(dialog).getByLabelText('C')).toHaveValue(null);
    expect(within(dialog).getByLabelText('Séries')).toHaveValue(null);
    expect(within(dialog).getByLabelText('E')).toHaveValue(null);
  });

  it('permite dividir e recompor circuitos em blocos explícitos', () => {
    const onChange = vi.fn();
    const circuitTemplate = {
      ...templateData,
      id: 'tpl-circuit',
      resistedExercises: {
        1: {
          mobilidade: [],
          sessao: [
            exercise('c1', 'Afundo com salto', { system: 'CIR' }),
            exercise('c2', 'Leg Press', { system: 'CIR' }),
            exercise('c3', 'Remada baixa', { system: 'CIR' }),
            exercise('c4', 'Supino', { system: 'CIR' }),
          ],
          resfriamento: [],
        },
      },
    };

    render(
      <WorkoutBuilderResistance
        templateData={circuitTemplate}
        resistedSummary={{ id: 'r', matrixId: 'm', mesocycleNumber: 5, weekNumber: 2, method: 'CIR' } as any}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Circuito 1 · 1/4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar novo bloco antes de Remada baixa' }));

    const split = onChange.mock.calls.at(-1)?.[0].resistedExercises[1].sessao;
    expect(split[2]).toEqual(expect.objectContaining({ name: 'Remada baixa', groupBreakBefore: true }));
    expect(screen.getByText('Circuito 1 · 1/2')).toBeInTheDocument();
    expect(screen.getByText('Circuito 2 · 1/2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unir Remada baixa ao bloco anterior' }));

    const joined = onChange.mock.calls.at(-1)?.[0].resistedExercises[1].sessao;
    expect(joined[2]).toEqual(expect.objectContaining({ name: 'Remada baixa', groupBreakBefore: false }));
    expect(screen.getByText('Circuito 1 · 1/4')).toBeInTheDocument();
  });

  it('navega entre os dias pelo teclado', () => {
    const onSelectedDayChange = vi.fn();
    render(
      <WorkoutBuilderResistance
        templateData={templateData}
        resistedSummary={null}
        onChange={vi.fn()}
        onSelectedDayChange={onSelectedDayChange}
      />
    );

    fireEvent.keyDown(screen.getByRole('tab', { name: /Seg/ }), { key: 'ArrowLeft' });

    expect(onSelectedDayChange).toHaveBeenCalledWith(7);
    expect(screen.getByRole('tab', { name: /Dom/ })).toHaveAttribute('aria-selected', 'true');
  });
});
