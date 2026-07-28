import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import puppeteer, { type Page } from 'puppeteer';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const webUrl = 'http://127.0.0.1:4180';
const apiUrl = 'http://127.0.0.1:3011';
const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForUrl(url: string, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Processo ainda iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Servidor não respondeu em ${url}`);
}

function stopProcess(child?: ChildProcess) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

async function waitForHeading(page: Page, text: string, timeout = 20_000) {
  await page.waitForFunction(
    (expected) =>
      Array.from(document.querySelectorAll('h1, h2')).some(
        (heading) => heading.textContent?.trim() === expected
      ),
    { timeout },
    text
  );
}

async function waitForText(page: Page, text: string, timeout = 20_000) {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    { timeout },
    text
  );
}

async function clickByText(page: Page, selector: string, text: string) {
  await page.waitForFunction(
    (query, expected) => {
      const target = Array.from(document.querySelectorAll(query)).find(
        (element) => element.textContent?.trim().includes(expected)
      );
      return target instanceof HTMLElement && !('disabled' in target && target.disabled);
    },
    { timeout: 20_000 },
    selector,
    text
  );
  const clicked = await page.$$eval(
    selector,
    (elements, expected) => {
      const target = elements.find((element) => element.textContent?.trim().includes(expected));
      if (!(target instanceof HTMLElement)) return false;
      target.click();
      return true;
    },
    text
  );
  assert(clicked, `Controle não encontrado: ${selector} contendo ${text}`);
}

async function fillByLabel(page: Page, labelText: string, value: string) {
  const selector = await page.evaluate((expected) => {
    const label = Array.from(document.querySelectorAll('label')).find((candidate) =>
      candidate.textContent?.includes(expected)
    );
    if (!label) return null;
    const htmlFor = label.getAttribute('for');
    const field = htmlFor ? document.getElementById(htmlFor) : label.querySelector('input, textarea');
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return null;
    if (!field.id) field.id = `privacy-${Math.random().toString(36).slice(2)}`;
    return `#${CSS.escape(field.id)}`;
  }, labelText);
  assert(selector, `Campo não encontrado: ${labelText}`);
  await page.focus(selector);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, value);
}

async function checkByLabelText(page: Page, text: string) {
  const checked = await page.$$eval(
    'label',
    (labels, expected) => {
      const label = labels.find((candidate) => candidate.textContent?.includes(expected));
      const input = label?.querySelector('input[type="checkbox"], input[type="radio"]');
      if (!(input instanceof HTMLInputElement)) return false;
      if (!input.checked) input.click();
      return input.checked;
    },
    text
  );
  assert(checked, `Opção não encontrada: ${text}`);
}

const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const inviteToken = `issue-275-privacy-${crypto.randomBytes(24).toString('base64url')}`;
const guardianEmail = `issue-275-privacy-${suffix}@example.test`;
const guardianPassword = 'Senha-segura-275';
const protectedCpf = '52998224725';
let contractId = '';
let apiProcess: ChildProcess | undefined;
let previewProcess: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

