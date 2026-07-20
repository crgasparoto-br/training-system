import { describe, expect, it } from 'vitest';
import type { HourlyRateLevel } from '@corrida/types';
import {
  formatCollaboratorRateInput,
  getCollaboratorHourlyRateLevelLabel,
  isValidCollaboratorRateInput,
  parseCollaboratorRateInput,
} from './collaborator-hourly-rates';

const levels = [
  { id: 'bronze', label: 'Bronze', order: 1, minValue: 0, maxValue: 99.99, isActive: true },
  { id: 'ouro', label: 'Ouro', order: 2, minValue: 100, maxValue: 199.99, isActive: true },
] as HourlyRateLevel[];

describe('collaborator hourly rates', () => {
  it('aceita os formatos monetários suportados', () => {
    expect(parseCollaboratorRateInput('1.234,56')).toBe(1234.56);
    expect(parseCollaboratorRateInput('100.50')).toBe(100.5);
    expect(formatCollaboratorRateInput('1000')).toBe('1.000,00');
  });

  it('rejeita valor negativo ou texto inválido', () => {
    expect(isValidCollaboratorRateInput('-1')).toBe(false);
    expect(isValidCollaboratorRateInput('abc')).toBe(false);
    expect(isValidCollaboratorRateInput('')).toBe(true);
  });

  it('classifica o valor conforme as faixas configuradas', () => {
    expect(getCollaboratorHourlyRateLevelLabel('80,00', levels)).toBe('Bronze');
    expect(getCollaboratorHourlyRateLevelLabel('150,00', levels)).toBe('Ouro');
    expect(getCollaboratorHourlyRateLevelLabel('250,00', levels)).toBe('Não classificado');
  });
});
