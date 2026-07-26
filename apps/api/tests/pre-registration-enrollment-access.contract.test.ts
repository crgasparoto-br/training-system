import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const routes = readFileSync(
  resolve(root, 'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment.routes.ts'),
  'utf8'
);
const access = readFileSync(
  resolve(root, 'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment-access.service.ts'),
  'utf8'
);
const create = readFileSync(
  resolve(root, 'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.ts'),
  'utf8'
);
const response = readFileSync(
  resolve(root, 'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment-response.service.ts'),
  'utf8'
);

describe('issue 274 authorization and creation decision contract', () => {
  it('revalidates source visibility before administrative actions', () => {
    expect(routes).toContain('assertPreRegistrationAlunoVisible');
    expect(access).toContain('getEffectiveDataScopeForProfessor');
    expect(access).toContain('buildProfessorDataScopeWhere');
    expect(access).toContain("throw new PreRegistrationEnrollmentError('Recurso não encontrado.'");
  });

  it('does not return candidates outside the actor data scope', () => {
    expect(response).toContain('visiblePreRegistrationCandidateIds');
    expect(response).toContain('restrictedCandidateCount');
    expect(response).toContain('.filter((candidate) => visibleIds.has(candidate.candidateAlunoId))');
  });

  it('records a reasoned false-positive decision in the lead creation transaction', () => {
    expect(create).toContain('confirmedDuplicateReason');
    expect(create).toContain("kind: 'DEDUPLICATION_DECISION'");
    expect(create).toContain("action: 'CONFIRM_DIFFERENT'");
    expect(create).toContain("decisionPoint: 'LEAD_CREATION'");
    expect(create).toContain('Prisma.TransactionIsolationLevel.Serializable');
  });

  it('keeps the public duplicate response generic', () => {
    const publicResponse = routes.slice(
      routes.indexOf('function publicDuplicateResponse'),
      routes.indexOf("preRegistrationPublicDeduplicationGuardRoutes.post(")
    );
    expect(publicResponse).toContain('reviewRequired: true');
    expect(publicResponse).not.toContain('candidateAlunoId');
    expect(publicResponse).not.toContain('fingerprint');
  });
});
