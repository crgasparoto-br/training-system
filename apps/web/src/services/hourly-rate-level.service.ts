import api from './api';
import type { HourlyRateLevel, HourlyRateLevelCode } from '@corrida/types';

type UpdateHourlyRateLevelPayload = {
  code: HourlyRateLevelCode;
  minValue: number | null;
  maxValue: number | null;
};

export const hourlyRateLevelService = {
  async list(): Promise<HourlyRateLevel[]> {
    const response = await api.get<{ success: boolean; data: HourlyRateLevel[] }>('/hourly-rate-levels');
    return response.data.data;
  },

  async update(levels: UpdateHourlyRateLevelPayload[]): Promise<HourlyRateLevel[]> {
    const response = await api.put<{ success: boolean; data: HourlyRateLevel[] }>(
      '/hourly-rate-levels',
      { levels }
    );
    return response.data.data;
  },
};