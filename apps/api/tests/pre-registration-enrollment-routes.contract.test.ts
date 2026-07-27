import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const main = readFileSync(resolve(root, 'apps/api/src/main.ts'), 'utf8');
const routes = readFileSync(
  resolve(root, 'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment.routes.ts'),
  'utf8'
);
const service = readFileSync(
  resolve(root, 'apps/api/src/modules/pre-registration-enrollment/pre-registration-enrollment.service.ts'),
  'utf8'
);

describe('issue 274 route and transaction contract', () => {
  it('mounts the public entry route directly so rate limiting runs before deduplication', () => {
    expect(main).not.toContain('preRegistrationPublicDeduplicationGuardRoutes');
    expect(main).toContain("app.use('/api/v1', preRegistrationPublicEntryRoutes)");
    expect(main.indexOf('preRegistrationEnrollmentRoutes')).toBeLessThan(
      main.indexOf('preRegistrationAdminRoutes)')
    );
  });

  it('intercepts legacy review and conversion entrypoints', () => {
    expect(routes).toContain("'/leads/:id/review'");
    expect(routes).toContain("'/leads/:id/convert'");
    expect(routes).toContain("'/leads/:id/duplicate-decision'");
  });

  it('keeps final activation serializable, idempotent and side-effect bounded', () => {
    expect(service).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(service).toContain("status === 'ACTIVE_STUDENT'");
    expect(service).toContain("downstreamCreation: 'NONE'");
    expect(service).not.toContain('studentContract.create');
    expect(service).not.toContain('agendaBooking.create');
  });

  it('allows review loading with either review or conversion capability', () => {
    expect(routes).toContain("'students.preRegistration.review'");
    expect(routes).toContain("'students.preRegistration.convert'");
    expect(routes).toContain("'/leads/:id/enrollment-review'");
  });
});
