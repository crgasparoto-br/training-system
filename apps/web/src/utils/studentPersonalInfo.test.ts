import { describe, expect, it } from 'vitest';
import {
  formatCpf,
  formatRg,
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

  it('normalizes common legacy marital-status values without discarding unknown values', () => {
    expect(normalizeMaritalStatus('Casado')).toBe('Casado(a)');
    expect(normalizeMaritalStatus('uniao estavel')).toBe('União estável');
    expect(normalizeMaritalStatus('Viúvo')).toBe('Viúvo(a)');
    expect(normalizeMaritalStatus('Outro valor legado')).toBe('Outro valor legado');
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
