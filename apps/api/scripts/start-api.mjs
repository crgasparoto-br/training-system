import { spawn } from 'node:child_process';

const runtimeDatabaseUrl = process.env.DATABASE_URL;
if (!runtimeDatabaseUrl) {
  console.error('[startup] DATABASE_URL não configurada');
  process.exit(1);
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
