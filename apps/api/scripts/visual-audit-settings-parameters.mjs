import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outputDir = path.join(repoRoot, 'artifacts', 'settings-parameters-visual');
const baseUrl = 'http://127.0.0.1:4173';
const route = '/settings/parameters';
const headSha = process.env.SETTINGS_PARAMETERS_HEAD_SHA || process.env.GITHUB_SHA || 'local';

const masterUser = {
  id: 'user-parameters-visual',
  email: 'master@example.com',
  name: 'Professor Master',
  type: 'professor',
  professor: {
    id: 'professor-parameters-visual',
    role: 'master',
    collaboratorFunction: {
      id: 'function-master',
      name: 'Master',
      code: 'master',
      isActive: true,
    },
    contract: {
      id: 'contract-parameters-visual',
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

const longDescription =
  'Descrição extensa para validar quebra de linha, densidade e ausência de overflow horizontal acidental mesmo quando o conteúdo do parâmetro excede bastante o tamanho normalmente esperado na tabela.';

function initialParameters() {
  return [
    {
      id: 'parameter-1',
      category: 'objetivo',
      code: 'ADP',
      description: longDescription,
      order: 1,
      active: true,
    },
    {
      id: 'parameter-2',
      category: 'metodo',
      code: 'INT',
      description: 'Intervalado progressivo',
      order: 2,
      active: true,
    },
  ];
}

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

async function installMocking(page, { delayedCreate = false } = {}) {
  const state = {
    parameters: initialParameters(),
    createCalls: 0,
    updateCalls: 0,
    deleteCalls: 0,
    renameCalls: 0,
  };

  await page.evaluateOnNewDocument((user) => {
    localStorage.setItem('token', 'settings-parameters-visual-token');
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

    if (url.pathname === '/api/v1/periodization/parameters' && method === 'GET') {
      void request.respond(json({ success: true, data: state.parameters }));
      return;
    }

    if (url.pathname === '/api/v1/periodization/parameters' && method === 'POST') {
      state.createCalls += 1;
      const body = JSON.parse(request.postData() || '{}');
      const created = {
        id: `parameter-created-${state.createCalls}`,
        category: body.category,
        code: body.code,
        description: body.description,
        order: body.order,
        active: true,
      };
      state.parameters = [...state.parameters, created];

      const respond = () => request.respond(json({ success: true, data: created }));
      if (delayedCreate) {
        setTimeout(() => void respond(), 700);
      } else {
        void respond();
      }
      return;
    }

    if (url.pathname === '/api/v1/periodization/parameters/category' && method === 'PUT') {
      state.renameCalls += 1;
      const body = JSON.parse(request.postData() || '{}');
      state.parameters = state.parameters.map((parameter) =>
        parameter.category === body.fromCategory
          ? { ...parameter, category: body.toCategory }
          : parameter
      );
      void request.respond(json({ success: true, data: { updated: 1 } }));
      return;
    }

    if (url.pathname.startsWith('/api/v1/periodization/parameters/') && method === 'PUT') {
      state.updateCalls += 1;
      const id = url.pathname.split('/').pop();
      const body = JSON.parse(request.postData() || '{}');
      state.parameters = state.parameters.map((parameter) =>
        parameter.id === id ? { ...parameter, ...body } : parameter
      );
      const updated = state.parameters.find((parameter) => parameter.id === id);
      void request.respond(json({ success: true, data: updated }));
      return;
    }

    if (url.pathname.startsWith('/api/v1/periodization/parameters/') && method === 'DELETE') {
      state.deleteCalls += 1;
      const id = url.pathname.split('/').pop();
      state.parameters = state.parameters.filter((parameter) => parameter.id !== id);
      void request.respond(json({ success: true, data: null }));
      return;
    }

    if (url.pathname.startsWith('/api/v1/')) {
      void request.respond(json({ success: false, error: 'Unexpected visual audit request' }, 404));
      return;
    }

    void request.continue();
  });

  return state;
}

async function focusButtonByText(page, text) {
  const focused = await page.evaluate((label) => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === label && !item.disabled
    );
    button?.focus();
    return document.activeElement === button;
  }, text);
  if (!focused) throw new Error(`Botão “${text}” não recebeu foco`);
}

async function pressButtonByText(page, text, key = 'Enter') {
  await focusButtonByText(page, text);
  await page.keyboard.press(key);
}

async function exerciseKeyboardCreateAndEdit(page, state) {
  const interactions = [];

  await pressButtonByText(page, 'Novo parâmetro', 'Enter');
  await page.waitForSelector('#parameter-category');

  const initialFocus = await page.evaluate(() => document.activeElement?.id || '');
  if (initialFocus !== 'parameter-category') {
    throw new Error(`Create: foco inicial esperado em parameter-category, recebido ${initialFocus || 'nenhum'}`);
  }
  interactions.push({ control: 'novo-parametro', role: 'button', key: 'Enter', passed: true });

  await pressButtonByText(page, 'Salvar parâmetro', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('[aria-invalid="true"]').length >= 3);
  const invalidFocus = await page.evaluate(() => document.activeElement?.id || '');
  if (invalidFocus !== 'parameter-category') {
    throw new Error(`Validação: primeiro campo inválido não recebeu foco (${invalidFocus || 'nenhum'})`);
  }
  interactions.push({ control: 'validacao-obrigatorios', role: 'form', key: 'Enter', passed: true });

  await page.focus('#parameter-category');
  await page.keyboard.press('End');
  await page.waitForFunction(() => document.querySelector('#parameter-category')?.value !== '');
  await page.keyboard.press('Tab');
  await page.keyboard.type('brw');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Parâmetro criado pelo fluxo real de teclado');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');

  const saveFocused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  if (saveFocused !== 'Salvar parâmetro') {
    throw new Error(`Create: navegação por Tab não alcançou Salvar parâmetro; foco em ${saveFocused || 'nenhum'}`);
  }

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Parâmetro criado com sucesso.'));

  if (state.createCalls !== 1) {
    throw new Error(`Create: submissão repetida gerou ${state.createCalls} chamadas POST; esperado 1`);
  }

  const focusAfterCreate = await page.evaluate(() => document.activeElement?.id || '');
  if (focusAfterCreate !== 'parameters-new-button') {
    throw new Error(`Create: foco não retornou ao botão Novo parâmetro (${focusAfterCreate || 'nenhum'})`);
  }
  interactions.push({ control: 'salvar-parametro', role: 'button', key: 'Enter x2', passed: true, outboundCalls: 1 });

  await pressButtonByText(page, 'Editar', 'Enter');
  const editFocus = await page.evaluate(() => document.activeElement?.id || '');
  if (editFocus !== 'parameter-description') {
    throw new Error(`Edit: foco inicial esperado em parameter-description, recebido ${editFocus || 'nenhum'}`);
  }
  interactions.push({ control: 'editar', role: 'button', key: 'Enter', passed: true });

  await page.keyboard.press('Control+A');
  await page.keyboard.type('Alteração que deve ser cancelada');
  await pressButtonByText(page, 'Cancelar', 'Space');

  if (state.updateCalls !== 0) {
    throw new Error(`Edit: cancelamento produziu ${state.updateCalls} chamadas PUT; esperado 0`);
  }
  const focusAfterCancel = await page.evaluate(() => document.activeElement?.id || '');
  if (focusAfterCancel !== 'parameters-new-button') {
    throw new Error(`Edit: foco não retornou ao botão Novo parâmetro após cancelar (${focusAfterCancel || 'nenhum'})`);
  }
  interactions.push({ control: 'cancelar-edicao', role: 'button', key: 'Space', passed: true, outboundCalls: 0 });

  const accordionFocused = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === 'Gerenciar categorias'
    );
    button?.focus();
    return document.activeElement === button && button?.getAttribute('aria-expanded') === 'false';
  });
  if (!accordionFocused) throw new Error('Accordion: não iniciou recolhido ou não recebeu foco');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === 'Gerenciar categorias'
    );
    return button?.getAttribute('aria-expanded') === 'true';
  });
  interactions.push({ control: 'gerenciar-categorias', role: 'button', key: 'Enter', passed: true });

  return interactions;
}

