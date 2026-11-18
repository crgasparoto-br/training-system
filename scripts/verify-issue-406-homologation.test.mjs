import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_KINDS, SCENARIO_IDS, verifyIssue406Homologation } from './verify-issue-406-homologation.mjs';

const HEAD = 'a'.repeat(40);
// Purely synthetic, in-memory format fixtures: never evidence of device testing.
function sample() {
  return {
    schema_version: 1, repository: 'crgasparoto-br/training-system', issue: 406, pr: 548,
    head_sha: HEAD, environment: 'homolog-issue406', environment_isolated: true,
    fictitious_data_only: true,
    frontend_deployment_evidence_url: 'https://example.test/frontend-deploy',
    api_deployment_evidence_url: 'https://example.test/api-deploy',
    approval: { responsible_person: 'Example reviewer', approved_at_utc: '2026-11-18T15:00:00.000Z',
      approval_evidence_ref: 'evidence://reviewer-approval' },
    records: DEVICE_KINDS.flatMap(device => SCENARIO_IDS.map(scenario => ({
      scenario_id: scenario, device_kind: device, physical_device_confirmed: true,
      model: 'Example model', os_version: 'Example OS', browser_version: 'Example browser',
      tested_at_utc: '2026-11-18T14:00:00.000Z', operator: 'Example operator',
      environment: 'homolog-issue406', frontend_sha: HEAD, api_sha: HEAD,
      deployment_evidence_url: 'https://example.test/ci-run',
      result: 'PASS', evidence_ref: `evidence://synthetic/${device}/${scenario}`,
      notes: 'Sample format only', observed_behavior: 'Sample observation format only',
    }))),
  };
}
const errors = (packet, sha = HEAD) => verifyIssue406Homologation(packet, sha).errors.join(' | ');

test('H406: all 14 scenarios on two device classes are required and uniquely counted', () => {
  const packet = sample();
  assert.equal(verifyIssue406Homologation(packet, HEAD).count, 28);
  assert.deepEqual(verifyIssue406Homologation(packet, HEAD).errors, []);
  packet.records.pop();
  assert.match(errors(packet), /Falta evidencia/);
  assert.match(errors(packet), /28 registros/);
});

test('H406: duplicates, invalid result or emulator cannot pass the manual evidence preflight', () => {
  const packet = sample();
  packet.records[1].scenario_id = 'H406-01';
  packet.records[2].result = 'BLOCKED';
  packet.records[3].physical_device_confirmed = false;
  assert.match(errors(packet), /duplicidade/);
  assert.match(errors(packet), /diferente de PASS/);
  assert.match(errors(packet), /dispositivo fisico nao confirmado/);
});

test('H406: stale HEAD or only one deployment SHA is rejected', () => {
  const packet = sample();
  packet.records[0].api_sha = 'b'.repeat(40);
  assert.match(errors(packet), /deploy web\/API divergente/);
  assert.match(errors(sample(), 'b'.repeat(40)), /outro commit/);
});

test('H406: production, missing approval, missing observed result and invalid evidence are rejected', () => {
  const packet = sample();
  packet.environment = 'production';
  packet.records[0].observed_behavior = '';
  packet.records[1].evidence_ref = packet.records[1].deployment_evidence_url;
  packet.approval = {};
  assert.match(errors(packet), /Ambiente isolado/);
  assert.match(errors(packet), /Aprovacao rastreavel/);
  assert.match(errors(packet), /observed_behavior/);
  assert.match(errors(packet), /referencia da observacao/);
});

test('H406: approval cannot predate a device observation; timestamps must be UTC', () => {
  const packet = sample();
  packet.approval.approved_at_utc = '2026-11-18T13:00:00.000Z';
  packet.records[1].tested_at_utc = '2026-11-18T14:00:00-03:00';
  assert.match(errors(packet), /aprovacao ocorreu antes/);
  assert.match(errors(packet), /horario UTC invalido/);
});

test('H406: no deployment proof may reference a known production origin', () => {
  const packet = sample();
  packet.api_deployment_evidence_url = 'https://sistema-acesso-api.onrender.com';
  packet.records[0].deployment_evidence_url = 'https://sistema-acesso.solveritconsultoria.com.br';
  assert.match(errors(packet), /Provas HTTPS distintas/);
  assert.match(errors(packet), /prova de deploy HTTPS invalida/);
});

test('H406: invalid UTC calendar dates cannot be normalized silently', () => {
  const packet = sample();
  packet.records[0].tested_at_utc = '2026-02-30T14:00:00Z';
  assert.match(errors(packet), /horario UTC invalido/);
});
