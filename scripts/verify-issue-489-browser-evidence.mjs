import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const viewports = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'mobile-390x844', width: 390, height: 844 },
];
const phases = ['warmup', 'work-round1', 'recovery-round1'];
const controls = ['keyboard-enter', 'accessible-timer', 'aria-live-status', 'touch-targets',
  'no-horizontal-overflow', 'pause-resume', 'work-recovery-contrast',
  'round-context', 'speed-range', 'authenticated-contract-scoping',
  'active-reload-wall-clock', 'active-background-wall-clock', 'paused-background-freeze',
  'paused-reload-freeze', 'resume-after-background'];
const png = Buffer.from('89504e470d0a1a0a', 'hex');
const prefix = 'BROWSER_EVIDENCE_489 ';

/** Fail closed if a screenshot, control, browser or commit identity is missing. */
export function verifyIssue489BrowserEvidence({ logFile, imageDirectory, headSha }) {
  assert.match(headSha, /^[0-9a-f]{40}$/);
  const log = readFileSync(logFile, 'utf8');
  const records = log.split(/\r?\n/).filter((line) => line.includes(prefix + '{'));
  assert.equal(records.length, 1, 'Exactly one real-browser evidence record is required');
  const line = records[0];
  const record = JSON.parse(line.slice(line.indexOf(prefix) + prefix.length));
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.kind, 'issue-489-browser-evidence');
  assert.equal(record.result, 'PASS');
  assert.equal(record.identity?.headSha, headSha, 'Must be observed exact HEAD');
  assert.match(record.browser, /^Chrome\//, 'A real Chrome run is mandatory');
  assert.ok(log.includes(prefix + 'PASS head=' + headSha), 'Missing terminal PASS marker');
  for (const required of [...viewports.map(({ name }) => name), ...controls]) {
    assert.ok(record.verified?.includes(required), 'Missing control: ' + required);
  }
  assert.equal(record.scenarios?.length, viewports.length);
  const images = [];
  for (const [index, viewport] of viewports.entries()) {
    const scenario = record.scenarios[index];
    assert.deepEqual(scenario.viewport, viewport);
    // The log must attest both sides of the wall-clock/paused distinction.
    // Reject a screenshot-only PASS with no actual reload/background measurements.
    const continuity = scenario.continuity;
    assert.equal(continuity?.progression?.stageId, 'warmup');
    assert.equal(continuity.progression.version, 4);
    assert.equal(continuity.progression.completed, 0);
    const active = continuity.active;
    const paused = continuity.paused;
    const resumed = continuity.resumed;
    for (const seconds of [...Object.values(active), ...Object.values(paused), ...Object.values(resumed)]) {
      assert.ok(Number.isInteger(seconds) && seconds >= 0 && seconds <= 90,
        'Real-browser timer samples must be bounded integers');
    }
    assert.ok(active.afterReload < active.beforeReload && active.afterBackground < active.beforeBackground,
      'Reload and background without explicit pause must advance the server clock');
    assert.ok(Math.abs(paused.afterBackground - paused.beforeBackground) <= 1 &&
      Math.abs(paused.afterReload - paused.beforeBackground) <= 1,
    'Explicit pause must freeze time across background and reload');
    assert.ok(resumed.after < resumed.before, 'Clock must continue after explicit resume');
    for (const phase of phases) {
      const result = scenario[phase === 'work-round1' ? 'work' : phase === 'recovery-round1' ? 'recovery' : 'warmup'];
      assert.match(result?.sha256, /^[0-9a-f]{64}$/);
      const filename = `${viewport.name}-${phase}.png`;
      const bytes = readFileSync(path.join(imageDirectory, filename));
      assert.ok(bytes.subarray(0, 8).equals(png), 'Invalid PNG: ' + filename);
      assert.equal(bytes.length, result.bytes, 'Size mismatch: ' + filename);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), result.sha256,
        'Digest mismatch: ' + filename);
      images.push({ filename, bytes: result.bytes, sha256: result.sha256 });
    }
  }
  return { schemaVersion: 1, headSha, result: 'PASS', screenshots: images };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [logFile, imageDirectory, headSha] = process.argv.slice(2);
  assert.ok(logFile && imageDirectory && headSha, 'Usage: node verify-issue-489-browser-evidence.mjs LOG DIR HEAD_SHA');
  process.stdout.write('VERIFIED_BROWSER_EVIDENCE_489 ' +
    JSON.stringify(verifyIssue489BrowserEvidence({ logFile, imageDirectory, headSha })) + '\n');
}
