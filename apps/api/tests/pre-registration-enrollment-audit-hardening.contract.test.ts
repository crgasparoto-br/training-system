import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const migration = read(
  'apps/api/prisma/migrations/20260727170000_issue_274_audit_hardening/migration.sql'
);
const enrollmentService = read(
  'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment.service.ts'
);
const lifecycleService = read(
  'apps/api/src/modules/alunos/student-lifecycle-enrollment.service.ts'
);
const adminService = read(
  'apps/api/src/modules/pre-registration-admin/pre-registration-admin.service.ts'
);
const enrollmentRoutes = read(
  'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment.routes.ts'
);
const adminEdit = read(
  'apps/web/src/pages/PreRegistrationAdmin/PreRegistrationAdminEdit.tsx'
);
const adminList = read(
  'apps/web/src/pages/PreRegistrationAdmin/PreRegistrationAdminList.tsx'
);
const enrollmentDetail = read(
  'apps/web/src/pages/PreRegistrationAdmin/PreRegistrationEnrollmentDetail.tsx'
);
const studentDetail = read('apps/web/src/pages/AlunoDetails.tsx');
const executionPlan = read(
  'docs/execution-plans/active/2026-07-issue-274-enrollment-conversion.md'
);

describe('issue 274 independent-audit hardening contract', () => {
  it('prevents canonical chains both for existing data and later concurrent updates', () => {
    expect(migration).toContain(
      'canonical duplicate graph contains orphan, self-link, cross-tenant link or chain'
    );
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain(
      'a referenced canonical target cannot become a duplicate source'
    );
    expect(migration).toContain('target."canonicalAlunoId" IS NOT NULL');
  });

  it('invalidates review after every commercial field used by the review changes', () => {
    expect(migration).toContain('OLD."leadOrigin" IS DISTINCT FROM NEW."leadOrigin"');
    expect(migration).toContain('OLD."professorId" IS DISTINCT FROM NEW."professorId"');
    expect(migration).toContain(
      "OLD.\"identificationData\" #> '{_leadCommercial}'"
    );
    expect(migration).toContain(
      "NEW.\"identificationData\" #> '{_leadCommercial}'"
    );
  });

  it('requires current consent and revalidates access in the write transaction', () => {
    expect(lifecycleService).toContain(
      'privacyNoticeVersion === PRE_REGISTRATION_PRIVACY_NOTICE_VERSION'
    );
    expect(enrollmentService).toContain('assertActorAccess(actor, tx');
    expect(enrollmentService).toContain('buildProfessorDataScopeWhere(');
  });

  it('uses the full candidate set and canonical name normalization in every decision', () => {
    expect(enrollmentService).not.toContain('MAX_CANDIDATES');
    expect(enrollmentService).not.toContain('matched.slice(');
    expect(enrollmentService).toContain('fingerprintFor(sourceIdentity, sourceUserId, matched)');
    expect(enrollmentService).toContain('canonicalNormalizedName(source.name)');
    expect(enrollmentService).toContain("'da', 'das', 'de', 'do', 'dos', 'e'");
  });

  it('supports audited, versioned confirmation for reviewable commercial edits', () => {
    expect(enrollmentRoutes).toContain("'/leads/:id/duplicates'");
    expect(adminService).toContain(
      'input.expectedDuplicateVersion !== detection.recordVersion'
    );
    expect(adminService).toContain(
      'input.confirmedDuplicateFingerprint !== detection.fingerprint'
    );
    expect(adminService).toContain('confirmedDuplicateReason');
    expect(adminService).toContain('duplicateReview');
    expect(adminEdit).toContain('checkUpdateDuplicates');
    expect(adminEdit).toContain('Revisão de duplicidade necessária');
  });

  it('validates account compatibility against the final canonical identity before transfer', () => {
    expect(enrollmentService).toContain('findStudentAccountIdentityMismatches(');
    expect(enrollmentService).toContain(
      'A conta da pré-matrícula não é compatível com a identidade final do cadastro canônico.'
    );
    expect(enrollmentService.indexOf('findStudentAccountIdentityMismatches(')).toBeLessThan(
      enrollmentService.indexOf(
        'await tx.aluno.update({ where: { id: alunoId }, data: { userId: null } });'
      )
    );
  });

  it('exposes a complete permission-aware review and converted-student flow', () => {
    expect(enrollmentDetail).toContain('Identificação e processo');
    expect(enrollmentDetail).toContain('Histórico relevante');
    expect(enrollmentDetail).toContain('privacyNoticeVersion');
    expect(enrollmentDetail).toContain('canOpenClinicalArea');
    expect(adminList).toContain("lead.status === 'ACTIVE_STUDENT'");
    expect(adminList).toContain('/central-do-aluno/');
    expect(studentDetail).toContain(
      "new URLSearchParams(location.search).get('matricula') === 'confirmada'"
    );
    expect(studentDetail).toContain('Matrícula confirmada');
  });

  it('keeps the execution plan tied to the final PR head instead of a stale SHA', () => {
    expect(executionPlan).toContain('HEAD final da PR');
    expect(executionPlan).not.toContain('320307033a097d4ac2e83fd1161ba26c02e76bd4');
  });
});
