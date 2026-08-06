import { describe, expect, it } from 'vitest';
import { formatPhoneInput, isValidBrazilianPhone } from './phone';

describe('formatPhoneInput', () => {
  it('formata celular com 11 dígitos', () => {
    expect(formatPhoneInput('11912345678')).toBe('(11) 91234-5678');
  });

  it('formata fixo com 10 dígitos', () => {
    expect(formatPhoneInput('1123456789')).toBe('(11) 2345-6789');
  });

  it('ignora caracteres não numéricos e limita a 11 dígitos', () => {
    expect(formatPhoneInput('(11) 91234-5678extra')).toBe('(11) 91234-5678');
  });
});

describe('isValidBrazilianPhone', () => {
  it('aceita celular válido com DDD e nono dígito', () => {
    expect(isValidBrazilianPhone('(11) 91234-5678')).toBe(true);
  });

  it('aceita fixo válido com DDD', () => {
    expect(isValidBrazilianPhone('(11) 2345-6789')).toBe(true);
  });

  it('rejeita DDD inválido', () => {
    expect(isValidBrazilianPhone('(01) 91234-5678')).toBe(false);
  });

  it('rejeita celular de 11 dígitos sem o nono dígito 9', () => {
    expect(isValidBrazilianPhone('11812345678')).toBe(false);
  });

  it('rejeita quantidade de dígitos incorreta', () => {
    expect(isValidBrazilianPhone('123456')).toBe(false);
  });
});
