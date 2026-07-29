import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser } from 'puppeteer';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const webDist = path.join(repoRoot, 'apps/web/dist');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const webPort = 4176;
const apiPort = 3002;
const enabledForThisGate =
  process.env.RUN_ISSUE_275_ROLLOUT_CONSUMER_BROWSER === 'true' &&
  process.env.VITE_API_URL?.includes(String(apiPort)) === true &&
  existsSync(path.join(webDist, 'index.html'));

const describeBrowser = enabledForThisGate ? describe : describe.skip;

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

async function startWebServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', `http://127.0.0.1:${webPort}`).pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let candidate = path.join(webDist, relative);

    try {
      const metadata = await stat(candidate);
      if (metadata.isDirectory()) candidate = path.join(candidate, 'index.html');
    } catch {
      candidate = path.join(webDist, 'index.html');
    }

    try {
      const body = await readFile(candidate);
      response.statusCode = 200;
      response.setHeader('Content-Type', contentType(candidate));
      response.end(body);
    } catch {
      response.statusCode = 404;
      response.end('Not found');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(webPort, '127.0.0.1', resolve);
  });
  return server;
}

function startDisabledApi(): ChildProcess {
  return spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      PORT: String(apiPort),
      API_PORT: String(apiPort),
      NODE_ENV: 'production',
      JWT_SECRET: 'issue-275-rollout-consumer-browser-secret',
      FRONTEND_URL: `http://127.0.0.1:${webPort}`,
      CORS_ORIGINS: `http://127.0.0.1:${webPort}`,
      PRE_REGISTRATION_ENABLED: 'false',
      PRE_REGISTRATION_TELEMETRY_ENABLED: 'false',
      PRIVACY_NOTICE_URL: 'https://example.test/privacidade',
      PRIVACY_NOTICE_VERSION: '2026-07',
      HEALTH_PRIVACY_NOTICE_VERSION: '2026-07',
    },
    stdio: 'ignore',
  });
}

function stopProcess(child?: ChildProcess) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

async function waitForApi() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/health`);
      if (response.ok) return;
    } catch {
      // API ainda iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('API desabilitada não iniciou para o gate de consumidor');
}

type StoredUser = Record<string, unknown>;

async function openSurface(
  browser: Browser,
  input: {
    name: string;
    path: string;
    audience: 'public' | 'administrative';
    user?: StoredUser;
    viewport: { width: number; height: number };
  }
) {
  const page = await browser.newPage();
  await page.setViewport(input.viewport);
  if (input.user) {
    await page.evaluateOnNewDocument((user) => {
      localStorage.setItem('token', 'issue-275-browser-token');
      localStorage.setItem('user', JSON.stringify(user));
    }, input.user);
  }

  await page.goto(`http://127.0.0.1:${webPort}${input.path}`, {
    waitUntil: 'networkidle0',
    timeout: 60_000,
  });
  await page.waitForFunction(
    () => document.body.innerText.includes('Pré-matrícula temporariamente indisponível'),
    { timeout: 30_000 }
  );

  const text = await page.$eval('body', (element) => element.textContent || '');
  expect(text).toContain('Pré-matrícula temporariamente indisponível');
  expect(text).not.toContain('PRE_REGISTRATION_DISABLED');
  expect(text).not.toContain('Solicite um novo convite');
  if (input.audience === 'administrative') {
    expect(text).toContain('Nenhum cadastro ou convite existente foi apagado');
  } else {
    expect(text).toContain('Entre em contato com a equipe da academia para receber orientação');
  }

  const screenshot = path.join(artifactDir, `rollout-consumer-${input.name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await page.close();

  return {
    name: input.name,
    path: input.path,
    audience: input.audience,
    viewport: input.viewport,
    rawCodeAbsent: true,
    contradictoryInviteGuidanceAbsent: true,
    screenshot: path.relative(repoRoot, screenshot),
  };
}

describeBrowser('issue 275 rollout compatibility at the real browser consumer', () => {
  it('renders the operational disabled state on public, authenticated-resume and administrative routes', async () => {
    await mkdir(artifactDir, { recursive: true });
    const apiProcess = startDisabledApi();
    let webServer: Server | undefined;
    let browser: Browser | undefined;

    try {
      await waitForApi();
      webServer = await startWebServer();
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const linkedStudent = {
        id: 'issue-275-linked-student',
        email: 'linked-student@example.test',
        type: 'aluno',
        profile: { name: 'Aluno Vinculado' },
      };
      const administrator = {
        id: 'issue-275-admin',
        email: 'admin@example.test',
        type: 'professor',
        profile: { name: 'Administrador' },
        professor: {
          id: 'issue-275-professor',
          role: 'master',
          contractId: 'issue-275-contract',
          collaboratorFunction: {
            id: 'issue-275-function',
            code: 'administrator',
            name: 'Administrador',
            accessPermissions: [],
          },
        },
        accessControl: { isMaster: true, permissions: [] },
      };

      const surfaces = [];
      surfaces.push(
        await openSurface(browser, {
          name: 'public-token-route',
          path: '/pre-cadastro/legacy-route-exposure',
          audience: 'public',
          viewport: { width: 390, height: 844 },
        })
      );
      surfaces.push(
        await openSurface(browser, {
          name: 'authenticated-resume',
          path: '/pre-cadastro',
          audience: 'public',
          user: linkedStudent,
          viewport: { width: 390, height: 844 },
        })
      );
      surfaces.push(
        await openSurface(browser, {
          name: 'administrative-list',
          path: '/pre-matriculas',
          audience: 'administrative',
          user: administrator,
          viewport: { width: 1366, height: 768 },
        })
      );

      const report = {
        schemaVersion: 1,
        kind: 'issue-275-rollout-consumer-browser',
        buildMode: 'pre-registration-route-enabled',
        apiMode: 'PRE_REGISTRATION_ENABLED=false',
        previousWebEquivalence:
          'The route-enabled build exercises the same exposed-route condition as the pre-flag web bundle.',
        surfaces,
      };
      await writeFile(
        path.join(artifactDir, 'rollout-consumer-browser.json'),
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8'
      );
    } finally {
      if (browser) await browser.close().catch(() => undefined);
      if (webServer) await new Promise<void>((resolve) => webServer!.close(() => resolve()));
      stopProcess(apiProcess);
    }
  }, 120_000);
});
