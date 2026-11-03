import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const viewports = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'mobile-390x844', width: 390, height: 844 },
];
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const prefix = 'BROWSER_EVIDENCE_487 ';

/** Validate archived PNG bytes against the exact-HEAD Chrome test log. */
export function verifyIssue487BrowserEvidence({ logFile, imageDirectory, headSha }) {
  assert.match(headSha, /^[0-9a-f]{40}$/, 'Expected exact Git commit SHA');
  const log = readFileSync(logFile, 'utf8');
  const records = log.split(/\r?\n/).filter((line) => line.includes(prefix + '{'));
  assert.equal(records.length, 1, 'Exactly one browser evidence JSON record is required');
  const line = records[0];
  const evidence = JSON.parse(line.slice(line.indexOf(prefix) + prefix.length));
  assert.equal(evidence.kind, 'issue-487-browser-evidence');
  assert.equal(evidence.result, 'PASS');
  assert.equal(evidence.identity?.headSha, headSha, 'Browser evidence must match PR HEAD');
  assert.match(evidence.browser, /^Chrome\//, 'Real Chrome run is required');
  assert.equal(evidence.scenarios?.length, viewports.length);
  const screenshots = [];
  for (const [index, viewport] of viewports.entries()) {
    const entry = evidence.scenarios[index];
    assert.deepEqual(
      { name: entry?.viewport?.name, width: entry?.viewport?.width, height: entry?.viewport?.height },
      viewport, 'Viewport ' + (index + 1) + ' mismatch');
    for (const [phase, suffix] of [
      ['before', 'group-round1-item1'],
      ['after', 'group-round1-item2'],
    ]) {
      const expected = entry?.[phase];
      assert.ok(expected && Number.isInteger(expected.bytes) && expected.bytes > 8,
        'Missing screenshot length for ' + viewport.name + '/' + phase);
      assert.match(expected.sha256, /^[0-9a-f]{64}$/);
      const filePath = path.join(imageDirectory, viewport.name + '-' + suffix + '.png');
      const bytes = readFileSync(filePath);
      assert.ok(bytes.subarray(0, 8).equals(pngSignature), 'Invalid PNG signature: ' + filePath);
      assert.equal(bytes.length, expected.bytes, 'Screenshot length mismatch: ' + filePath);
      const hash = createHash('sha256').update(bytes).digest('hex');
      assert.equal(hash, expected.sha256, 'Screenshot SHA-256 mismatch: ' + filePath);
      screenshots.push({ file: path.basename(filePath), sha256: hash, bytes: bytes.length });
    }
  }
  assert.ok(log.includes('BROWSER_EVIDENCE_487 PASS head=' + headSha), 'Browser PASS marker is missing');
  for (const tag of ['keyboard-tab-navigation', 'no-horizontal-overflow', 'one-unit-at-a-time',
    'group-round-context', 'overview-return-position', 'next-participant-before-final-rest',
    'timeout-overview-retry-idempotent', 'no-rest-after-final-set',
    'stale-post-parent-version-reconciled', 'x-contract-id']) {
    assert.ok(evidence.verified?.includes(tag), 'Browser control missing: ' + tag);
  }
  return { schemaVersion: 1, kind: 'issue-487-verified-browser-captures', headSha,
    browser: evidence.browser, result: 'PASS', screenshots };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [logFile, imageDirectory, headSha] = process.argv.slice(2);
  assert.ok(logFile && imageDirectory && headSha,
    'Usage: node scripts/verify-issue-487-browser-evidence.mjs LOG IMAGE_DIRECTORY HEAD_SHA');
  const result = verifyIssue487BrowserEvidence({ logFile, imageDirectory, headSha });
  process.stdout.write('VERIFIED_BROWSER_EVIDENCE_487 ' + JSON.stringify(result) + '\n');
}
