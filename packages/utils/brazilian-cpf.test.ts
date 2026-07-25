import { describe, expect, it } from 'vitest';
import {
  isValidBrazilianCpf,
  isValidIsoDateOnly,
  normalizeBrazilianCpf,
  normalizeIsoDateOnly,
} from './brazilian-cpf.js';

describe('shared Brazilian CPF validation', () => {
  it.each([
    ['', false],
    ['1', false],
    ['123456789012', false],
    ['11111111111', false],
    ['12345678909', true],
    ['529.982.247-25', true],
  ])('validates %s without accepting malformed identifiers', (value, expected) => {
    expect(isValidBrazilianCpf(value)).toBe(expected);
  });

  it('normalizes formatted CPF to the canonical 11 digits', () => {
    expect(normalizeBrazilianCpf('529.982.247-25')).toBe('52998224725');
  });
});

describe('shared date-only validation', () => {
  it.each([
    ['', false],
    ['2026-02-31', false],
    ['2024-02-29', true],
    ['1990-01-01T00:00:00.000Z', true],
  ])('validates %s as a real calendar date', (value, expected) => {
    expect(isValidIsoDateOnly(value)).toBe(expected);
  });

  it('normalizes an ISO timestamp to the canonical date-only value', () => {
    expect(normalizeIsoDateOnly('1990-01-01T00:00:00.000Z')).toBe('1990-01-01');
  });
});
