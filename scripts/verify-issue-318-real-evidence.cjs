const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: options.env || process.env,
    cwd: options.cwd || process.cwd(),
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return result;
}

async function waitForHttp(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < (options.attempts || 80); attempt += 1) {
    try {
      const response = await fetch(url, { headers: options.headers });
      if (response.status < 500) return response;
    } catch (error) { lastError = error; }
    await delay(options.delayMs || 250);
  }
  throw lastError || new Error(`Server did not become ready: ${url}`);
}

function startProxy(port, webOrigin, apiOrigin, requestLog) {
  const server = http.createServer((req, res) => {
    const isApi = req.url.startsWith('/api/v1/');
    if (isApi) requestLog.push(`${req.method} ${req.url}`);
    const targetBase = isApi ? apiOrigin : webOrigin;
    const target = new URL(req.url, targetBase);
    const headers = { ...req.headers, host: target.host };
    const upstream = http.request(target, { method: req.method, headers }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    });
    upstream.on('error', (error) => {
      res.statusCode = 502;
      res.end(`proxy error: ${error.message}`);
    });
    req.pipe(upstream);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function openAccordion(page, name) {
  const button = page.getByRole('button', { name });
  await button.focus();
  if ((await button.getAttribute('aria-expanded')) === 'false') await page.keyboard.press('Enter');
  assert.equal(await button.getAttribute('aria-expanded'), 'true');
}

function ensureNativeOrcaInstalled() {
  const available = spawnSync('bash', ['-lc', 'command -v orca'], { encoding: 'utf8' });
  if (available.status === 0) return;
  const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' };
  run('sudo', ['apt-get', 'update'], { env });
  run('sudo', ['apt-get', 'install', '-y', 'orca', 'dbus-x11', 'xvfb'], { env });
}

async function verifyRealIssue318Evidence({ browser, baseUrl, outputDir }) {
  const runId = `${Date.now()}-${process.pid}`;
  const postgresName = `issue318-postgres-${runId}`.replace(/[^a-zA-Z0-9_.-]/g, '-');
  const postgresPort = 55432;
  const apiPort = 4181;
  const proxyPort = 4180;
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const proxyOrigin = `http://127.0.0.1:${proxyPort}`;
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${postgresPort}/issue318?schema=public`;
  const fixtureFile = path.join(outputDir, 'real-api-fixture.json');
  const apiLog = path.join(outputDir, 'real-api-server.log');
  const requestLog = [];
  let apiProcess;
  let proxyServer;
  const apiLogFd = fs.openSync(apiLog, 'w');

  try {
    run('docker', [
      'run', '--rm', '-d', '--name', postgresName,
      '-e', 'POSTGRES_USER=postgres',
      '-e', 'POSTGRES_PASSWORD=postgres',
      '-e', 'POSTGRES_DB=issue318',
      '-p', `127.0.0.1:${postgresPort}:5432`,
      'postgres:16-alpine',
    ]);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = spawnSync('docker', ['exec', postgresName, 'pg_isready', '-U', 'postgres', '-d', 'issue318'], { encoding: 'utf8' });
      if (ready.status === 0) break;
      if (attempt === 59) throw new Error(`PostgreSQL did not become ready: ${ready.stderr || ready.stdout}`);
      await delay(500);
    }

    const env = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      JWT_SECRET: 'issue-318-real-api-evidence-secret',
      NODE_ENV: 'test',
      ISSUE318_REAL_API_PORT: String(apiPort),
      ISSUE318_REAL_API_FIXTURE_FILE: fixtureFile,
    };
    run('pnpm', ['--filter', '@corrida/api', 'db:generate'], { env });
    run('pnpm', ['--filter', '@corrida/api', 'exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { env });

    apiProcess = spawn(
      'pnpm',
      ['--filter', '@corrida/api', 'exec', 'tsx', 'scripts/issue-318-real-api-evidence-server.mjs'],
      { env, stdio: ['ignore', apiLogFd, apiLogFd] }
    );
    await waitForHttp(`${apiOrigin}/health`, { attempts: 80, delayMs: 250 });
    for (let attempt = 0; attempt < 80 && !fs.existsSync(fixtureFile); attempt += 1) await delay(100);
    assert.ok(fs.existsSync(fixtureFile), 'Real API fixture file was not produced');
    const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));

    proxyServer = await startProxy(proxyPort, baseUrl, apiOrigin, requestLog);
    await waitForHttp(proxyOrigin);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      storageState: {
        cookies: [],
        origins: [{
          origin: proxyOrigin,
          localStorage: [
            { name: 'token', value: fixture.token },
            { name: 'user', value: JSON.stringify(fixture.user) },
          ],
        }],
      },
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${proxyOrigin}/central-do-aluno/${fixture.alunoId}/montagem-consolidada`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Montagem Consolidada da Prescrição' }).waitFor({ timeout: 15000 });
    await page.getByText('Sem montagem', { exact: true }).waitFor();

    await openAccordion(page, '5. Composição e ordem técnica');
    await page.getByLabel(/Justificativa profissional/).fill('Composição validada em navegador contra a API real e PostgreSQL efêmero.');
    await page.getByLabel('Orientação prática').fill('Orientação persistida pela API real.');
    await openAccordion(page, '7. Revisão e validação final');
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await page.getByText('Rascunho criado pelo servidor.', { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText('Rascunho', { exact: true }).first().waitFor();

    await openAccordion(page, '7. Revisão e validação final');
    await page.getByRole('button', { name: 'Enviar para revisão' }).click();
    await page.getByText('Montagem enviada para revisão pelo servidor.', { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText('Pronta para revisão', { exact: true }).first().waitFor();

    await openAccordion(page, '7. Revisão e validação final');
    await page.getByRole('button', { name: 'Aprovar montagem' }).click();
    await page.getByText('Aprovação confirmada pelo servidor.', { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText('Aprovada', { exact: true }).first().waitFor();

    const persisted = await fetch(`${apiOrigin}/api/v1/consolidated-prescriptions/alunos/${fixture.alunoId}`, {
      headers: { Authorization: `Bearer ${fixture.token}` },
    });
    assert.equal(persisted.status, 200);
    const persistedBody = await persisted.json();
    assert.equal(persistedBody.data.currentStatus, 'approved');
    assert.equal(persistedBody.data.currentVersion, 3);
    assert.deepEqual(pageErrors, []);
    assert.ok(requestLog.some((entry) => entry.includes('/workspace')), 'Browser did not request the real workspace endpoint');
    assert.ok(requestLog.some((entry) => entry.startsWith('POST ') && entry.endsWith(`/alunos/${fixture.alunoId}`)), 'Browser did not create the draft through the real API');
    assert.ok(requestLog.some((entry) => entry.includes('/send-for-review')), 'Browser did not send for review through the real API');
    assert.ok(requestLog.some((entry) => entry.includes('/approve')), 'Browser did not approve through the real API');

    await page.screenshot({ path: path.join(outputDir, 'real-api-approved.png'), fullPage: true });
    fs.writeFileSync(path.join(outputDir, 'real-api-network.json'), JSON.stringify(requestLog, null, 2));
    fs.writeFileSync(path.join(outputDir, 'real-api-summary.json'), JSON.stringify({
      database: 'PostgreSQL 16 ephemeral Docker container',
      api: 'actual consolidated-prescriptions and auth Express routers',
      browser: 'Chromium through same-origin reverse proxy; no Playwright route mocks',
      flow: ['workspace', 'create draft', 'send for review', 'approve', 'read persisted approved state'],
      persistedCurrentVersion: persistedBody.data.currentVersion,
      persistedCurrentStatus: persistedBody.data.currentStatus,
    }, null, 2));

    await context.close();

    ensureNativeOrcaInstalled();
    const screenReaderUrl = `${proxyOrigin}/central-do-aluno/${fixture.alunoId}/montagem-consolidada`;
    run('dbus-run-session', [
      '--', 'xvfb-run', '-a', process.execPath, 'scripts/verify-issue-318-orca-session.cjs',
    ], {
      stdio: 'inherit',
      env: {
        ...process.env,
        ISSUE318_SCREEN_READER_URL: screenReaderUrl,
        ISSUE318_SCREEN_READER_TOKEN: fixture.token,
        ISSUE318_SCREEN_READER_USER: JSON.stringify(fixture.user),
        ISSUE318_SCREEN_READER_DIR: outputDir,
      },
    });
  } finally {
    if (proxyServer) await new Promise((resolve) => proxyServer.close(resolve));
    if (apiProcess && apiProcess.exitCode === null) {
      apiProcess.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => apiProcess.once('exit', resolve)),
        delay(2000),
      ]);
    }
    fs.closeSync(apiLogFd);
    spawnSync('docker', ['rm', '-f', postgresName], { encoding: 'utf8' });
  }
}

module.exports = { verifyRealIssue318Evidence };
