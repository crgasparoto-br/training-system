import { spawn } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIssue275IntegratedE2ESource } from './issue-275-integrated-e2e-source.js';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, '../../..');
const templatePath = path.join(scriptsDir, 'verify-issue-275-integrated-e2e.source.ts');
const runtimePath = path.join(scriptsDir, '.verify-issue-275-integrated-e2e.runtime.ts');

async function executeRuntimeVerifier(): Promise<number> {
  const child = spawn(
    'pnpm',
    ['--filter', '@corrida/api', 'exec', 'tsx', runtimePath],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
    }
  );
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Verificador integrado encerrado por sinal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const template = await readFile(templatePath, 'utf8');
  const source = buildIssue275IntegratedE2ESource(template);
  await writeFile(runtimePath, source, 'utf8');
  const exitCode = await executeRuntimeVerifier();
  if (exitCode !== 0) process.exitCode = exitCode;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await unlink(runtimePath).catch(() => undefined);
  });
