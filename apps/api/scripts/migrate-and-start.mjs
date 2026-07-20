import { spawn } from 'node:child_process';

const runtimeDatabaseUrl = process.env.DATABASE_URL;
if (!runtimeDatabaseUrl) {
  console.error('[startup] DATABASE_URL não configurada');
  process.exit(1);
}

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL || runtimeDatabaseUrl;
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} interrompido pelo sinal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

const migrationExitCode = await run(
  pnpmCommand,
  ['db:migrate:prod'],
  {
    ...process.env,
    DATABASE_URL: migrationDatabaseUrl,
  }
);

if (migrationExitCode !== 0) {
  console.error(`[startup] prisma migrate deploy terminou com código ${migrationExitCode}`);
  process.exit(migrationExitCode);
}

const apiProcess = spawn(process.execPath, ['dist/main.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: runtimeDatabaseUrl,
  },
  stdio: 'inherit',
});

let forwardedSignal = null;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    forwardedSignal = signal;
    if (!apiProcess.killed) apiProcess.kill(signal);
  });
}

apiProcess.once('error', (error) => {
  console.error('[startup] não foi possível iniciar a API', error);
  process.exit(1);
});

apiProcess.once('exit', (code) => {
  if (forwardedSignal) {
    process.exit(0);
    return;
  }
  process.exit(code ?? 1);
});
