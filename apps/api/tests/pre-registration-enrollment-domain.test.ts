import {
  isValidStudentCpf,
  normalizeStudentCpf,
  normalizeStudentPhone,
} from '../src/modules/alunos/student-identity.service.js';
import {
  areNamesSimilar,
  buildDuplicateSignals,
  classifyDuplicateSignals,
  detectPreRegistrationDuplicates,
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

  it('classifies canonical name plus birth date as review required across accents and particles', () => {
    const signals = buildDuplicateSignals(
      { name: '  João   da Silva ', birthDate: '1990-05-10' },
      undefined,
      { name: 'Joao Silva', birthDate: '1990-05-10T23:00:00.000Z' },
      null
    );

    expect(signals).toContainEqual(
      expect.objectContaining({
        code: 'NAME_AND_BIRTH_DATE',
        classification: 'REVIEW_REQUIRED',
      })
    );
    expect(signals).not.toContainEqual(
      expect.objectContaining({ code: 'NAME_SIMILAR' })
    );
  });

  it('keeps every matched candidate in classification and fingerprint beyond 25 records', async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({
      id: `candidate-${String(index + 1).padStart(2, '0')}`,
      leadName: `Pessoa ${index + 1}`,
      leadCpf: null,
      leadPhone: '(15) 99999-0000',
      leadAdditionalPhone: null,
      leadEmail: null,
      leadAdditionalEmail: null,
      birthDate: null,
      studentProfile: null,
      userId: null,
      status: 'LEAD',
      createdAt: new Date(`2026-07-${String((index % 20) + 1).padStart(2, '0')}T10:00:00.000Z`),
      updatedAt: new Date(`2026-07-${String((index % 20) + 1).padStart(2, '0')}T11:00:00.000Z`),
    }));
    const client = {
      aluno: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };

    const detection = await detectPreRegistrationDuplicates(client as never, {
      contractId: 'contract-1',
      overrides: { phone: '(15) 99999-0000' },
    });

    expect(detection.candidates).toHaveLength(26);
    expect(detection.candidates.map(({ candidateAlunoId }) => candidateAlunoId)).toContain(
      'candidate-26'
    );
    expect(detection.classification).toBe('REVIEW_REQUIRED');
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
