import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';

const baseUrl = process.env.CAPACITY_VISUAL_BASE_URL || 'http://127.0.0.1:4173';
const workspace = process.env.GITHUB_WORKSPACE || path.resolve(process.cwd(), '../..');
const outputDir = process.env.CAPACITY_VISUAL_OUTPUT
  ? path.resolve(process.cwd(), process.env.CAPACITY_VISUAL_OUTPUT)
  : path.join(workspace, 'artifacts/issue-136-visual');
const route = '/protocolo-avaliacao-fisica/adipometria';
const routeWithContext = `${route}?alunoId=visual-aluno&assessmentId=visual-adpt`;

const user = {
  id: 'visual-user',
  email: 'professor.visual@example.com',
  name: 'Professora Marina',
  type: 'professor',
  profile: { name: 'Professora Marina', avatar: null },
  professor: {
    id: 'visual-professor',
    role: 'professor',
    collaboratorFunction: {
      id: 'visual-function',
      name: 'Professora',
      code: 'professor',
      isActive: true,
    },
    contract: {
      id: 'visual-contract',
      type: 'academy',
      document: '00000000000100',
      name: 'Acesso Saúde & Performance',
      tradeName: 'Acesso Saúde & Performance',
      logoUrl: null,
    },
  },
  accessControl: {
    isMaster: false,
    permissions: [
      { screenKey: 'physicalAssessment.protocol', blockKey: null, canView: true },
      {
        screenKey: 'physicalAssessment.protocol',
        blockKey: 'physicalAssessment.adpt.view',
        canView: true,
      },
      {
        screenKey: 'physicalAssessment.protocol',
        blockKey: 'physicalAssessment.adpt.actions.manage',
        canView: true,
      },
      {
        screenKey: 'physicalAssessment.protocol',
        blockKey: 'physicalAssessment.adpt.actions.correctCompleted',
        canView: true,
      },
    ],
  },
};

const student = {
  id: 'visual-aluno',
  userId: 'visual-student-user',
  professorId: 'visual-professor',
  schedulePlan: 'fixed',
  age: 42,
  maxHeartRate: 183,
  restingHeartRate: 58,
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-08-04T10:00:00.000Z',
  user: {
    email: 'aluna.visual@example.com',
    profile: {
      name: 'Ana Carolina de Oliveira Albuquerque',
      phone: '+55 15 99999-0000',
      gender: 'male',
    },
  },
};

const protocol = {
  code: 'GUEDES_1991_ADULT_YOUNG',
  name: 'Guedes 1991 — adultos jovens',
  version: 1,
  status: 'APPROVED',
  compatibility: {
    compatible: true,
    reasons: [],
    warnings: [],
  },
};

const anthropometryReference = {
  anthropometryAssessmentId: 'visual-anthropometry',
  assessmentCode: 'ANTR-014',
  assessmentDate: '2026-08-01',
};

const assessment = {
  id: 'visual-adpt',
  contractId: 'visual-contract',
  alunoId: 'visual-aluno',
  professorId: 'visual-professor',
  code: 'ADPT-001',
  sequenceNumber: 1,
  assessmentDate: '2026-08-04',
  status: 'DRAFT',
  revisionStatus: 'DRAFT',
  rootAssessmentId: 'visual-adpt',
  revisionNumber: 1,
  protocolCode: protocol.code,
  protocolVersion: protocol.version,
  protocolSex: 'male',
  profileSexSnapshot: 'male',
  protocolSexSource: 'profile',
  measurements: {
    weightKg: 80,
    tricepsMm: 12,
    subscapularMm: 14,
    suprailiacMm: 18,
    abdominalMm: 20,
    thighMm: 16,
  },
  anthropometryReference,
  notes: 'Coleta realizada no período da manhã, com protocolo e apoio antropométrico revisados.',
  createdAt: '2026-08-04T12:00:00.000Z',
  updatedAt: '2026-08-04T12:10:00.000Z',
};

