import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outputDir = path.join(repoRoot, 'artifacts', 'library-alternating-movement-visual');
const baseUrl = 'http://127.0.0.1:4173';
const route = '/library';
const headSha = process.env.LIBRARY_ALTERNATING_HEAD_SHA || process.env.GITHUB_SHA || 'local';

const masterUser = {
  id: 'user-library-visual',
  email: 'master@example.com',
  name: 'Professor Master',
  type: 'professor',
  professor: {
    id: 'professor-library-visual',
    role: 'master',
    collaboratorFunction: {
      id: 'function-master',
      name: 'Master',
      code: 'master',
      isActive: true,
    },
    contract: {
      id: 'contract-library-visual',
      type: 'academy',
      document: '00000000000100',
      name: 'Academia de validação visual',
    },
  },
  accessControl: {
    isMaster: true,
    permissions: [],
  },
};

const exercise = {
  id: 'exercise-alternating-visual',
  name: 'Exercício Alternado de Teste',
  loadType: 'C',
  movementType: 'A',
  countingType: 'R',
  category: 'RESISTIDO',
  muscleGroup: 'Quadríceps',
  notes: 'Registro sintético para evidência visual da Issue #426',
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
};

function json(data, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(data) };
}

async function waitForServer(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Preview não iniciou em ${url}`);
}

async function installMocking(page) {
  await page.evaluateOnNewDocument((user) => {
    localStorage.setItem('token', 'library-alternating-visual-token');
    localStorage.setItem('user', JSON.stringify(user));
  }, masterUser);

  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === '/api/v1/auth/me') {
      void request.respond(json({ success: true, data: masterUser }));
      return;
    }

    if (url.pathname === '/api/v1/library/exercises' && method === 'GET') {
      void request.respond(json([exercise]));
      return;
    }

    if (url.pathname.startsWith('/api/v1/')) {
      void request.respond(json({ success: false, error: 'Unexpected visual audit request' }, 404));
      return;
    }

    void request.continue();
  });
}

async function clickButtonByText(page, text) {
  const clicked = await page.evaluate((label) => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => item.textContent?.trim().includes(label) && !item.disabled
    );
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Botão “${text}” não encontrado`);
}

async function assertAndSelectMovement(page, labelText, expectedValue = 'A') {
  const result = await page.evaluate(({ label, value }) => {
    const containers = Array.from(document.querySelectorAll('div'));
    const container = containers.find((item) => {
      const directLabel = Array.from(item.children).find((child) => child.tagName === 'LABEL');
      return directLabel?.textContent?.trim() === label && Array.from(item.children).some((child) => child.tagName === 'SELECT');
    });
    const select = container?.querySelector('select');
    if (!select) return { found: false };
    const option = Array.from(select.options).find((item) => item.value === value);
    if (!option) return { found: true, optionFound: false };
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      found: true,
      optionFound: true,
      optionText: option.textContent?.trim() || '',
      selectedValue: select.value,
    };
  }, { label: labelText, value: expectedValue });

  if (!result.found) throw new Error(`Select de movimento “${labelText}” não encontrado`);
  if (!result.optionFound) throw new Error(`Opção A não encontrada em “${labelText}”`);
  if (result.optionText !== 'Alternado') throw new Error(`Rótulo de A inesperado em “${labelText}”: ${result.optionText}`);
  if (result.selectedValue !== expectedValue) throw new Error(`Não foi possível selecionar A em “${labelText}”`);
  return result;
}

async function assertEditMovement(page) {
  const result = await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('div'));
    const container = containers.find((item) => {
      const directLabel = Array.from(item.children).find((child) => child.tagName === 'LABEL');
      return directLabel?.textContent?.trim() === 'Tipo de Movimento' && Array.from(item.children).some((child) => child.tagName === 'SELECT');
    });
    const select = container?.querySelector('select');
    const option = select ? Array.from(select.options).find((item) => item.value === 'A') : null;
    return {
      found: Boolean(select),
      optionText: option?.textContent?.trim() || null,
      selectedValue: select?.value || null,
    };
  });
  if (!result.found) throw new Error('Select Tipo de Movimento ausente no modo editar');
  if (result.optionText !== 'Alternado') throw new Error(`Rótulo A inesperado no modo editar: ${result.optionText}`);
  if (result.selectedValue !== 'A') throw new Error(`Exercício Alternado não abriu com A selecionado: ${result.selectedValue}`);
  return result;
}

