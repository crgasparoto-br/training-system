import api from './api';
import type { HourlyRateLevel, HourlyRateLevelCode } from '@corrida/types';

type UpdateHourlyRateLevelPayload = {
  id: string;
  label: string;
  code: HourlyRateLevelCode;
  order: number;
  minValue: number | null;
  maxValue: number | null;
};

function normalizeNumericValue(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') {
    return value as null | undefined;
  }

  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value);
    return Number.isNaN(parsedValue) ? null : parsedValue;
  }

  return null;
}

function normalizeHourlyRateLevels(levels: HourlyRateLevel[]): HourlyRateLevel[] {
  return levels.map((level) => ({
    ...level,
    minValue: normalizeNumericValue(level.minValue),
    maxValue: normalizeNumericValue(level.maxValue),
  }));
}

export const hourlyRateLevelService = {
  async list(): Promise<HourlyRateLevel[]> {
    const response = await api.get<{ success: boolean; data: HourlyRateLevel[] }>('/hourly-rate-levels');
    return normalizeHourlyRateLevels(response.data.data);
  },

  async create(): Promise<HourlyRateLevel[]> {
    const response = await api.post<{ success: boolean; data: HourlyRateLevel[] }>('/hourly-rate-levels');
    return normalizeHourlyRateLevels(response.data.data);
  },

  async update(levels: UpdateHourlyRateLevelPayload[]): Promise<HourlyRateLevel[]> {
    const response = await api.put<{ success: boolean; data: HourlyRateLevel[] }>(
      '/hourly-rate-levels',
      { levels }
    );
    return normalizeHourlyRateLevels(response.data.data);
  },

  async remove(id: string): Promise<HourlyRateLevel[]> {
    const response = await api.delete<{ success: boolean; data: HourlyRateLevel[] }>(
      `/hourly-rate-levels/${id}`
    );
    return normalizeHourlyRateLevels(response.data.data);
  },
};