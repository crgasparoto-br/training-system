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
const publicService = readFileSync(
  resolve(
    root,
    'apps/api/src/modules/pre-registration-public/pre-registration-public.service.ts'
  ),
  'utf8'
);
const publicRoutes = readFileSync(
  resolve(
    root,
    'apps/api/src/modules/pre-registration-public/pre-registration-public.routes.ts'
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

  it('runs claim detection after the invite lock and before account linkage', () => {
    const inviteIndex = publicService.indexOf('const aluno = await tx.aluno.findFirst');
    const detectorIndex = publicService.indexOf('await detectPreRegistrationDuplicates(tx, {');
    const linkIndex = publicService.indexOf('const linked = await tx.aluno.updateMany');

    expect(detectorIndex).toBeGreaterThan(inviteIndex);
    expect(detectorIndex).toBeLessThan(linkIndex);
    expect(publicService).not.toContain('inspectByInviteToken');
  });

  it('applies rate limiting before parsing and processing public registration', () => {
    const route = publicRoutes.slice(
      publicRoutes.indexOf("'/pre-cadastro/:token/register'"),
      publicRoutes.indexOf("authenticatedRouter.use")
    );
    expect(route.indexOf('preRegistrationInviteRateLimit')).toBeLessThan(
      route.indexOf("express.json({ limit: '32kb' })")
    );
  });
});
