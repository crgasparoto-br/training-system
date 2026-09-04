import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const auditDir = path.join(repoRoot, '.audit', 'entregar-issue');
const outputDir = path.join(repoRoot, 'artifacts', 'pr420-critical-audit');
const logicalDir = path.join(outputDir, 'logical');
const publishedHeadSha = process.env.AUDIT_PUBLISHED_HEAD_SHA || process.env.GITHUB_SHA || 'unknown';
const expectedMaterialHeadSha = process.env.AUDIT_MATERIAL_HEAD_SHA || '';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

async function reconstructArtifact(name) {
  const filePath = path.join(auditDir, name);
  const physicalBytes = await readFile(filePath);
  const physicalSha256 = sha256(physicalBytes);
  const parsed = JSON.parse(physicalBytes.toString('utf8'));
  if (parsed?.schema_version === 2 && parsed?.artifact_format === 'base64-shards-v1') {
    const encodedParts = [];
    for (const part of parsed.parts || []) {
      const bytes = await readFile(path.join(auditDir, part.path));
      const text = bytes.toString('utf8').trim();
      if (bytes.length !== part.size) throw new Error(`${name}: part ${part.path} size mismatch`);
      if (sha256(bytes) !== part.sha256) throw new Error(`${name}: part ${part.path} sha256 mismatch`);
      encodedParts.push(text);
    }
    const encodedBytes = Buffer.from(encodedParts.join(''), 'utf8');
    if (encodedBytes.length !== parsed.encoded_size) throw new Error(`${name}: encoded size mismatch`);
    if (sha256(encodedBytes) !== parsed.encoded_sha256) throw new Error(`${name}: encoded sha256 mismatch`);
    const packed = Buffer.from(encodedBytes.toString('utf8'), 'base64');
    const decoded = parsed.compression === 'gzip' ? gunzipSync(packed) : packed;
    if (decoded.length !== parsed.decoded_size) throw new Error(`${name}: decoded size mismatch`);
    if (sha256(decoded) !== parsed.decoded_sha256) throw new Error(`${name}: decoded sha256 mismatch`);
    JSON.parse(decoded.toString('utf8'));
    return { bytes: decoded, format: 'base64-shards-v1', physicalSha256, logicalSha256: sha256(decoded), parts: parsed.parts.map((part) => part.path) };
  }
  JSON.parse(physicalBytes.toString('utf8'));
  return { bytes: physicalBytes, format: 'plain-json', physicalSha256, logicalSha256: sha256(physicalBytes), parts: [] };
}

await mkdir(logicalDir, { recursive: true });
const certificate = await readJson(path.join(auditDir, 'handoff-ready.json'));
const materialHeadSha = certificate?.identity?.material_head_sha || certificate?.identity?.head_sha || null;
if (!materialHeadSha) throw new Error('handoff-ready.json does not expose material head');
if (expectedMaterialHeadSha && materialHeadSha !== expectedMaterialHeadSha) throw new Error(`material head mismatch: ${materialHeadSha} != ${expectedMaterialHeadSha}`);

const entries = [];
for (const [key, item] of Object.entries(certificate.artifacts || {})) {
  if (!item || typeof item !== 'object' || !item.name) continue;
  const reconstructed = await reconstructArtifact(item.name);
  const outputName = `${key}.json`;
  await writeFile(path.join(logicalDir, outputName), reconstructed.bytes);
  const expectedLogical = item.logical_sha256 || item.sha256;
  if (expectedLogical && expectedLogical !== reconstructed.logicalSha256) throw new Error(`${key}: logical sha256 differs from certificate`);
  if (item.sha256 && item.sha256 !== reconstructed.physicalSha256) throw new Error(`${key}: physical sha256 differs from certificate`);
  entries.push({ key, sourceName: item.name, logicalFile: `logical/${outputName}`, transportFormat: reconstructed.format, physicalSha256: reconstructed.physicalSha256, logicalSha256: reconstructed.logicalSha256, certifiedLogicalSha256: expectedLogical || null, certifiedPhysicalSha256: item.sha256 || null, partPaths: reconstructed.parts });
}

const resultOnlyPaths = (process.env.AUDIT_RESULT_ONLY_PATHS || '').split('\n').map((value) => value.trim()).filter(Boolean);
const nonAuditPaths = resultOnlyPaths.filter((value) => !value.startsWith('.audit/entregar-issue/'));
if (nonAuditPaths.length) throw new Error(`published head contains non-result-only paths: ${nonAuditPaths.join(', ')}`);

const manifest = {
  schemaVersion: 1,
  kind: 'pr420-critical-audit-logical-bundle',
  repository: process.env.GITHUB_REPOSITORY || 'crgasparoto-br/training-system',
  workflowRunId: process.env.GITHUB_RUN_ID || null,
  workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  publishedHeadSha,
  materialHeadSha,
  resultOnlyPaths,
  certificate: {
    status: certificate.status,
    contractVersion: certificate.contract_version,
    evidenceProfile: certificate.evidence_profile,
    issueNumber: certificate.subject?.issue_number,
    pullRequestNumber: certificate.subject?.pull_request_number || certificate.subject?.pull_request,
    baseRef: certificate.subject?.base_ref,
    headRef: certificate.subject?.head_ref,
  },
  artifacts: entries,
};
await writeFile(path.join(outputDir, 'bundle-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(outputDir, 'handoff-ready.json'), `${JSON.stringify(certificate, null, 2)}\n`, 'utf8');
console.log(`AUDIT_BUNDLE_OK material=${materialHeadSha} published=${publishedHeadSha} artifacts=${entries.length}`);
