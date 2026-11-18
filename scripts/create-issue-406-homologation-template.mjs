/**
 * Issue #406: prepare an UNEXECUTED, private evidence form for two physical devices.
 * The generated JSON is not evidence, a device test, a deploy attestation or approval.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { DEVICE_KINDS, SCENARIO_IDS } from './verify-issue-406-homologation.mjs';

const SHA = /^[0-9a-f]{40}$/;

export function createIssue406HomologationTemplate(headSha) {
  if (!SHA.test(headSha ?? '')) {
    throw new Error('Informe o HEAD exato com 40 caracteres hexadecimais minusculos.');
  }
  return {
    schema_version: 1,
    repository: 'crgasparoto-br/training-system',
    issue: 406,
    pr: 548,
    head_sha: headSha,
    environment: '',
    environment_isolated: false,
    fictitious_data_only: false,
    frontend_deployment_evidence_url: '',
    api_deployment_evidence_url: '',
    approval: {
      responsible_person: '',
      approved_at_utc: '',
      approval_evidence_ref: '',
    },
    records: DEVICE_KINDS.flatMap(device => SCENARIO_IDS.map(scenario => ({
      scenario_id: scenario,
      device_kind: device,
      physical_device_confirmed: false,
      model: '',
      os_version: '',
      browser_version: '',
      tested_at_utc: '',
      operator: '',
      environment: '',
      frontend_sha: '',
      api_sha: '',
      deployment_evidence_url: '',
      result: 'NOT_RUN',
      evidence_ref: '',
      notes: '',
      observed_behavior: '',
    }))),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , option, headSha, ...extra] = process.argv;
  if (option !== '--head' || !headSha || extra.length) {
    console.error('Uso: node scripts/create-issue-406-homologation-template.mjs --head <HEAD-40-hex> > /caminho/privado/evidence.json');
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(JSON.stringify(createIssue406HomologationTemplate(headSha), null, 2) + '\n');
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'HEAD invalido.');
      process.exitCode = 2;
    }
  }
}
