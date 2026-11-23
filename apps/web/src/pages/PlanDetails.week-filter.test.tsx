import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPlan: vi.fn(),
  getMatrix: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ id: 'plan-1' }),
}));
vi.mock('../services/plan.service', () => ({
  planService: { getById: mocks.getPlan },
}));
vi.mock('../services/periodization.service', () => ({
  periodizationService: { getMatrixByPlanId: mocks.getMatrix },
}));
vi.mock('../components/PeriodizationMatrix', () => ({
  PeriodizationMatrixComponent: () => <p>Periodização do plano</p>,
}));

import { PlanDetails } from './PlanDetails';

describe('PlanDetails: localizar e abrir semana sem rolar a lista inteira', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 23, 12, 0));
    mocks.getPlan.mockResolvedValue({
      id: 'plan-1',
      name: 'Plano de corrida',
      startDate: '2026-11-16',
      endDate: '2026-12-13',
      aluno: { user: { profile: { name: 'Aluno teste' } } },
    });
    mocks.getMatrix.mockResolvedValue({
      id: 'matrix-1',
      totalMesocycles: 1,
      weeksPerMesocycle: 4,
      resistedStimulus: [],
      cyclicStimulus: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('seleciona a semana que contém hoje por padrão e abre sua montagem', async () => {
    render(<PlanDetails />);

    expect(await screen.findByText('Semana 2')).toBeInTheDocument();
    expect(screen.queryByText('Semana 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Semana 3')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Semana do plano' })).toHaveValue('2');
    expect(screen.getByRole('status')).toHaveTextContent('Exibindo semana 2 de 4.');

    fireEvent.click(screen.getByRole('button', { name: /Abrir Montagem/i }));
    expect(mocks.navigate).toHaveBeenCalledWith('/plans/plan-1/workout-builder/1/2');
  });

  it('localiza semana pelo número ou por data e recupera Hoje e Todas as semanas', async () => {
    render(<PlanDetails />);
    await screen.findByText('Semana 2');

    fireEvent.change(screen.getByRole('combobox', { name: 'Semana do plano' }), {
      target: { value: '3' },
    });
    expect(screen.getByText('Semana 3')).toBeInTheDocument();
    expect(screen.queryByText('Semana 2')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Localizar por data'), {
      target: { value: '2026-11-16' },
    });
    expect(screen.getByText('Semana 1')).toBeInTheDocument();
    expect(screen.queryByText('Semana 3')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.getByText('Semana 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Todas as semanas' }));
    expect(screen.getByText('Semana 1')).toBeInTheDocument();
    expect(screen.getByText('Semana 4')).toBeInTheDocument();
    expect(mocks.getPlan).toHaveBeenCalledTimes(1);
  });

  it('não apresenta treino de outra semana se a data buscada estiver fora do plano', async () => {
    render(<PlanDetails />);
    await screen.findByText('Semana 2');

    fireEvent.change(screen.getByLabelText('Localizar por data'), {
      target: { value: '2026-11-15' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Não há semana do plano para a data informada.');
    expect(screen.getByText('Nenhuma semana encontrada para esta data.')).toBeInTheDocument();
    expect(screen.queryByText('Semana 2')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abrir Montagem/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Ver todas as semanas' }));
    expect(screen.getByText('Semana 2')).toBeInTheDocument();
  });

  it('mantém navegação canônica e a periodização ao trocar de semana', async () => {
    render(<PlanDetails />);
    await screen.findByText('Semana 2');

    fireEvent.click(screen.getByRole('button', { name: /Periodização Macrociclo/ }));
    expect(screen.getByText('Periodização do plano')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Semana do plano' }), {
      target: { value: '4' },
    });
    expect(screen.getByText('Semana 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Montar semana' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/plans/plan-1/workout-builder/1/4');
  });
});
