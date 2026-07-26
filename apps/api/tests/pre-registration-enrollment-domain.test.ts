import {
  areNamesSimilar,
  classifyDuplicateSignals,
} from '../src/modules/pre-registration-enrollment/pre-registration-enrollment.service.js';

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
});
