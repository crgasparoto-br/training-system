/**
 * Issue #406: structural preflight for privately retained manual device evidence.
 * A passing result is NOT physical-device verification or clinical approval.
 * The caller must independently authenticate each referenced artifact and deployment.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const SCENARIO_IDS = Object.freeze(
  Array.from({ length: 14 }, (_, index) => `H406-${String(index + 1).padStart(2, '0')}`)
);
export const DEVICE_KINDS = Object.freeze(['desktop', 'phone']);
const SHA = /^[0-9a-f]{40}$/;
const PRODUCTION_HOSTS = new Set([
  'sistema-acesso.solveritconsultoria.com.br',
  'sistema-acesso-api.onrender.com',
  'training-system-web.vercel.app',
]);
const REQUIRED = [
  'scenario_id', 'device_kind', 'model', 'os_version', 'browser_version',
  'tested_at_utc', 'operator', 'environment', 'frontend_sha', 'api_sha',
  'deployment_evidence_url', 'result', 'evidence_ref', 'notes', 'observed_behavior',
];
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const timestamp = (value) => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
const safeHttps = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password &&
      !url.search && !url.hash && !PRODUCTION_HOSTS.has(url.hostname.toLowerCase());
  } catch { return false; }
};
const stagingName = (value) => hasText(value) &&
  /(homolog|staging|preview|test)/i.test(value) && !/(produt|production)/i.test(value);

/** Format check only; no claim that a device or URL was actually observed. */
export function verifyIssue406Homologation(packet, headSha) {
  const errors = [];
  if (!SHA.test(headSha ?? '')) errors.push('SHA de HEAD confiavel e obrigatorio (40 hex).');
  if (!isRecord(packet)) return { valid: false, errors: [...errors, 'Pacote precisa ser um objeto JSON.'], count: 0 };
  if (packet.schema_version !== 1 || packet.repository !== 'crgasparoto-br/training-system' ||
      packet.issue !== 406 || packet.pr !== 548) {
    errors.push('Identidade do pacote/issue/PR incorreta.');
  }
  if (packet.head_sha !== headSha) errors.push('Pacote refere-se a outro commit; repetir homologacao no HEAD atual.');
  if (packet.environment_isolated !== true || packet.fictitious_data_only !== true ||
      !stagingName(packet.environment)) errors.push('Ambiente isolado e dados ficticios precisam estar declarados.');
  if (!safeHttps(packet.frontend_deployment_evidence_url) ||
      !safeHttps(packet.api_deployment_evidence_url)) errors.push('Provas HTTPS distintas de deploy web e API sao obrigatorias.');
  if (!isRecord(packet.approval) || !hasText(packet.approval.responsible_person) ||
      !hasText(packet.approval.approval_evidence_ref) ||
      !timestamp(packet.approval.approved_at_utc)) errors.push('Aprovacao rastreavel do responsavel e obrigatoria.');
  if (!Array.isArray(packet.records)) return { valid: false, errors: [...errors, 'records precisa ser uma lista.'], count: 0 };

  const received = new Set();
  for (const [index, row] of packet.records.entries()) {
    const tag = `registro ${index + 1}`;
    if (!isRecord(row)) { errors.push(`${tag}: objeto invalido.`); continue; }
    for (const key of REQUIRED) if (key === 'notes' ? typeof row[key] !== 'string' : !hasText(row[key])) {
      errors.push(`${tag}: campo ${key} ausente.`);
    }
    const pair = `${row.device_kind}/${row.scenario_id}`;
    if (!DEVICE_KINDS.includes(row.device_kind) || !SCENARIO_IDS.includes(row.scenario_id)) {
      errors.push(`${tag}: cenario/dispositivo desconhecido.`);
    } else if (received.has(pair)) errors.push(`${tag}: duplicidade de ${pair}.`);
    else received.add(pair);
    if (row.physical_device_confirmed !== true) errors.push(`${tag}: dispositivo fisico nao confirmado.`);
    if (row.result !== 'PASS') errors.push(`${tag}: resultado diferente de PASS (${row.result ?? 'ausente'}).`);
    if (!timestamp(row.tested_at_utc)) errors.push(`${tag}: horario UTC invalido.`);
    if (timestamp(row.tested_at_utc) && timestamp(packet.approval?.approved_at_utc) &&
        Date.parse(row.tested_at_utc) > Date.parse(packet.approval.approved_at_utc)) {
      errors.push(`${tag}: aprovacao ocorreu antes da observacao.`);
    }
    if (row.frontend_sha !== headSha || row.api_sha !== headSha) {
      errors.push(`${tag}: deploy web/API divergente do HEAD.`);
    }
    if (row.environment !== packet.environment || !stagingName(row.environment)) {
      errors.push(`${tag}: ambiente nao corresponde a homologacao isolada.`);
    }
    if (!safeHttps(row.deployment_evidence_url)) errors.push(`${tag}: prova de deploy HTTPS invalida.`);
    if (!hasText(row.evidence_ref) || row.evidence_ref === row.deployment_evidence_url) {
      errors.push(`${tag}: referencia da observacao deve ser propria e verificavel.`);
    }
  }
  for (const device of DEVICE_KINDS) for (const scenario of SCENARIO_IDS) {
    if (!received.has(`${device}/${scenario}`)) errors.push(`Falta evidencia ${device}/${scenario}.`);
  }
  if (packet.records.length !== 28) errors.push(`Sao exigidos 28 registros; recebidos ${packet.records.length}.`);
  return { valid: errors.length === 0, errors, count: received.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , path, option, headSha] = process.argv;
  if (!path || option !== '--head' || !headSha) {
    console.error('Uso: node scripts/verify-issue-406-homologation.mjs /caminho/privado/registros.json --head <HEAD-40-hex>');
    process.exitCode = 2;
  } else {
    try {
      const result = verifyIssue406Homologation(JSON.parse(readFileSync(path, 'utf8')), headSha);
      if (!result.valid) {
        console.error(`Formato da homologacao INVALIDO (${result.errors.length} motivos):`);
        for (const reason of result.errors) console.error(`- ${reason}`);
        process.exitCode = 1;
      } else {
        console.log('Formato completo: 28/28. NAO comprova teste fisico, autenticidade de evidencias, assinatura nem CI.');
      }
    } catch (error) {
      console.error(`Nao foi possivel validar o pacote: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      process.exitCode = 2;
    }
  }
}
