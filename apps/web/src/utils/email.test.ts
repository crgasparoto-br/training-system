import { describe, expect, it } from 'vitest';
import { isValidEmail } from './email';

describe('isValidEmail', () => {
  it('aceita e-mails válidos', () => {
    expect(isValidEmail('aluno@exemplo.com')).toBe(true);
    expect(isValidEmail('  aluno@exemplo.com  ')).toBe(true);
  });

  it('rejeita e-mails sem @ ou sem domínio', () => {
    expect(isValidEmail('aluno.exemplo.com')).toBe(false);
    expect(isValidEmail('aluno@exemplo')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});
