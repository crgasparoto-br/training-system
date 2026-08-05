import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';

const baseUrl = process.env.CAPACITY_VISUAL_BASE_URL || 'http://127.0.0.1:4173';
const workspace = process.env.GITHUB_WORKSPACE || path.resolve(process.cwd(), '../..');
const outputDir = process.env.CAPACITY_VISUAL_OUTPUT
  ? path.resolve(process.cwd(), process.env.CAPACITY_VISUAL_OUTPUT)
  : path.join(workspace, 'artifacts/issue-249-adipometry-central-visual');
const route = '/central-do-aluno/visual-aluno';

const user = {
  id: 'visual-central-user',
  email: 'professora.central@example.com',
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
      { screenKey: 'students.details', blockKey: null, canView: true },
      {
        screenKey: 'students.details',
        blockKey: 'students.details.assessments',
        canView: true,
      },
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
    ],
  },
};

const student = {
  id: 'visual-aluno',
  userId: 'visual-student-user',
  professorId: 'visual-professor',
  schedulePlan: 'fixed',
  age: 28,
  maxHeartRate: 192,
  restingHeartRate: 58,
  createdAt: '2026-01-10T10:00:00.000Z',
  updatedAt: '2026-08-05T10:00:00.000Z',
  user: {
    email: 'aluna.central@example.com',
    profile: {
      name: 'Ana Carolina de Oliveira Albuquerque',
      phone: '+55 15 99999-0000',
      gender: 'female',
      avatar: null,
    },
  },
};

const currentAssessment = {
  id: 'central-adpt-current',
  contractId: 'visual-contract',
  alunoId: 'visual-aluno',
  professorId: 'visual-professor',
  code: 'ADPT-002',
  sequenceNumber: 2,
  assessmentDate: '2026-08-01',
  status: 'COMPLETED',
  revisionStatus: 'FINALIZED',
  rootAssessmentId: 'central-adpt-current',
  revisionNumber: 1,
  protocolCode: 'GUEDES_1991_ADULT_YOUNG',
  protocolVersion: 2,
  bodyFatPercentage: 22.35,
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:30:00.000Z',
};

const olderAssessment = {
  ...currentAssessment,
  id: 'central-adpt-older',
  code: 'ADPT-001',
  sequenceNumber: 1,
  assessmentDate: '2026-05-01',
  rootAssessmentId: 'central-adpt-older',
  protocolVersion: 1,
  bodyFatPercentage: 24.1,
  createdAt: '2026-05-01T12:00:00.000Z',
  updatedAt: '2026-05-01T12:30:00.000Z',
};

const draftAssessment = {
  ...currentAssessment,
  id: 'central-adpt-draft',
  code: 'ADPT-003',
  sequenceNumber: 3,
  assessmentDate: '2026-08-05',
  status: 'DRAFT',
  revisionStatus: 'DRAFT',
  rootAssessmentId: 'central-adpt-draft',
  protocolCode: null,
  protocolVersion: null,
  bodyFatPercentage: null,
  createdAt: '2026-08-05T12:00:00.000Z',
  updatedAt: '2026-08-05T15:10:00.000Z',
};

const currentDetail = {
  ...currentAssessment,
  measurements: {
    weightKg: 65.4,
    tricepsMm: 15,
    subscapularMm: 14,
    suprailiacMm: 18,
    abdominalMm: 21,
    thighMm: 24,
  },
  results: {
    skinfoldTotalMm: 57,
    bodyFatPercentage: 22.35,
    fatMassKg: 14.62,
    leanMassKg: 50.78,
  },
};

const olderDetail = {
  ...olderAssessment,
  measurements: {
    weightKg: 66.8,
    tricepsMm: 17,
    subscapularMm: 15,
    suprailiacMm: 20,
    abdominalMm: 23,
    thighMm: 26,
  },
  results: {
    skinfoldTotalMm: 63,
    bodyFatPercentage: 24.1,
    fatMassKg: 16.1,
    leanMassKg: 50.7,
  },
};

