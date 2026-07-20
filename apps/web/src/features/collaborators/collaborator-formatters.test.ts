import { describe, expect, it } from 'vitest';
import {
  formatCollaboratorBankAccount,
  formatCollaboratorCompanyDocument,
  formatCollaboratorCpf,
  formatCollaboratorPhone,
  formatCollaboratorRg,
  normalizeCollaboratorInstagram,
} from './collaborator-formatters';

describe('collaborator formatters', () => {
  it('aplica máscaras sem perder o valor digitado', () => {
    expect(formatCollaboratorPhone('15999999999')).toBe('(15) 99999-9999');
    expect(formatCollaboratorCpf('12345678900')).toBe('123.456.789-00');
    expect(formatCollaboratorRg('12345678X')).toBe('12.345.678-X');
    expect(formatCollaboratorCompanyDocument('12345678000190')).toBe('12.345.678/0001-90');
    expect(formatCollaboratorBankAccount('123456')).toBe('12345-6');
  });

  it('normaliza o Instagram sem duplicar o arroba', () => {
    expect(normalizeCollaboratorInstagram('usuario')).toBe('@usuario');
    expect(normalizeCollaboratorInstagram('@usuario')).toBe('@usuario');
    expect(normalizeCollaboratorInstagram('')).toBe('');
  });
});
