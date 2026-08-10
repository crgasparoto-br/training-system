import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeStudentBirthDate,
} from '../src/modules/alunos/student-identity.service.js';

describe('student identity civil birth date', () => {
  it('preserves the declared civil day instead of converting the timezone offset', () => {
    expect(normalizeStudentBirthDate('2000-01-01T23:30:00-03:00')).toBe(
      '2000-01-01T00:00:00.000Z'
    );
    expect(normalizeStudentBirthDate('2000-01-01')).toBe('2000-01-01T00:00:00.000Z');
  });

  it('rejects invalid civil dates', () => {
    expect(() => normalizeStudentBirthDate('2026-02-30')).toThrow(
      'Data de nascimento inválida'
    );
    expect(() => normalizeStudentBirthDate('01/02/2026')).toThrow(
      'Data de nascimento inválida'
    );
  });

  it('keeps the public API contract strict', () => {
    const routes = readFileSync(
      resolve(
        __dirname,
        '../src/modules/pre-registration-public/pre-registration-public.routes.ts'
      ),
      'utf8'
    );
    expect(routes).toMatch(
      /birthDate: nullableTrimmed\(\s*z\.string\(\)\.trim\(\)\.regex\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//
    );
  });
});