const legacyUpload = {
  id: 'legacy-upload-adipometry',
  alunoId: 'visual-aluno',
  typeId: 'legacy-adpt-pdf',
  assessmentDate: '2026-07-15',
  filePath: '/uploads/adipometria-legada.pdf',
  originalFileName: 'adipometria-legada.pdf',
  mimeType: 'application/pdf',
  fileSize: 2048,
  createdAt: '2026-07-15T12:00:00.000Z',
  updatedAt: '2026-07-15T12:00:00.000Z',
  type: {
    id: 'legacy-adpt-pdf',
    name: 'Adipometria por PDF',
    code: 'ADPT-UPLOAD',
  },
  professional: {
    user: { profile: { name: 'Professor João' } },
  },
};

const comparison = {
  previous: {
    assessment: olderAssessment,
    measurements: olderDetail.measurements,
    results: olderDetail.results,
  },
  current: {
    assessment: currentAssessment,
    measurements: currentDetail.measurements,
    results: currentDetail.results,
  },
  deltas: {
    weightKg: -1.4,
    tricepsMm: -2,
    subscapularMm: -1,
    suprailiacMm: -2,
    abdominalMm: -2,
    thighMm: -2,
    skinfoldTotalMm: -6,
    bodyFatPercentage: -1.75,
    fatMassKg: -1.48,
    leanMassKg: 0.08,
  },
};

