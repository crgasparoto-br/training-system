import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const routes = readFileSync(
  resolve(root, 'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment.routes.ts'),
  'utf8'
);
const create = readFileSync(
  resolve(root, 'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.ts'),
  'utf8'
);
const service = readFileSync(
  resolve(root, 'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment.service.ts'),
  'utf8'
);
const adminService = readFileSync(
  resolve(root, 'apps/api/src/modules/pre-registration-admin/pre-registration-admin.service.ts'),
  'utf8'
);
const response = readFileSync(
  resolve(root, 'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment-response.service.ts'),
  'utf8'
);

describe('issue 274 authorization and creation decision contract', () => {
  it('revalidates capability and source visibility inside the transaction', () => {
    expect(routes).toContain('assertPreRegistrationAlunoVisible');
    expect(service).toContain('assertActorAccess(actor, tx');
    expect(service).toContain('canProfessorAccessBlock(accessProfessor, blockKey, client)');
    expect(service).toContain('buildProfessorDataScopeWhere(');
    expect(adminService).toContain('const access = await accessFor(actor, tx)');
    expect(adminService).toContain('FOR UPDATE');
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

  it('requires visibility of every candidate before a creation false-positive decision', () => {
    expect(create).toContain('visiblePreRegistrationCandidateIds');
    expect(create).toContain('visibleIds.size !== detection.candidates.length');
    expect(create).toContain("'FORBIDDEN'");
  });

  it('does not expose a public duplicate oracle before the real claim route', () => {
    expect(routes).not.toContain('publicDuplicateResponse');
    expect(routes).not.toContain('inspectByInviteToken');
    expect(routes).not.toContain('preRegistrationPublicDeduplicationGuardRoutes');
  });
});
