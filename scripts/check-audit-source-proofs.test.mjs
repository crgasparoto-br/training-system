import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateSourceProofDocument } from './check-audit-source-proofs.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-source-proofs-'));
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 'fixture@example.invalid');
  git(cwd, 'config', 'user.name', 'Fixture');
  fs.mkdirSync(path.join(cwd, 'src'));
  fs.writeFileSync(path.join(cwd, 'src', 'canonical.txt'), 'canonical\n');
  fs.writeFileSync(path.join(cwd, 'src', 'sibling.txt'), 'sibling\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', 'fixture');
  const materialHead = git(cwd, 'rev-parse', 'HEAD');
  const canonicalBlob = git(cwd, 'rev-parse', `${materialHead}:src/canonical.txt`);
  const siblingBlob = git(cwd, 'rev-parse', `${materialHead}:src/sibling.txt`);
  return { cwd, materialHead, canonicalBlob, siblingBlob };
}

function document(materialHead, blobSha) {
  return {
    material_head_sha: materialHead,
    source_proofs: {
      canonical: {
        path: 'src/canonical.txt',
        git_blob_sha: blobSha,
      },
    },
  };
}

test('accepts a proof bound to the exact blob at the material head', () => {
  const fx = fixture();
  const result = validateSourceProofDocument(document(fx.materialHead, fx.canonicalBlob), { cwd: fx.cwd });
  assert.equal(result.checked, 1);
});

test('rejects a valid blob SHA that belongs to a different path', () => {
  const fx = fixture();
  assert.throws(
    () => validateSourceProofDocument(document(fx.materialHead, fx.siblingBlob), { cwd: fx.cwd }),
    /git_blob_sha mismatch/
  );
});

test('rejects a declared SHA that does not exist as a Git blob', () => {
  const fx = fixture();
  assert.throws(
    () => validateSourceProofDocument(document(fx.materialHead, '0'.repeat(40)), { cwd: fx.cwd }),
    /does not exist as a blob/
  );
});