function envelope(data) {
  return JSON.stringify({ success: true, data });
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

async function waitForText(page, text) {
  await page.waitForFunction(
    (expected) => document.body.textContent?.includes(expected),
    { timeout: 30_000 },
    text
  );
}

async function clickControlByText(page, text) {
  const clicked = await page.evaluate((label) => {
    const control = Array.from(document.querySelectorAll('button, label')).find(
      (item) => item.textContent?.includes(label)
    );
    if (!(control instanceof HTMLElement)) return false;
    control.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Control not found: ${text}`);
}

await mkdir(outputDir, { recursive: true });
let workflowAttestation = null;
try {
  workflowAttestation = JSON.parse(
    await readFile(path.join(outputDir, 'orquestrador-artifact.json'), 'utf8')
  );
} catch {
  workflowAttestation = null;
}
await waitForPreview();

let scenario = 'summary';
const browserErrors = [];
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();

page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
});

await page.evaluateOnNewDocument((authenticatedUser) => {
  localStorage.setItem('token', 'visual-central-token');
  localStorage.setItem('user', JSON.stringify(authenticatedUser));
}, user);

await page.setRequestInterception(true);
page.on('request', async (request) => {
  if (!request.url().includes('/api/v1/')) {
    await request.continue();
    return;
  }

  const { pathname } = new URL(request.url());
  let fixture;

  if (pathname.endsWith('/api/v1/auth/me')) fixture = user;
  else if (pathname === '/api/v1/alunos/visual-aluno') fixture = student;
  else if (pathname === '/api/v1/alunos/visual-aluno/assessments') {
    fixture = scenario === 'empty' ? [] : [legacyUpload];
  } else if (pathname === '/api/v1/alunos/visual-aluno/assessments/summary') fixture = [];
  else if (pathname === '/api/v1/assessment-types') fixture = [];
  else if (pathname === '/api/v1/adipometry/responsible-professors') {
    fixture = [{ id: 'visual-professor', name: 'Professora Marina' }];
  } else if (pathname === '/api/v1/adipometry/alunos/visual-aluno/assessments') {
    fixture = scenario === 'empty'
      ? []
      : [draftAssessment, currentAssessment, olderAssessment];
  } else if (pathname === '/api/v1/adipometry/assessments/central-adpt-current') {
    fixture = currentDetail;
  } else if (pathname === '/api/v1/adipometry/alunos/visual-aluno/compare') {
    fixture = comparison;
  } else {
    fixture = [];
  }

  await request.respond({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: envelope(fixture),
  });
});

const evidence = {
  schemaVersion: 1,
  issue: 249,
  route,
  authenticatedUserId: user.id,
  permissions: user.accessControl.permissions,
  headSha: workflowAttestation?.headSha ?? process.env.AUDIT_HEAD_SHA ?? process.env.GITHUB_SHA ?? null,
  baseSha: workflowAttestation?.baseSha ?? process.env.AUDIT_BASE_SHA ?? null,
  mergePreviewSha:
    workflowAttestation?.mergePreviewSha
    ?? process.env.AUDIT_MERGE_PREVIEW_SHA
    ?? process.env.GITHUB_SHA
    ?? null,
  viewports: [],
  scenarios: [],
  noHorizontalOverflowAt390: null,
  consoleErrors: browserErrors,
  generatedAt: null,
};

async function openCentral(nextScenario, viewport) {
  scenario = nextScenario;
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle0' });
  await waitForText(page, 'Adipometria e evolução ADPT');
}

try {
  await openCentral('empty', { width: 1440, height: 900 });
  await waitForText(page, 'Nenhuma adipometria concluída');
  await page.screenshot({
    path: path.join(outputDir, 'adipometry-issue-249-empty-1440x900.png'),
    fullPage: true,
  });
  evidence.viewports.push({
    width: 1440,
    height: 900,
    screenshot: 'adipometry-issue-249-empty-1440x900.png',
    scenario: 'Central do Aluno sem ADPT',
  });
  evidence.scenarios.push('estado vazio informativo sem bloquear a aba Avaliação Física');

  await openCentral('summary', { width: 1440, height: 900 });
  await waitForText(page, 'Última adipometria concluída');
  await waitForText(page, 'Pendências operacionais (1)');
  await waitForText(page, 'Origem: Upload genérico');
  await page.screenshot({
    path: path.join(outputDir, 'adipometry-issue-249-summary-history-draft-1440x900.png'),
    fullPage: true,
  });
  evidence.viewports.push({
    width: 1440,
    height: 900,
    screenshot: 'adipometry-issue-249-summary-history-draft-1440x900.png',
    scenario: 'resumo vigente, rascunho e histórico misto',
  });
  evidence.scenarios.push('última ADPT vigente com valores persistidos e protocolo');
  evidence.scenarios.push('rascunho separado com ação de retomada');
  evidence.scenarios.push('upload com nome de adipometria identificado como origem genérica');

  await clickControlByText(page, 'ADPT-002');
  await clickControlByText(page, 'ADPT-001');
  await clickControlByText(page, 'Comparar avaliações selecionadas');
  await waitForText(page, 'Os protocolos ou versões são diferentes');
  await page.evaluate(() => {
    document.querySelector('table')?.scrollIntoView({ block: 'center' });
  });
  await page.screenshot({
    path: path.join(outputDir, 'adipometry-issue-249-comparison-1366x768.png'),
  });
  evidence.viewports.push({
    width: 1366,
    height: 768,
    screenshot: 'adipometry-issue-249-comparison-1366x768.png',
    scenario: 'comparação evolutiva com protocolos diferentes',
  });
  evidence.scenarios.push('comparação acessível com valores absolutos, variações e aviso de comparabilidade');

  await openCentral('summary', { width: 390, height: 844 });
  evidence.noHorizontalOverflowAt390 = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  await page.screenshot({
    path: path.join(outputDir, 'adipometry-issue-249-summary-390x844.png'),
    fullPage: true,
  });
  evidence.viewports.push({
    width: 390,
    height: 844,
    screenshot: 'adipometry-issue-249-summary-390x844.png',
    scenario: 'Central ADPT móvel sem overflow da página',
  });
  evidence.scenarios.push('layout móvel com seções colapsáveis e rolagem restrita à tabela');

  if (!evidence.noHorizontalOverflowAt390) {
    throw new Error('Central ADPT has horizontal overflow at 390x844');
  }
  if (browserErrors.length) {
    throw new Error(`Central ADPT browser errors: ${browserErrors.join(' | ')}`);
  }

  evidence.generatedAt = new Date().toISOString();
  await writeFile(
    path.join(outputDir, 'adipometry-issue-249-manifest.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