async function enterCreateEditorForMobile(page) {
  await pressButtonByText(page, 'Novo parâmetro', 'Enter');
  await page.waitForSelector('#parameter-category');
  const focus = await page.evaluate(() => document.activeElement?.id || '');
  if (focus !== 'parameter-category') {
    throw new Error(`Mobile editor: foco inicial incorreto (${focus || 'nenhum'})`);
  }
}

async function collectDiagnostics(page) {
  return page.evaluate((expectedLongDescription) => {
    const root = document.documentElement;
    const table = document.querySelector('table');
    const tableContainer = table?.parentElement;
    const accordion = Array.from(document.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === 'Gerenciar categorias'
    );
    const visibleButtons = Array.from(document.querySelectorAll('button')).filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    return {
      title: Array.from(document.querySelectorAll('h1')).map((item) => item.textContent?.trim()).find((text) => text === 'Parâmetros de treino') || null,
      viewportWidth: root.clientWidth,
      viewportHeight: root.clientHeight,
      documentScrollWidth: root.scrollWidth,
      documentScrollHeight: root.scrollHeight,
      tablePresent: Boolean(table),
      tableAriaRowcount: table?.getAttribute('aria-rowcount') || null,
      tableContainerOverflowX: tableContainer ? getComputedStyle(tableContainer).overflowX : null,
      tableContainerClientWidth: tableContainer?.clientWidth || null,
      tableScrollWidth: table?.scrollWidth || null,
      longDescriptionPresent: document.body.textContent?.includes(expectedLongDescription) || false,
      accordionExpanded: accordion?.getAttribute('aria-expanded') || null,
      statusCount: document.querySelectorAll('[role="status"]').length,
      alertCount: document.querySelectorAll('[role="alert"]').length,
      buttonsWithoutTextOrLabel: visibleButtons.filter(
        (button) => !button.textContent?.trim() && !button.getAttribute('aria-label')
      ).length,
      categoryLabelLinked: document.querySelector('label[for="parameter-filter-category"]')?.textContent?.trim() || null,
      searchLabelLinked: document.querySelector('label[for="parameter-filter-search"]')?.textContent?.trim() || null,
      activeElement: document.activeElement instanceof HTMLElement
        ? { id: document.activeElement.id || null, text: document.activeElement.textContent?.trim() || null, tag: document.activeElement.tagName }
        : null,
    };
  }, longDescription);
}

