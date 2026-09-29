import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import WeeklySummaryCards from './WeeklySummaryCards';

describe('WeeklySummaryCards', () => {
  it('renderiza todos os indicadores em cards responsivos e preserva os valores do resumo', () => {
    render(
      <WeeklySummaryCards
        summary={{
          loadPercentage: 70,
          seriesReference: 12,
          repZone: 10,
          repReserve: 2,
          assembly: 'AS',
          method: 'CIR',
          loadCycle: 'ORD',
          trainingDivision: 'AB',
          weeklyFrequency: 3,
          objective: 'FOR',
        } as any}
        assemblyLabel="Alternado por Segmento"
        methodLabel="Circuito"
        loadCycleLabel="Ordinário"
        objectiveLabel="Força"
      />
    );

    const region = screen.getByRole('region', { name: 'Indicadores do resumo da semana' });
    for (const value of ['70%', '12', '10', '2', 'Alternado por Segmento', 'Circuito', 'Ordinário', 'AB', '3x/sem', 'Força']) {
      expect(within(region).getByText(value)).toBeInTheDocument();
    }
    expect(region.firstElementChild).toHaveClass('grid');
    expect(region.firstElementChild).not.toHaveClass('overflow-x-auto');
  });

  it('exibe traço quando o resumo ainda não possui valor', () => {
    render(<WeeklySummaryCards summary={null} />);
    const region = screen.getByRole('region', { name: 'Indicadores do resumo da semana' });
    expect(within(region).getAllByText('-')).toHaveLength(10);
  });
});
