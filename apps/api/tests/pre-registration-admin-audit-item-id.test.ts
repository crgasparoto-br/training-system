import { opaquePreRegistrationAuditItemId } from '../src/modules/pre-registration-admin/pre-registration-admin.service.js';

describe('pre-registration administrative audit item id', () => {
  it('does not expose the raw internal event id or accidental sensitive-word substrings', () => {
    const rawId = 'cms6cpf0j000mmq6gq3ir0jhx';
    const opaqueId = opaquePreRegistrationAuditItemId(rawId);

    expect(opaqueId).toMatch(/^[a-f0-9]{64}$/);
    expect(opaqueId).not.toBe(rawId);
    expect(opaqueId).not.toMatch(/tokenHash|actorUserId|actorProfessorId|payload|cpf|phone|email/i);
  });

  it('is stable for pagination and rendering keys', () => {
    expect(opaquePreRegistrationAuditItemId('event-1')).toBe(
      opaquePreRegistrationAuditItemId('event-1')
    );
    expect(opaquePreRegistrationAuditItemId('event-1')).not.toBe(
      opaquePreRegistrationAuditItemId('event-2')
    );
  });
});
