import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(apiRoot, '../..');
const visualAuditScript = path.join(apiRoot, 'scripts', 'visual-audit-library-alternating-movement.mjs');
const shouldRunVisualAudit = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    ...options,
  });
}

test(
  'Biblioteca renderiza Alternado no filtro e nos fluxos de criar/editar em navegador real',
  { skip: !shouldRunVisualAudit, timeout: 120_000 },
  () => {
    const build = run('pnpm', ['--filter', '@corrida/web', 'build']);
    assert.equal(build.status, 0, `Falha ao preparar build web para auditoria visual:\n${build.stdout}\n${build.stderr}`);

    const audit = run(process.execPath, [visualAuditScript], {
      env: {
        ...process.env,
        LIBRARY_ALTERNATING_HEAD_SHA: process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'local',
      },
    });
    assert.equal(audit.status, 0, `Auditoria visual da Biblioteca falhou:\n${audit.stdout}\n${audit.stderr}`);
    assert.match(audit.stdout, /Library Alternado visual audit completed/);

    process.stdout.write(audit.stdout);
  }
);
