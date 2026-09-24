import { describe, expect, it } from 'vitest';
import {
  formatCpf,
  formatRg,
  maritalStatusOptions,
  normalizeMaritalStatus,
  normalizeSocialNetwork,
  socialAccountPlaceholder,
  socialNetworkLabel,
} from './studentPersonalInfo';

describe('studentPersonalInfo', () => {
  it('formats CPF progressively and limits the input to 11 digits', () => {
    expect(formatCpf('13951354879')).toBe('139.513.548-79');
    expect(formatCpf('13951354879000')).toBe('139.513.548-79');
    expect(formatCpf('13951')).toBe('139.51');
  });

  it('formats RG progressively and preserves an alphanumeric check digit', () => {
    expect(formatRg('207433963')).toBe('20.743.396-3');
    expect(formatRg('20743396x')).toBe('20.743.396-X');
    expect(formatRg('20.743.396-3')).toBe('20.743.396-3');
    expect(formatRg('20A743396x')).toBe('20.743.396-X');
    expect(formatRg('A20743396x')).toBe('20.743.396-X');
  });

  it('uses canonical values while keeping the Portuguese labels in the select', () => {
    expect(maritalStatusOptions).toEqual([
      { value: '', label: 'Não informado' },
      { value: 'single', label: 'Solteiro(a)' },
      { value: 'married', label: 'Casado(a)' },
      { value: 'stable_union', label: 'União estável' },
      { value: 'divorced', label: 'Divorciado(a)' },
      { value: 'separated', label: 'Separado(a)' },
      { value: 'widowed', label: 'Viúvo(a)' },
      { value: 'other', label: 'Outro' },
    ]);

    expect(normalizeMaritalStatus('Solteiro(a)')).toBe('single');
    expect(normalizeMaritalStatus('Casado(a)')).toBe('married');
    expect(normalizeMaritalStatus('União estável')).toBe('stable_union');
    expect(normalizeMaritalStatus('Divorciado(a)')).toBe('divorced');
    expect(normalizeMaritalStatus('Separado(a)')).toBe('separated');
    expect(normalizeMaritalStatus('Viúvo(a)')).toBe('widowed');
    expect(normalizeMaritalStatus('Outro')).toBe('other');
  });

  it('preserves canonical values and unknown legacy values', () => {
    expect(normalizeMaritalStatus('married')).toBe('married');
    expect(normalizeMaritalStatus('single')).toBe('single');
    expect(normalizeMaritalStatus('Casado')).toBe('Casado');
    expect(normalizeMaritalStatus('uniao estavel')).toBe('uniao estavel');
    expect(normalizeMaritalStatus('Viúvo')).toBe('Viúvo');
    expect(normalizeMaritalStatus('Outro valor legado')).toBe('Outro valor legado');
    expect(normalizeMaritalStatus(undefined)).toBe('');
    expect(normalizeMaritalStatus('')).toBe('');
  });

  it('assumes Instagram for legacy accounts that did not store a network', () => {
    expect(normalizeSocialNetwork(undefined, '@aluno')).toBe('instagram');
    expect(normalizeSocialNetwork('', '@aluno')).toBe('instagram');
    expect(normalizeSocialNetwork('   ', '@aluno')).toBe('instagram');
    expect(normalizeSocialNetwork('linkedin', '@aluno')).toBe('linkedin');
    expect(normalizeSocialNetwork(undefined, '')).toBe('');
  });

  it('keeps the empty-network label consistent with the controlled option', () => {
    expect(socialNetworkLabel(undefined)).toBe('Não informado');
    expect(socialNetworkLabel('')).toBe('Não informado');
  });

  it('adapts the account placeholder to the selected network', () => {
    expect(socialAccountPlaceholder('instagram')).toBe('@usuario');
    expect(socialAccountPlaceholder('linkedin')).toBe('Nome ou URL do perfil');
    expect(socialAccountPlaceholder('other')).toBe('Conta, usuário ou URL');
  });
});
