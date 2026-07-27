import {
  isValidStudentCpf,
  normalizeStudentCpf,
  normalizeStudentPhone,
} from '../src/modules/alunos/student-identity.service.js';
import {
  areNamesSimilar,
  classifyDuplicateSignals,
} from '../src/modules/pre-registration-enrollment/pre-registration-enrollment.service.js';
import { hasCurrentPreRegistrationConsent } from '../src/modules/alunos/student-lifecycle-enrollment.service.js';
import { PRE_REGISTRATION_PRIVACY_NOTICE_VERSION } from '../src/modules/pre-registration-public/pre-registration-policy.js';

describe('pre-registration enrollment duplicate classification', () => {
  it('keeps name-only similarity informational', () => {
    expect(areNamesSimilar('João da Silva', 'Joao Silva')).toBe(true);
    expect(classifyDuplicateSignals([
      { classification: 'INFORMATIONAL' },
    ])).toBe('INFORMATIONAL');
  });

  it('makes exact identifiers reviewable and CPF/account conflicts blocking', () => {
    expect(classifyDuplicateSignals([
      { classification: 'INFORMATIONAL' },
      { classification: 'REVIEW_REQUIRED' },
    ])).toBe('REVIEW_REQUIRED');
    expect(classifyDuplicateSignals([
      { classification: 'REVIEW_REQUIRED' },
      { classification: 'BLOCKING' },
    ])).toBe('BLOCKING');
  });

  it('validates CPF check digits before using the identifier as blocking evidence', () => {
    expect(isValidStudentCpf('529.982.247-25')).toBe(true);
    expect(normalizeStudentCpf('529.982.247-25')).toBe('52998224725');
    expect(isValidStudentCpf('529.982.247-24')).toBe(false);
    expect(normalizeStudentCpf('529.982.247-24')).toBeUndefined();
    expect(normalizeStudentCpf('111.111.111-11')).toBeUndefined();
  });

  it('canonicalizes phones with country and DDD and rejects local-only numbers', () => {
    expect(normalizeStudentPhone('(15) 99999-0000')).toBe('5515999990000');
    expect(normalizeStudentPhone('+55 15 99999-0000')).toBe('5515999990000');
    expect(normalizeStudentPhone('015 15 99999-0000')).toBe('5515999990000');
    expect(normalizeStudentPhone('+1 415 555 2671')).toBe('14155552671');
    expect(normalizeStudentPhone('99999-0000')).toBeUndefined();
  });

  it('accepts only the current privacy notice version as a valid consent', () => {
    const acceptedAt = new Date('2026-07-27T12:00:00.000Z');
    expect(
      hasCurrentPreRegistrationConsent(
        PRE_REGISTRATION_PRIVACY_NOTICE_VERSION,
        acceptedAt
      )
    ).toBe(true);
    expect(hasCurrentPreRegistrationConsent('2026-06', acceptedAt)).toBe(false);
    expect(
      hasCurrentPreRegistrationConsent(
        PRE_REGISTRATION_PRIVACY_NOTICE_VERSION,
        null
      )
    ).toBe(false);
  });
});
