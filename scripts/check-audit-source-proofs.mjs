import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA_RE = /^[0-9a-f]{40}$/;

function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function validateSourceProofDocument(document, { cwd = process.cwd() } = {}) {
  if (!document || typeof document !== 'object') return { checked: 0, skipped: true };
  const materialHead = document.material_head_sha;
  const sourceProofs = document.source_proofs;
  if (typeof materialHead !== 'string' || !sourceProofs || typeof sourceProofs !== 'object') {
    return { checked: 0, skipped: true };
  }
  if (!SHA_RE.test(materialHead)) {
    throw new Error(`invalid material_head_sha: ${String(materialHead)}`);
  }

  let checked = 0;
  for (const [name, proof] of Object.entries(sourceProofs)) {
    if (!proof || typeof proof !== 'object') continue;
    const proofPath = proof.path;
    const expectedBlob = proof.git_blob_sha;
    if (typeof proofPath !== 'string' || typeof expectedBlob !== 'string') continue;
    checked += 1;

    if (!SHA_RE.test(expectedBlob)) {
      throw new Error(`${name}: git_blob_sha must be a 40-character lowercase hex SHA`);
    }

    try {
      runGit(['cat-file', '-e', `${expectedBlob}^{blob}`], cwd);
    } catch {
      throw new Error(`${name}: declared git_blob_sha does not exist as a blob: ${expectedBlob}`);
    }

    let actualBlob;
    try {
      actualBlob = runGit(['rev-parse', `${materialHead}:${proofPath}`], cwd);
    } catch {
      throw new Error(`${name}: path does not exist at material_head_sha: ${proofPath}`);
    }

    if (actualBlob !== expectedBlob) {
      throw new Error(
        `${name}: git_blob_sha mismatch for ${proofPath} at ${materialHead}: expected ${actualBlob}, declared ${expectedBlob}`
      );
    }
  }

  return { checked, skipped: false };
}

function candidateEvidenceFiles(root) {
  const evidenceDir = path.join(root, '.audit', 'entregar-issue', 'evidence');
  if (!fs.existsSync(evidenceDir)) return [];
  return fs
    .readdirSync(evidenceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(evidenceDir, entry.name));
}

function shouldValidateMaterial(materialHead, cwd) {
  const head = runGit(['rev-parse', 'HEAD'], cwd);
  if (materialHead === head) return true;
  try {
    const parent = runGit(['rev-parse', 'HEAD^'], cwd);
    return materialHead === parent;
  } catch {
    return false;
  }
}

export function validateRepositorySourceProofs({ cwd = process.cwd(), files = candidateEvidenceFiles(cwd) } = {}) {
  let documents = 0;
  let proofs = 0;
  const validatedFiles = [];

  for (const file of files) {
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!document?.source_proofs || typeof document?.material_head_sha !== 'string') continue;
    if (!shouldValidateMaterial(document.material_head_sha, cwd)) continue;

    const result = validateSourceProofDocument(document, { cwd });
    documents += 1;
    proofs += result.checked;
    validatedFiles.push(path.relative(cwd, file));
  }

  return { documents, proofs, validatedFiles };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = validateRepositorySourceProofs();
    if (result.documents === 0) {
      console.log('audit source proofs: no current material evidence to validate');
    } else {
      console.log(`audit source proofs: ${result.proofs} proof(s) valid across ${result.documents} document(s)`);
    }
  } catch (error) {
    console.error(`audit source proofs: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
