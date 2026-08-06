import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HourlyRateLevel } from '@corrida/types';
import { settingsHourlyRateLevelsCopy } from '../../i18n/ptBR';
import { hourlyRateLevelService } from '../../services/hourly-rate-level.service';
import SettingsHourlyRateLevels from './HourlyRateLevels';

vi.mock('../../services/hourly-rate-level.service', () => ({
  hourlyRateLevelService: {
    list: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));

const configuredLevel = {
  id: 'level-bronze',
  code: 'bronze',
  label: 'Bronze',
  order: 1,
  minValue: 50,
  maxValue: 99.99,
  isActive: true,
} as HourlyRateLevel;

describe('SettingsHourlyRateLevels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hourlyRateLevelService.list).mockResolvedValue([configuredLevel]);
    vi.mocked(hourlyRateLevelService.create).mockResolvedValue([configuredLevel]);
    vi.mocked(hourlyRateLevelService.update).mockResolvedValue([configuredLevel]);
    vi.mocked(hourlyRateLevelService.remove).mockResolvedValue([]);
  });

  it('identifica os campos da tabela pelo nível e reserva a tabela para desktop amplo', async () => {
    render(<SettingsHourlyRateLevels />);

    await waitFor(() => {
      expect(screen.getByLabelText(`${settingsHourlyRateLevelsCopy.levelNameColumn} de Bronze`)).toBeInTheDocument();
    });

    expect(
      screen.getByLabelText(`${settingsHourlyRateLevelsCopy.minValueColumn} de Bronze`)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(`${settingsHourlyRateLevelsCopy.maxValueColumn} de Bronze`)
    ).toBeInTheDocument();

    expect(screen.getByRole('table').parentElement).toHaveClass('xl:block');
    expect(screen.getByRole('button', { name: settingsHourlyRateLevelsCopy.addLevel })).toBeInTheDocument();
  });

  it('orienta a criação quando ainda não existem níveis', async () => {
    vi.mocked(hourlyRateLevelService.list).mockResolvedValue([]);

    render(<SettingsHourlyRateLevels />);

    await waitFor(() => {
      expect(screen.getAllByText('Nenhum nível cadastrado').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByRole('button', { name: 'Criar primeiro nível' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: settingsHourlyRateLevelsCopy.save })).toBeDisabled();
  });

  it('anuncia falhas de carregamento como alerta', async () => {
    vi.mocked(hourlyRateLevelService.list).mockRejectedValue(new Error('falha'));

    render(<SettingsHourlyRateLevels />);

    expect(await screen.findByRole('alert')).toHaveTextContent(settingsHourlyRateLevelsCopy.loadError);
  });
});