function validateDiagnostics(name, diagnostics, { expectTable = true, expectInternalTableScroll = false } = {}) {
  if (diagnostics.title !== 'Parâmetros de treino') {
    throw new Error(`${name}: título da rota ausente`);
  }
  if (diagnostics.documentScrollWidth > diagnostics.viewportWidth + 1) {
    throw new Error(`${name}: overflow horizontal acidental no documento`);
  }
  if (expectTable && !diagnostics.tablePresent) {
    throw new Error(`${name}: tabela esperada não está visível`);
  }
  if (diagnostics.tableAriaRowcount !== null) {
    throw new Error(`${name}: tabela nativa não deve declarar aria-rowcount`);
  }
  if (expectTable && !diagnostics.longDescriptionPresent) {
    throw new Error(`${name}: conteúdo longo de teste não está visível`);
  }
  if (expectInternalTableScroll) {
    if (diagnostics.tableContainerOverflowX !== 'auto') {
      throw new Error(`${name}: container da tabela não possui overflow-x auto deliberado`);
    }
    if ((diagnostics.tableScrollWidth || 0) <= (diagnostics.tableContainerClientWidth || 0)) {
      throw new Error(`${name}: cenário mobile não exercitou o scroll horizontal interno da tabela`);
    }
  }
  if (diagnostics.buttonsWithoutTextOrLabel > 0) {
    throw new Error(`${name}: há botão visível sem nome acessível textual/aria-label`);
  }
  if (expectTable && (!diagnostics.categoryLabelLinked || !diagnostics.searchLabelLinked)) {
    throw new Error(`${name}: filtros não preservaram labels programaticamente associados`);
  }
}

