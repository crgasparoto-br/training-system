import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyIssue487BrowserEvidence } from './verify-issue-487-browser-evidence.mjs';

const sha = 'a'.repeat(40);
const sizes = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'mobile-390x844', width: 390, height: 844 },
];
function fixture(testCase) {
  const folder = mkdtempSync(path.join(tmpdir(), 'issue487-evidence-'));
  const imageDirectory = path.join(folder, 'images');
  const logFile = path.join(folder, 'full-tests.log');
  mkdirSync(imageDirectory);
  const evidence = {
    kind: 'issue-487-browser-evidence', result: 'PASS', identity: { headSha: sha },
    browser: 'Chrome/156.0.0.0',
    verified: ['keyboard-tab-navigation', 'no-horizontal-overflow', 'one-unit-at-a-time',
      'group-round-context', 'overview-return-position', 'next-participant-before-final-rest',
      'timeout-overview-retry-idempotent', 'no-rest-after-final-set', 'x-contract-id'],
    scenarios: sizes.map((viewport, index) => {
      const stage = {};
      for (const [phase, name] of [['before', 'group-round1-item1'], ['after', 'group-round1-item2']]) {
        const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'),
          Buffer.from(viewport.name + '-' + phase + '-' + index)]);
        writeFileSync(path.join(imageDirectory, viewport.name + '-' + name + '.png'), bytes);
        stage[phase] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      }
      return { viewport, ...stage };
    }),
  };
  const save = () => writeFileSync(logFile,
    'apps/web test: BROWSER_EVIDENCE_487 ' + JSON.stringify(evidence) + '\n'
      + 'apps/web test: BROWSER_EVIDENCE_487 PASS head=' + sha + '\n');
  save();
  try { testCase({ imageDirectory, logFile, evidence, save }); }
  finally { rmSync(folder, { recursive: true, force: true }); }
}
test('validates six screenshot hashes and exact PR identity', () => fixture(({ logFile, imageDirectory }) => {
  const result = verifyIssue487BrowserEvidence({ logFile, imageDirectory, headSha: sha });
  assert.equal(result.screenshots.length, 6);
  assert.equal(result.headSha, sha);
}));
test('rejects screenshot byte tampering', () => fixture(({ logFile, imageDirectory }) => {
  const file = path.join(imageDirectory, 'mobile-390x844-group-round1-item2.png');
  const bytes = readFileSync(file); bytes[9] ^= 0xff; writeFileSync(file, bytes);
  assert.throws(() => verifyIssue487BrowserEvidence({ logFile, imageDirectory, headSha: sha }), /SHA-256 mismatch/);
}));
test('rejects absent image and rejects a passing label without a structured evidence record', () => fixture(({ logFile, imageDirectory }) => {
  rmSync(path.join(imageDirectory, 'tablet-768x1024-group-round1-item1.png'));
  assert.throws(() => verifyIssue487BrowserEvidence({ logFile, imageDirectory, headSha: sha }), /ENOENT/);
  writeFileSync(logFile, 'BROWSER_EVIDENCE_487 PASS head=' + sha + '\n');
  assert.throws(() => verifyIssue487BrowserEvidence({ logFile, imageDirectory, headSha: sha }), /Exactly one/);
}));
test('rejects stale head and missing keyboard control', () => fixture(({ logFile, imageDirectory, evidence, save }) => {
  assert.throws(() => verifyIssue487BrowserEvidence({ logFile, imageDirectory, headSha: 'b'.repeat(40) }), /must match PR HEAD/);
  evidence.verified = evidence.verified.filter((tag) => tag !== 'keyboard-tab-navigation');
  save();
  assert.throws(() => verifyIssue487BrowserEvidence({ logFile, imageDirectory, headSha: sha }), /control missing/);
}));
test('rejects browser evidence without a verified timeout/draft recovery control', () => fixture(({ logFile, imageDirectory, evidence, save }) => {
  evidence.verified = evidence.verified.filter((tag) => tag !== 'timeout-overview-retry-idempotent');
  save();
  assert.throws(() => verifyIssue487BrowserEvidence({ logFile, imageDirectory, headSha: sha }), /control missing/);
}));
