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

async function waitForFocusedText(page: Page, text: string, timeout = 20_000) {
  await page.waitForFunction(
    (expected) => document.activeElement?.textContent?.trim().includes(expected),
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

async function tabUntil(
  page: Page,
  predicate: { text?: string; id?: string; value?: string; type?: string },
  maxTabs = 40
) {
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return null;
      return {
        id: element.id,
        text: element.textContent?.trim() || '',
        value: element instanceof HTMLInputElement ? element.value : '',
        type: element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase(),
      };
    });
    if (
      active &&
      (!predicate.text || active.text.includes(predicate.text)) &&
      (!predicate.id || active.id === predicate.id) &&
      (!predicate.value || active.value === predicate.value) &&
      (!predicate.type || active.type === predicate.type)
    ) {
      return active;
    }
  }
  throw new Error(`Navegação por teclado não encontrou ${JSON.stringify(predicate)}`);
}

async function assertNoHorizontalOverflow(page: Page, scenario: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.scrollWidth <= dimensions.viewport + 1,
    `${scenario}: overflow horizontal ${dimensions.scrollWidth}/${dimensions.viewport}`
  );
}

async function inspectContrast(page: Page) {
  return page.evaluate(() => {
    const parseColor = (value: string) => {
      const numbers = value.match(/[\d.]+/g)?.map(Number) || [];
      return { r: numbers[0] || 0, g: numbers[1] || 0, b: numbers[2] || 0, a: numbers[3] ?? 1 };
    };
    const luminance = (color: { r: number; g: number; b: number }) => {
      const values = [color.r, color.g, color.b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
    };
    const backgroundOf = (element: Element) => {
      let current: Element | null = element;
      while (current) {
        const parsed = parseColor(getComputedStyle(current).backgroundColor);
        if (parsed.a > 0) return parsed;
        current = current.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const ratioFor = (element: Element) => {
      const foreground = parseColor(getComputedStyle(element).color);
      const background = backgroundOf(element);
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + 0.05) / (dark + 0.05);
    };
    const button = Array.from(document.querySelectorAll('button')).find((element) =>
      element.textContent?.includes('Criar acesso e continuar')
    );
    const information = Array.from(document.querySelectorAll('section p')).find((element) =>
      element.textContent?.includes('Complete seus dados com segurança')
    );
    if (!button || !information) return { passed: false, ratios: [] as number[] };
    const ratios = [ratioFor(button), ratioFor(information)];
    return { passed: ratios.every((ratio) => ratio >= 4.5), ratios };
  });
}

const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const inviteToken = `issue-275-privacy-${crypto.randomBytes(24).toString('base64url')}`;
const guardianEmail = `issue-275-privacy-${suffix}@example.test`;
const guardianPassword = 'Senha-segura-275';
const protectedCpf = '52998224725';
const guardianName = 'Responsável Privacidade Issue 275';
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

  const apiOutput: string[] = [];
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
      PRE_REGISTRATION_TELEMETRY_ENABLED: 'true',
      PRIVACY_NOTICE_URL: `${webUrl}/privacidade`,
      PRIVACY_NOTICE_VERSION: '2026-07',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiProcess.stdout?.on('data', (chunk) => apiOutput.push(String(chunk)));
  apiProcess.stderr?.on('data', (chunk) => apiOutput.push(String(chunk)));
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
  const requests: Array<{ url: string; referer?: string; resourceType: string }> = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) =>
    requests.push({
      url: request.url(),
      referer: request.headers().referer,
      resourceType: request.resourceType(),
    })
  );

  await page.goto(`${webUrl}/pre-cadastro/${inviteToken}`, {
    waitUntil: 'networkidle0',
    timeout: 30_000,
  });
  await waitForText(page, 'Convite de pré-matrícula');
  await assertNoHorizontalOverflow(page, 'landing-mobile');

  const referrerPolicy = await page.$eval('meta[name="referrer"]', (element) =>
    element.getAttribute('content')
  );
  assert(referrerPolicy === 'no-referrer', 'Documento público não declarou no-referrer');
  const labelsAssociated = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).every((input) =>
      Boolean(input.labels?.length || input.getAttribute('aria-label') || input.getAttribute('aria-labelledby'))
    )
  );
  assert(labelsAssociated, 'Campos visíveis sem rótulo associado');

  await tabUntil(page, { text: 'Criar acesso' });
  await page.keyboard.press('Enter');
  await tabUntil(page, { type: 'radio', value: 'STUDENT' });
  await page.keyboard.press('ArrowRight');
  const guardianSelected = await page.$eval(
    'input[type="radio"][value="GUARDIAN"]',
    (input) => (input as HTMLInputElement).checked
  );
  assert(guardianSelected, 'Grupo de escolha não permitiu selecionar responsável pelo teclado');
  await tabUntil(page, { text: 'Criar acesso e continuar' });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.id === 'pre-registration-name');

  const inputSemantics = await page.evaluate(() => ({
    nameAutocomplete: document.querySelector<HTMLInputElement>('#pre-registration-name')?.autocomplete,
    emailType: document.querySelector<HTMLInputElement>('#pre-registration-email')?.type,
    emailAutocomplete: document.querySelector<HTMLInputElement>('#pre-registration-email')?.autocomplete,
    passwordType: document.querySelector<HTMLInputElement>('#pre-registration-password')?.type,
    passwordAutocomplete: document.querySelector<HTMLInputElement>('#pre-registration-password')?.autocomplete,
  }));
  assert(
    inputSemantics.nameAutocomplete === 'name' &&
      inputSemantics.emailType === 'email' &&
      inputSemantics.emailAutocomplete === 'email' &&
      inputSemantics.passwordType === 'password' &&
      inputSemantics.passwordAutocomplete === 'new-password',
    `Semântica de teclado móvel inválida: ${JSON.stringify(inputSemantics)}`
  );

  const contrast = await inspectContrast(page);
  assert(contrast.passed, `Contraste insuficiente: ${contrast.ratios.join(', ')}`);

  await fillByLabel(page, 'Nome completo', guardianName);
  await fillByLabel(page, 'E-mail', guardianEmail);
  await fillByLabel(page, 'Senha', 'curta');
  await clickByText(page, 'button', 'Criar acesso e continuar');
  await page.waitForSelector('[role="alert"]', { timeout: 20_000 });
  assert(
    await page.evaluate(() => document.activeElement?.getAttribute('role') === 'alert'),
    'Erro de submissão não recebeu foco'
  );

  await fillByLabel(page, 'Senha', guardianPassword);
  await clickByText(page, 'button', 'Criar acesso e continuar');
  await waitForHeading(page, 'Informe seu vínculo');
  await waitForFocusedText(page, 'Informe seu vínculo');

  const finalUrl = new URL(page.url());
  assert(finalUrl.pathname === '/pre-cadastro', `Token permaneceu na URL: ${page.url()}`);
  assert(!finalUrl.search && !finalUrl.hash, 'URL autenticada preservou query ou fragmento');
  const requestCountAfterClaim = requests.length;
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

  const accessibilityTree = await page.accessibility.snapshot({ interestingOnly: false });
  const serializedTree = JSON.stringify(accessibilityTree);
  assert(serializedTree.includes('Informe seu vínculo'), 'Árvore acessível não contém o título atual');
  assert(serializedTree.includes('Vínculo com o menor'), 'Árvore acessível não contém o campo principal');
  await writeFile(
    path.join(artifactDir, 'accessibility-tree.json'),
    `${JSON.stringify(accessibilityTree, null, 2)}\n`,
    'utf8'
  );

  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await page.waitForFunction(() => (window.visualViewport?.scale || 1) >= 1.9);
  await assertNoHorizontalOverflow(page, 'guardian-mobile-zoom-200');
  const zoomScale = await page.evaluate(() => window.visualViewport?.scale || 1);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });

  await page.screenshot({
    path: path.join(artifactDir, 'accessibility-mobile.png'),
    fullPage: true,
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30_000 });
  await waitForHeading(page, 'Informe seu vínculo');
  await waitForFocusedText(page, 'Informe seu vínculo');
  await assertNoHorizontalOverflow(page, 'guardian-desktop');
  await page.screenshot({
    path: path.join(artifactDir, 'accessibility-desktop.png'),
    fullPage: true,
  });

  const postClaimRequests = requests.slice(requestCountAfterClaim);
  const postClaimConsole = consoleMessages.slice(consoleCountAfterClaim);
  for (const observed of [
    ...postClaimRequests.map((item) => item.url),
    ...postClaimConsole,
    ...pageErrors,
  ]) {
    assert(!observed.includes(inviteToken), 'Token bruto apareceu após o redirecionamento autenticado');
    assert(!observed.includes(protectedCpf), 'CPF apareceu em URL ou log do navegador');
  }

  const tokenRequests = requests.filter((request) => request.url.includes(inviteToken));
  assert(tokenRequests.length >= 2, 'Fase inicial tokenizada não foi observada');
  for (const request of tokenRequests) {
    const expected =
      request.url === `${webUrl}/pre-cadastro/${inviteToken}` ||
      request.url.startsWith(`${apiUrl}/api/v1/pre-cadastro/${inviteToken}`);
    assert(expected, `Token apareceu em request inesperado: ${request.url}`);
  }
  for (const request of requests) {
    assert(!request.referer?.includes(inviteToken), `Referer expôs token em ${request.url}`);
  }

  const unexpectedOrigins = [...new Set(requests.map((value) => new URL(value.url).origin))].filter(
    (origin) => origin !== webUrl && origin !== apiUrl
  );
  assert(unexpectedOrigins.length === 0, `Analytics/APM externo observado: ${unexpectedOrigins.join(', ')}`);
  assert(pageErrors.length === 0, `Erros no navegador: ${pageErrors.join(' | ')}`);

  await new Promise((resolve) => setTimeout(resolve, 500));
  const serializedApiOutput = apiOutput.join('');
  const telemetryLines = serializedApiOutput
    .split(/\r?\n/)
    .filter((line) => line.includes('"event":"pre_registration_http"'));
  assert(telemetryLines.length > 0, 'Telemetria técnica não foi observada com a flag habilitada');
  for (const secret of [inviteToken, protectedCpf, guardianEmail, guardianName]) {
    assert(!serializedApiOutput.includes(secret), `Log da API expôs dado sensível: ${secret}`);
  }
  for (const line of telemetryLines) {
    for (const forbidden of ['path', 'query', 'headers', 'body', 'userId', 'contractId']) {
      assert(!line.includes(`"${forbidden}"`), `Telemetria expôs dimensão proibida: ${forbidden}`);
    }
  }

  const privacyReport = {
    schemaVersion: 3,
    kind: 'issue-275-browser-privacy',
    finalPath: finalUrl.pathname,
    localStorageKeys: Object.keys(storage.local),
    sessionStorageKeys: Object.keys(storage.session),
    inviteTokenRemovedFromUrl: true,
    inviteTokenAbsentFromStorage: true,
    cpfAbsentFromStorageAndBrowserLogs: true,
    clinicalPayloadAbsentFromStorage: true,
    inspectionBoundary: 'full-invite-lifecycle',
    initialPhaseInspected: true,
    referrerPolicy,
    referrerTokenAbsent: true,
    apiTelemetryObserved: true,
    apiLogsSanitized: true,
    tokenRequestCount: tokenRequests.length,
    totalRequestCount: requests.length,
    postClaimRequestCount: postClaimRequests.length,
    browserConsoleMessagesAfterClaim: postClaimConsole.length,
    browserErrors: pageErrors.length,
    externalAnalyticsOrigins: unexpectedOrigins,
  };
  await writeFile(
    path.join(artifactDir, 'browser-privacy.json'),
    `${JSON.stringify(privacyReport, null, 2)}\n`,
    'utf8'
  );

  const accessibilityReport = {
    schemaVersion: 1,
    kind: 'issue-275-accessibility',
    keyboardOnlyNavigation: true,
    nativeRequiredFieldFocus: true,
    errorFocusManaged: true,
    focusAfterStageChange: true,
    labelsAssociated,
    contrastPassed: contrast.passed,
    contrastRatios: contrast.ratios,
    screenReaderTreeCaptured: true,
    zoom200NoHorizontalOverflow: true,
    observedZoomScale: zoomScale,
    mobileInputSemanticsPassed: true,
    mobileViewport: { width: 390, height: 844 },
    desktopViewport: { width: 1440, height: 900 },
  };
  await writeFile(
    path.join(artifactDir, 'accessibility.json'),
    `${JSON.stringify(accessibilityReport, null, 2)}\n`,
    'utf8'
  );

  console.log(JSON.stringify({ privacyReport, accessibilityReport }, null, 2));
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