async function capture(browser, { name, viewport, exerciseKeyboard = false, mobileEditor = false, expectInternalTableScroll = false }) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const state = await installMocking(page, { delayedCreate: exerciseKeyboard });

  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForFunction(() => document.body.textContent?.includes('Parâmetros cadastrados'));
  await page.waitForSelector('table', { timeout: 20_000 });

  let controlInteractions = [];
  if (exerciseKeyboard) {
    controlInteractions = await exerciseKeyboardCreateAndEdit(page, state);
  }
  if (mobileEditor) {
    await enterCreateEditorForMobile(page);
  }

  const diagnostics = await collectDiagnostics(page);
  validateDiagnostics(name, diagnostics, {
    expectTable: !mobileEditor,
    expectInternalTableScroll,
  });

  if (browserErrors.length) {
    throw new Error(`${name}: erros de navegador: ${browserErrors.join(' | ')}`);
  }

  const accessibilityTree = await page.accessibility.snapshot({ interestingOnly: false });
  if (!accessibilityTree) throw new Error(`${name}: árvore de acessibilidade ausente`);

  const screenshotPath = path.join(outputDir, `${name}.png`);
  const diagnosticsPath = path.join(outputDir, `${name}.diagnostics.json`);
  const accessibilityPath = path.join(outputDir, `${name}.accessibility.json`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeFile(
    diagnosticsPath,
    `${JSON.stringify({
      name,
      route,
      viewport,
      diagnostics,
      controlInteractions,
      requestCounts: {
        create: state.createCalls,
        update: state.updateCalls,
        delete: state.deleteCalls,
        rename: state.renameCalls,
      },
    }, null, 2)}\n`,
    'utf8'
  );
  await writeFile(accessibilityPath, `${JSON.stringify(accessibilityTree, null, 2)}\n`, 'utf8');

  await page.close();
  return {
    name,
    route,
    viewport: `${viewport.width}x${viewport.height}`,
    screenshot: path.relative(repoRoot, screenshotPath),
    diagnostics: path.relative(repoRoot, diagnosticsPath),
    accessibilityTree: path.relative(repoRoot, accessibilityPath),
    keyboardOnly: exerciseKeyboard,
    longContent: true,
    controlInteractions,
    requestCounts: {
      create: state.createCalls,
      update: state.updateCalls,
      delete: state.deleteCalls,
      rename: state.renameCalls,
    },
  };
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
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const scenarios = [
    {
      name: 'parameters-desktop-keyboard',
      viewport: { width: 1440, height: 900 },
      exerciseKeyboard: true,
    },
    {
      name: 'parameters-low-height-list',
      viewport: { width: 1366, height: 768 },
    },
    {
      name: 'parameters-mobile-list',
      viewport: { width: 390, height: 844 },
      expectInternalTableScroll: true,
    },
    {
      name: 'parameters-mobile-editor',
      viewport: { width: 390, height: 844 },
      mobileEditor: true,
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    results.push(await capture(browser, scenario));
  }

  const visualMetrics = {
    schema_version: 2,
    head_sha: headSha,
    routes: [
      {
        route,
        viewports: ['1440x900', '1366x768', '390x844'],
        long_content_or_zoom: true,
        keyboard_only: true,
        accessibility_tree: {
          captured: true,
          files: results.map((item) => item.accessibilityTree),
        },
        scenarios: results,
      },
    ],
  };

  await writeFile(
    path.join(outputDir, 'visual-metrics.json'),
    `${JSON.stringify(visualMetrics, null, 2)}\n`,
    'utf8'
  );

  console.log('Settings parameters visual audit completed for desktop, low-height and mobile scenarios.');
} finally {
  if (browser) await browser.close();
  if (!preview.killed) process.kill(-preview.pid, 'SIGTERM');
}
