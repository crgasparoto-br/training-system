import { spawn } from 'node:child_process';

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!migrationDatabaseUrl) {
  console.error('[migration] MIGRATION_DATABASE_URL ou DATABASE_URL não configurada');
  process.exit(1);
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const migrationProcess = spawn(pnpmCommand, ['db:migrate:prod'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: migrationDatabaseUrl,
  },
  stdio: 'inherit',
});

migrationProcess.once('error', (error) => {
  console.error('[migration] não foi possível iniciar o deploy das migrations', error);
  process.exit(1);
});

migrationProcess.once('exit', (code, signal) => {
  if (signal) {
    console.error(`[migration] deploy interrompido pelo sinal ${signal}`);
    process.exit(1);
    return;
  }
  process.exit(code ?? 1);
});
