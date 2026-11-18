import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { DEVICE_KINDS, SCENARIO_IDS, verifyIssue406Homologation } from './verify-issue-406-homologation.mjs';
import { createIssue406HomologationTemplate } from './create-issue-406-homologation-template.mjs';

const HEAD = 'a'.repeat(40);

test('H406: a blank template includes every scenario and both physical device types exactly once', () => {
  const packet = createIssue406HomologationTemplate(HEAD);
  assert.deepEqual([packet.issue, packet.pr, packet.head_sha], [406, 548, HEAD]);
  assert.equal(packet.records.length, 28);
  const pairs = packet.records.map(record => `${record.device_kind}/${record.scenario_id}`);
  assert.equal(new Set(pairs).size, 28);
  assert.deepEqual(pairs, DEVICE_KINDS.flatMap(device => SCENARIO_IDS.map(scenario => `${device}/${scenario}`)));
});

test('H406: generated packet cannot pass verification without actual observations, approval and deployment', () => {
  const packet = createIssue406HomologationTemplate(HEAD);
  assert.equal(packet.environment_isolated, false);
  assert.equal(packet.fictitious_data_only, false);
  assert.deepEqual(Object.values(packet.approval), ['', '', '']);
  for (const record of packet.records) {
    assert.equal(record.result, 'NOT_RUN');
    assert.equal(record.physical_device_confirmed, false);
    assert.equal(record.observed_behavior, '');
    assert.equal(record.evidence_ref, '');
    assert.equal(record.tested_at_utc, '');
  }
  const result = verifyIssue406Homologation(packet, HEAD);
  assert.equal(result.valid, false);
  assert.equal(result.count, 28); // Slot count is not the number of performed tests.
  assert.ok(result.errors.some(message => message.includes('Aprovacao rastreavel')));
  assert.ok(result.errors.some(message => message.includes('diferente de PASS')));
  assert.ok(result.errors.some(message => message.includes('dispositivo fisico nao confirmado')));
});

test('H406: invalid or missing exact HEAD is refused without producing a template', () => {
  for (const sha of [undefined, '', 'a'.repeat(39), 'A'.repeat(40), 'not-a-commit']) {
    assert.throws(() => createIssue406HomologationTemplate(sha), /HEAD exato/);
  }
  const command = spawnSync(process.execPath, ['scripts/create-issue-406-homologation-template.mjs', '--head', 'invalid'], {
    encoding: 'utf8',
  });
  assert.equal(command.status, 2);
  assert.equal(command.stdout, '');
});

test('H406: CLI emits parseable JSON only, with no simulated PASS or device assertion', () => {
  const command = spawnSync(process.execPath, ['scripts/create-issue-406-homologation-template.mjs', '--head', HEAD], {
    encoding: 'utf8',
  });
  assert.equal(command.status, 0);
  assert.equal(command.stderr, '');
  const packet = JSON.parse(command.stdout);
  assert.equal(packet.records.length, 28);
  assert.ok(packet.records.every(record => record.result === 'NOT_RUN' && !record.physical_device_confirmed));
  assert.equal(verifyIssue406Homologation(packet, HEAD).valid, false);
});
