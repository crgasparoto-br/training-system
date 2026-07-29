import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildIssue275IntegratedE2ESource } from '../scripts/issue-275-integrated-e2e-source.js';

describe('Issue 275 integrated concurrency source', () => {
  const template = readFileSync(
    path.resolve(process.cwd(), 'scripts/verify-issue-275-integrated-e2e.source.ts'),
    'utf8'
  );
  const source = buildIssue275IntegratedE2ESource(template);

  it('uses the canonical lead identity for both concurrent accounts', () => {
    expect(source.match(/name: claimLead\.identity\.name/g)).toHaveLength(2);
    expect(source).not.toContain('name: accountA.name');
    expect(source).not.toContain('name: accountB.name');
  });

  it('records the responses and verifies the committed transactional state', () => {
    expect(source).toContain('concurrency-claim-outcomes.json');
    expect(source).toContain("['ACCOUNT_ALREADY_LINKED', 'ACCOUNT_INCOMPATIBLE']");
    expect(source).toContain('linkedEvents === 1');
    expect(source).toContain('claimedUsers.length === 1');
    expect(source).toContain('claimedUsers[0]?.id === linkedClaim?.userId');
    expect(source).toContain('claimPersistedUserCount: claimedUsers.length');
  });
});