async function main() {
  await mkdir(artifactDir, { recursive: true });
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275privacy${Date.now()}`,
      name: 'Academia Privacidade Issue 275',
    },
  });
  contractId = contract.id;
  const aluno = await prisma.aluno.create({
    data: {
      contractId,
      status: 'INVITED',
      leadName: 'Dependente Privacidade Issue 275',
      onboarding: { create: { contractId } },
      preRegistrationInvites: {
        create: {
          contractId,
          tokenHash: hashInviteToken(inviteToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
    },
  });
  await upsertStudentIdentity(
    aluno.id,
    contractId,
    {
      name: 'Dependente Privacidade Issue 275',
      birthDate: '2012-05-10',
      cpf: protectedCpf,
    },
    { sourceType: 'professional', sourceReference: 'issue_275_browser_privacy' }
  );

  apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      PORT: '3011',
      API_PORT: '3011',
      NODE_ENV: 'test',
      JWT_SECRET: 'issue-275-browser-privacy-secret',
      FRONTEND_URL: webUrl,
      CORS_ORIGINS: webUrl,
      PRE_REGISTRATION_ENABLED: 'true',
      PRE_REGISTRATION_TELEMETRY_ENABLED: 'false',
      PRIVACY_NOTICE_URL: `${webUrl}/privacidade`,
      PRIVACY_NOTICE_VERSION: '2026-07',
    },
    stdio: 'inherit',
  });
  previewProcess = spawn(
    'pnpm',
    ['--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4180'],
    {
      cwd: repoRoot,
      detached: true,
      env: { ...process.env, VITE_API_URL: apiUrl, VITE_PRE_REGISTRATION_ENABLED: 'true' },
      stdio: 'inherit',
    }
  );
  await Promise.all([waitForUrl(`${apiUrl}/health`), waitForUrl(webUrl)]);

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  const requestUrls: string[] = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => requestUrls.push(request.url()));

  await page.goto(`${webUrl}/pre-cadastro/${inviteToken}`, {
    waitUntil: 'networkidle0',
    timeout: 30_000,
  });
  await waitForText(page, 'Convite de pré-matrícula');
  await clickByText(page, 'button', 'Criar acesso');
  await checkByLabelText(page, 'Responsável legal');
  await fillByLabel(page, 'Nome completo', 'Responsável Privacidade Issue 275');
  await fillByLabel(page, 'E-mail', guardianEmail);
  await fillByLabel(page, 'Senha', guardianPassword);
  await clickByText(page, 'button', 'Criar acesso e continuar');
  await waitForHeading(page, 'Informe seu vínculo');

  const finalUrl = new URL(page.url());
  assert(finalUrl.pathname === '/pre-cadastro', `Token permaneceu na URL: ${page.url()}`);
  assert(!finalUrl.search && !finalUrl.hash, 'URL autenticada preservou query ou fragmento');
  const requestCountAfterClaim = requestUrls.length;
  const consoleCountAfterClaim = consoleMessages.length;

  const storage = await page.evaluate(() => ({
    local: Object.fromEntries(
      Object.keys(localStorage)
        .sort()
        .map((key) => [key, localStorage.getItem(key)])
    ),
    session: Object.fromEntries(
      Object.keys(sessionStorage)
        .sort()
        .map((key) => [key, sessionStorage.getItem(key)])
    ),
  }));
  assert(Object.keys(storage.local).join(',') === 'token,user', 'localStorage contém chaves inesperadas');
  assert(Object.keys(storage.session).length === 0, 'sessionStorage contém dados do fluxo');
  const serializedStorage = JSON.stringify(storage);
  assert(!serializedStorage.includes(inviteToken), 'Token bruto permaneceu no storage');
  assert(!serializedStorage.includes(protectedCpf), 'CPF completo permaneceu no storage');
  assert(!serializedStorage.includes('questionnaireParq'), 'Storage contém conteúdo clínico');
  assert(!serializedStorage.includes('clinicalHistoryData'), 'Storage contém Anamnese');

  await page.reload({ waitUntil: 'networkidle0', timeout: 30_000 });
  await waitForHeading(page, 'Informe seu vínculo');
  const postClaimUrls = requestUrls.slice(requestCountAfterClaim);
  const postClaimConsole = consoleMessages.slice(consoleCountAfterClaim);
  for (const observed of [...postClaimUrls, ...postClaimConsole, ...pageErrors]) {
    assert(!observed.includes(inviteToken), 'Token bruto apareceu após o redirecionamento autenticado');
    assert(!observed.includes(protectedCpf), 'CPF apareceu em URL ou log do navegador');
  }
  const unexpectedOrigins = [...new Set(postClaimUrls.map((value) => new URL(value).origin))].filter(
    (origin) => origin !== webUrl && origin !== apiUrl
  );
  assert(unexpectedOrigins.length === 0, `Analytics/APM externo observado: ${unexpectedOrigins.join(', ')}`);
  assert(pageErrors.length === 0, `Erros no navegador: ${pageErrors.join(' | ')}`);

  const report = {
    schemaVersion: 2,
    kind: 'issue-275-browser-privacy',
    finalPath: finalUrl.pathname,
    localStorageKeys: Object.keys(storage.local),
    sessionStorageKeys: Object.keys(storage.session),
    inviteTokenRemovedFromUrl: true,
    inviteTokenAbsentFromStorage: true,
    cpfAbsentFromStorageAndBrowserLogs: true,
    clinicalPayloadAbsentFromStorage: true,
    inspectionBoundary: 'after-authenticated-redirect',
    postClaimRequestCount: postClaimUrls.length,
    browserConsoleMessagesAfterClaim: postClaimConsole.length,
    browserErrors: pageErrors.length,
    externalAnalyticsOrigins: unexpectedOrigins,
  };
  await writeFile(
    path.join(artifactDir, 'browser-privacy.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close().catch(() => undefined);
    stopProcess(previewProcess);
    stopProcess(apiProcess);
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (contractId) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    const user = await prisma.user.findUnique({ where: { email: guardianEmail } }).catch(() => null);
    if (user) await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.$disconnect();
  });
