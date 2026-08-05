import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function runVerifier(script: string): void {
  const result = spawnSync(
    'pnpm',
    ['--filter', '@corrida/api', 'exec', 'tsx', script],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
    }
  );

  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`${script} terminou pelo sinal ${result.signal}.`);
  }
  if (result.status !== 0) {
    throw new Error(`${script} terminou com status ${result.status ?? 'desconhecido'}.`);
  }
}

runVerifier('scripts/verify-issue-275-browser-privacy-legacy.ts');
runVerifier('scripts/verify-issue-248-adipometry-browser.ts');