const anthropometrySupport = {
  latestEligible: {
    anthropometryAssessmentId: 'visual-anthropometry',
    assessmentCode: 'ANTR-014',
    assessmentDate: '2026-08-01',
    notes: 'Referências anatômicas coletadas no mesmo ciclo de avaliação.',
    measurements: [
      {
        segmentId: 'triceps-reference',
        segmentName: 'Distância olécrano-acrômio do braço direito',
        segmentType: 'linear',
        technicalDescription: 'Distância entre olécrano e articulação acrômio-clavicular.',
        formulaHint: 'Ponto médio para dobra tricipital',
        value: 31.4,
        unit: 'cm',
        observation: null,
      },
      {
        segmentId: 'thigh-reference',
        segmentName: 'Distância ligamento inguinal-patela da coxa direita',
        segmentType: 'linear',
        technicalDescription: 'Distância entre ligamento inguinal e borda superior da patela.',
        formulaHint: 'Ponto médio para dobra da coxa',
        value: 43.8,
        unit: 'cm',
        observation: null,
      },
    ],
    observations: [],
  },
  selected: {
    anthropometryAssessmentId: 'visual-anthropometry',
    assessmentCode: 'ANTR-014',
    assessmentDate: '2026-08-01',
    notes: 'Referências anatômicas coletadas no mesmo ciclo de avaliação.',
    measurements: [
      {
        segmentId: 'triceps-reference',
        segmentName: 'Distância olécrano-acrômio do braço direito',
        segmentType: 'linear',
        technicalDescription: 'Distância entre olécrano e articulação acrômio-clavicular.',
        formulaHint: 'Ponto médio para dobra tricipital',
        value: 31.4,
        unit: 'cm',
        observation: null,
      },
      {
        segmentId: 'thigh-reference',
        segmentName: 'Distância ligamento inguinal-patela da coxa direita',
        segmentType: 'linear',
        technicalDescription: 'Distância entre ligamento inguinal e borda superior da patela.',
        formulaHint: 'Ponto médio para dobra da coxa',
        value: 43.8,
        unit: 'cm',
        observation: null,
      },
    ],
    observations: [],
  },
};

const previewWithBlocker = {
  protocol,
  normalizedMeasurements: assessment.measurements,
  usedSkinfolds: ['tricepsMm', 'suprailiacMm', 'abdominalMm'],
  compatibility: {
    compatible: false,
    reasons: [
      {
        code: 'SKINFOLD_CAPACITY_WARNING_CONFIRMATION_REQUIRED',
        field: 'abdominalMm',
        message: 'Revise o limite técnico do adipômetro e confirme o alerta antes de concluir.',
      },
    ],
    warnings: [
      {
        code: 'VISUAL_ATYPICAL_VALUE',
        field: 'abdominalMm',
        message: 'Valor atípico permitido para revisão profissional.',
      },
    ],
  },
  results: {
    skinfoldTotalMm: 80,
    bodyFatPercentage: 19.4,
    fatMassKg: 15.52,
    leanMassKg: 64.48,
  },
  inputFingerprint: 'a'.repeat(64),
  canFinalize: false,
  anthropometrySupport: {
    latestEligible: anthropometryReference,
    linked: anthropometryReference,
  },
};

function envelope(data) {
  return JSON.stringify({ success: true, data });
}

function errorEnvelope(message, code) {
  return JSON.stringify({
    success: false,
    error: { message, details: { code } },
  });
}

