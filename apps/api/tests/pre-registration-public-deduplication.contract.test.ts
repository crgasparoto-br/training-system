import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const atomicService = readFileSync(
  resolve(
    root,
    'apps/api/src/modules/pre-registration-public/pre-registration-public-atomic.service.ts'
  ),
  'utf8'
);

describe('issue 274 public identity deduplication contract', () => {
  it('runs the canonical detector before public identity persistence', () => {
    const detectorIndex = atomicService.indexOf(
      'const detection = await detectPreRegistrationDuplicates(tx, {'
    );
    const persistenceIndex = atomicService.indexOf(
      'const identity = await upsertStudentIdentity('
    );

    expect(atomicService).toContain(
      "import { detectPreRegistrationDuplicates } from '../pre-registration-enrollment/pre-registration-enrollment.service.js';"
    );
    expect(atomicService).toContain(
      "input.step === 'IDENTIFICATION' || input.step === 'CONTACT'"
    );
    expect(detectorIndex).toBeGreaterThan(-1);
    expect(detectorIndex).toBeLessThan(persistenceIndex);
  });

  it('keeps public duplicate errors generic', () => {
    expect(atomicService).toContain("'DUPLICATE_REVIEW_REQUIRED'");
    expect(atomicService).toContain('{ reviewRequired: true }');
    expect(atomicService).not.toContain('candidateAlunoIds: detection.candidates');
  });
});