async function assertNoDocumentOverflow(page, scenario) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));
  if (dimensions.documentScrollWidth > dimensions.viewportWidth + 1) {
    throw new Error(`${scenario}: overflow horizontal no documento (${dimensions.documentScrollWidth} > ${dimensions.viewportWidth})`);
  }
  return dimensions;
}

async function openLibrary(page, viewport) {
  await page.setViewport(viewport);
  await installMocking(page);
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.textContent?.includes('Biblioteca de Exercícios'));
  await page.waitForFunction(() => document.body.textContent?.includes('Exercício Alternado de Teste'));
  const tableShowsAlternado = await page.evaluate(() => document.body.textContent?.includes('Alternado') || false);
  if (!tableShowsAlternado) throw new Error('Tabela não exibe o rótulo Alternado para movementType=A');
}

async function desktopScenario(browser) {
  const page = await browser.newPage();
  await openLibrary(page, { width: 1440, height: 900 });

  await clickButtonByText(page, 'Filtros');
  const filter = await assertAndSelectMovement(page, 'Movimento');
  await page.waitForNetworkIdle({ idleTime: 100, timeout: 5_000 }).catch(() => {});
  const filterLayout = await assertNoDocumentOverflow(page, 'desktop-filter');
  await page.screenshot({ path: path.join(outputDir, 'desktop-filter-alternado.png'), fullPage: true });

  await clickButtonByText(page, 'Novo Exercício');
  await page.waitForFunction(() => document.body.textContent?.includes('Novo Exercício'));
  const create = await assertAndSelectMovement(page, 'Tipo de Movimento');
  const createLayout = await assertNoDocumentOverflow(page, 'desktop-create');
  await page.screenshot({ path: path.join(outputDir, 'desktop-create-alternado.png'), fullPage: true });

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('h2'));
  await page.click('button[title="Editar"]');
  await page.waitForFunction(() => document.body.textContent?.includes('Editar Exercício'));
  const edit = await assertEditMovement(page);
  const editLayout = await assertNoDocumentOverflow(page, 'desktop-edit');
  await page.screenshot({ path: path.join(outputDir, 'desktop-edit-alternado.png'), fullPage: true });

  await page.close();
  return { filter, create, edit, filterLayout, createLayout, editLayout };
}

async function mobileScenario(browser) {
  const page = await browser.newPage();
  await openLibrary(page, { width: 390, height: 844, isMobile: true });

  await clickButtonByText(page, 'Filtros');
  const filter = await assertAndSelectMovement(page, 'Movimento');
  const filterLayout = await assertNoDocumentOverflow(page, 'mobile-filter');
  await page.screenshot({ path: path.join(outputDir, 'mobile-filter-alternado.png'), fullPage: true });

  await clickButtonByText(page, 'Novo Exercício');
  await page.waitForFunction(() => document.body.textContent?.includes('Novo Exercício'));
  const create = await assertAndSelectMovement(page, 'Tipo de Movimento');
  const createLayout = await assertNoDocumentOverflow(page, 'mobile-create');
  await page.screenshot({ path: path.join(outputDir, 'mobile-create-alternado.png'), fullPage: true });

  await page.close();
  return { filter, create, filterLayout, createLayout };
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const preview = spawn(
  'pnpm',
  ['--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4173'],
  { cwd: repoRoot, stdio: 'inherit', detached: true }
);

let browser;
try {
  await waitForServer(baseUrl);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  const desktop = await desktopScenario(browser);
  const mobile = await mobileScenario(browser);
  const evidence = {
    schemaVersion: 1,
    kind: 'library-alternating-movement-visual-evidence',
    issue: 426,
    route,
    headSha,
    movementType: { code: 'A', label: 'Alternado' },
    scenarios: { desktop, mobile },
    screenshots: [
      'desktop-filter-alternado.png',
      'desktop-create-alternado.png',
      'desktop-edit-alternado.png',
      'mobile-filter-alternado.png',
      'mobile-create-alternado.png',
    ],
  };
  await writeFile(path.join(outputDir, 'visual-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('Library Alternado visual audit completed for filter, create and edit flows on desktop/mobile.');
} finally {
  if (browser) await browser.close();
  if (!preview.killed) process.kill(-preview.pid, 'SIGTERM');
}