async function waitForPreview() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Preview may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Web preview did not become available at ${baseUrl}`);
}

async function clickButtonByText(page, text) {
  const clicked = await page.evaluate((label) => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === label
    );
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

async function waitForText(page, text) {
  await page.waitForFunction(
    (expected) => document.body.textContent?.includes(expected),
    { timeout: 30_000 },
    text
  );
}

async function openWorkspace(page) {
  await page.goto(`${baseUrl}${routeWithContext}`, { waitUntil: 'networkidle0' });
  await waitForText(page, 'Adipometria');
  await waitForText(page, 'ADPT-001');
  await page.waitForSelector('#adpt-tricepsMm');
}

await mkdir(outputDir, { recursive: true });
await waitForPreview();

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
const browserErrors = [];
let forceConflict = false;

page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (forceConflict && text.includes('409')) return;
  browserErrors.push(`console: ${text}`);
});

await page.evaluateOnNewDocument((authenticatedUser) => {
  localStorage.setItem('token', 'visual-token');
  localStorage.setItem('user', JSON.stringify(authenticatedUser));
}, user);

await page.setRequestInterception(true);
page.on('request', async (request) => {
  if (!request.url().includes('/api/v1/')) {
    await request.continue();
    return;
  }

  const { pathname } = new URL(request.url());
  const method = request.method();

  if (
    forceConflict
    && method === 'PUT'
    && pathname === '/api/v1/adipometry/assessments/visual-adpt/draft'
  ) {
    await request.respond({
      status: 409,
      contentType: 'application/json; charset=utf-8',
      body: errorEnvelope(
        'O rascunho foi alterado em outra sessão.',
        'ADIPOMETRY_CONFLICT'
      ),
    });
    return;
  }

  let fixture = null;
  if (pathname.endsWith('/api/v1/auth/me')) fixture = user;
  else if (pathname === '/api/v1/alunos') {
    fixture = {
      alunos: [student],
      pagination: { page: 1, limit: 200, total: 1, pages: 1 },
    };
  } else if (pathname === '/api/v1/adipometry/responsible-professors') {
    fixture = [{ id: 'visual-professor', name: 'Professora Marina' }];
  } else if (pathname === '/api/v1/adipometry/alunos/visual-aluno/assessments') {
    fixture = [assessment];
  } else if (pathname === '/api/v1/adipometry/assessments/visual-adpt') {
    fixture = assessment;
  } else if (pathname === '/api/v1/adipometry/protocols/available') {
    fixture = [protocol];
  } else if (pathname === '/api/v1/adipometry/alunos/visual-aluno/anthropometry-support') {
    fixture = anthropometrySupport;
  } else if (
    method === 'PUT'
    && pathname === '/api/v1/adipometry/assessments/visual-adpt/draft'
  ) {
    fixture = { ...assessment, updatedAt: '2026-08-04T12:20:00.000Z' };
  } else if (
    method === 'POST'
    && pathname === '/api/v1/adipometry/assessments/visual-adpt/calculate'
  ) {
    fixture = previewWithBlocker;
  }

  await request.respond({
    status: fixture === null ? 404 : 200,
    contentType: 'application/json; charset=utf-8',
    body:
      fixture === null
        ? errorEnvelope('Fixture visual ADPT não configurada.', 'VISUAL_FIXTURE_NOT_FOUND')
        : envelope(fixture),
  });
});

const evidence = {
  schemaVersion: 1,
  issue: 248,
  route,
  authenticatedUserId: user.id,
  permissions: user.accessControl.permissions,
  headSha: process.env.AUDIT_HEAD_SHA || process.env.GITHUB_SHA || null,
  baseSha: process.env.AUDIT_BASE_SHA || null,
  mergePreviewSha: process.env.AUDIT_MERGE_PREVIEW_SHA || process.env.GITHUB_SHA || null,
  viewports: [],
  scenarios: [],
  focusRestoredAfterHelp: false,
  helpLinkSecurity: null,
  horizontalOverflow: null,
  consoleErrors: browserErrors,
  generatedAt: null,
};

try {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await openWorkspace(page);
  await page.screenshot({
    path: path.join(outputDir, 'adipometry-issue-248-1440x900.png'),
  });
  evidence.viewports.push({
    width: 1440,
    height: 900,
    screenshot: 'adipometry-issue-248-1440x900.png',
    scenario: 'authenticated persisted draft',
  });
  evidence.scenarios.push('authenticated ADPT route with student locked from Central');
  evidence.scenarios.push('persisted header and all six persisted measurements');

  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
  await openWorkspace(page);
  await page.screenshot({
    path: path.join(outputDir, 'adipometry-issue-248-1366x768.png'),
  });
  evidence.viewports.push({
    width: 1366,
    height: 768,
    screenshot: 'adipometry-issue-248-1366x768.png',
    scenario: 'desktop guided flow',
  });

  const helpSelector = 'button[aria-label="Abrir ajuda de Dobra tricipital"]';
  await page.focus(helpSelector);
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]');
  evidence.helpLinkSecurity = await page.$eval(
    '[role="dialog"] a[href="https://youtube.com/shorts/YLiJ0OSeThM"]',
    (link) => ({
      target: link.getAttribute('target'),
      rel: link.getAttribute('rel'),
      href: link.getAttribute('href'),
    })
  );
  await page.screenshot({
    path: path.join(outputDir, 'adipometry-issue-248-help-1366x768.png'),
  });
  evidence.viewports.push({
    width: 1366,
    height: 768,
    screenshot: 'adipometry-issue-248-help-1366x768.png',
    scenario: 'keyboard help dialog without configured image',
  });
  evidence.scenarios.push('help opened by keyboard with optional-image fallback and secure external link');
  await page.keyboard.press('Escape');
  evidence.focusRestoredAfterHelp = await page.evaluate(
    () => document.activeElement?.getAttribute('aria-label') === 'Abrir ajuda de Dobra tricipital'
  );

  await page.$eval('#adpt-tricepsMm', (input) => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set;
    valueSetter?.call(input, '15');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitForText(page, 'Alterações não calculadas');
  forceConflict = true;
  await clickButtonByText(page, 'Salvar rascunho');
  await waitForText(page, 'O rascunho foi alterado em outra sessão.');
  await page.evaluate(() => {
    const alert = Array.from(document.querySelectorAll('[role="alert"]')).find(
      (item) => item.textContent?.includes('outra sessão')
    );
    alert?.scrollIntoView({ block: 'center' });
  });
  await page.screenshot({
    path: path.join(outputDir, 'adipometry-issue-248-conflict-1366x768.png'),
  });
  evidence.viewports.push({
    width: 1366,
    height: 768,
    screenshot: 'adipometry-issue-248-conflict-1366x768.png',
    scenario: '409 conflict preserving local values',
  });
  evidence.scenarios.push('409 conflict with explicit server/local reconciliation actions');

  forceConflict = false;
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await openWorkspace(page);
  await clickButtonByText(page, 'Salvar e calcular');
  await waitForText(page, 'Pendências que impedem a conclusão');
  await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('p')).find(
      (item) => item.textContent?.includes('Pendências que impedem a conclusão')
    );
    heading?.scrollIntoView({ block: 'center' });
  });
  await page.screenshot({
    path: path.join(outputDir, 'adipometry-issue-248-clinical-blocker-1440x900.png'),
  });
  evidence.viewports.push({
    width: 1440,
    height: 900,
    screenshot: 'adipometry-issue-248-clinical-blocker-1440x900.png',
    scenario: 'authoritative preview with clinical blocker',
  });
  evidence.scenarios.push('API preview with blocker, warning and disabled finalization');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await openWorkspace(page);
  evidence.horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  await page.screenshot({
    path: path.join(outputDir, 'adipometry-issue-248-390x844.png'),
  });
  evidence.viewports.push({
    width: 390,
    height: 844,
    screenshot: 'adipometry-issue-248-390x844.png',
    scenario: 'mobile authenticated draft without horizontal overflow',
  });
  evidence.scenarios.push('mobile layout at 390x844 without horizontal overflow');

  evidence.generatedAt = new Date().toISOString();
  if (!evidence.focusRestoredAfterHelp) {
    throw new Error('ADPT help dialog did not restore focus to its trigger');
  }
  if (!evidence.horizontalOverflow) {
    throw new Error('ADPT route has horizontal overflow at 390x844');
  }
  if (
    evidence.helpLinkSecurity?.target !== '_blank'
    || !evidence.helpLinkSecurity?.rel?.includes('noopener')
    || !evidence.helpLinkSecurity?.rel?.includes('noreferrer')
  ) {
    throw new Error('ADPT help link does not satisfy the external-link security contract');
  }
  if (browserErrors.length) {
    throw new Error(`ADPT browser errors: ${browserErrors.join(' | ')}`);
  }

  await writeFile(
    path.join(outputDir, 'adipometry-issue-248-manifest.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
