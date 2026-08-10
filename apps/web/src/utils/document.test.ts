import { describe, expect, it } from 'vitest';
import { formatBrazilianDocument, isValidCpf } from './document';

describe('formatBrazilianDocument', () => {
  it('formata CPF conforme o usuário digita', () => {
    expect(formatBrazilianDocument('52998224725', 'cpf')).toBe('529.982.247-25');
  });
});

describe('isValidCpf', () => {
  it('aceita um CPF válido', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
  });

  it('rejeita CPF com dígito verificador incorreto', () => {
    expect(isValidCpf('529.982.247-26')).toBe(false);
  });

  it('rejeita CPF com todos os dígitos iguais', () => {
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });

  it('rejeita CPF com quantidade de dígitos incorreta', () => {
    expect(isValidCpf('123')).toBe(false);
  });
});
