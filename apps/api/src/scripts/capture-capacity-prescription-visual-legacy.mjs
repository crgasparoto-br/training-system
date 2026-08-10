import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';

const baseUrl = process.env.CAPACITY_VISUAL_BASE_URL || 'http://127.0.0.1:4173';
const workspace = process.env.GITHUB_WORKSPACE || path.resolve(process.cwd(), '../..');
const outputDir = process.env.CAPACITY_VISUAL_OUTPUT
  ? path.resolve(process.cwd(), process.env.CAPACITY_VISUAL_OUTPUT)
  : path.join(workspace, 'artifacts/issue-136-visual');

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
      { screenKey: 'physicalAssessment.protocol', canView: true },
      { screenKey: 'plans', canView: true },
      {
        screenKey: 'plans',
        blockKey: 'plans.capacityPrescriptions.view',
        canView: true,
      },
      {
        screenKey: 'plans',
        blockKey: 'plans.capacityPrescriptions.manage',
        canView: true,
      },
      { screenKey: 'students.details', canView: true },
      {
        screenKey: 'students.details',
        blockKey: 'students.details.profile',
        canView: true,
      },
      {
        screenKey: 'students.details',
        blockKey: 'students.details.assessments',
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
  updatedAt: '2026-07-27T10:00:00.000Z',
  user: {
    email: 'aluna.visual@example.com',
    profile: {
      name: 'Ana Carolina de Oliveira Albuquerque',
      phone: '+55 15 99999-0000',
    },
  },
};

const prontuario = {
  currentRecord: {
    id: 'visual-record',
    contractId: 'visual-contract',
    alunoId: 'visual-aluno',
    professorId: 'visual-professor',
    code: 'PRNT-VISUAL-001',
    status: 'open',
    summary: 'Acompanhamento técnico para retorno progressivo à corrida.',
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-27T10:00:00.000Z',
    goals: [
      {
        id: 'goal-running',
        recordId: 'visual-record',
        title: 'Retomar corrida de 10 km sem dor e com progressão controlada',
        description:
          'Aumentar tolerância ao volume mantendo estabilidade de joelho e controle de esforço.',
        priority: 1,
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
      },
      {
        id: 'goal-strength',
        recordId: 'visual-record',
        title: 'Elevar força de membros inferiores e estabilidade do tronco',
        description: 'Priorizar quadríceps, posteriores, glúteos e core.',
        priority: 2,
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
      },
    ],
    painCases: [
      {
        id: 'pain-knee',
        recordId: 'visual-record',
        status: 'monitoring',
        title: 'Desconforto anterior no joelho direito',
        region: 'Joelho direito',
        description: 'Aparece após aumento abrupto de volume.',
        onsetDate: '2026-07-12T10:00:00.000Z',
        followUps: [],
        createdAt: '2026-07-12T10:00:00.000Z',
        updatedAt: '2026-07-25T10:00:00.000Z',
      },
    ],
    anamnesisFollowUps: [],
    medicationsProcedures: [],
    discomfortSnapshots: [],
    activityHistory: [
      {
        id: 'activity-history-1',
        recordId: 'visual-record',
        activityType: 'running',
        description: 'Corrida recreativa e provas de rua',
        frequency: '3 vezes por semana',
        duration: '45 a 70 minutos',
        intensity: 'Moderada',
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
      },
    ],
  },
  records: [],
  parq: {
    state: 'NOT_STARTED',
    latestSubmission: null,
    requiresProfessionalReview: false,
    legacy: null,
  },
};

const parameterSets = [
  {
    id: 'parameter-resisted',
    contractId: 'visual-contract',
    capacity: 'resisted',
    code: 'BASE_RESISTED',
    name: 'Base resistida - adaptação anatômica',
    version: 2,
    methodologyVersion: 'acesso-resisted-v2',
    parameters: {
      type: 'resisted',
      resisted: {
        method: 'CIRCUITO',
        split: 'FULL_BODY',
        sets: 3,
        repetitions: '8-12',
        repetitionReserve: '2-3',
        expectedPse: 6,
        muscleGroups: ['QUADRICEPS', 'POSTERIORES', 'GLUTEOS', 'CORE'],
      },
    },
    isCurrent: true,
    createdByProfessorId: 'visual-professor',
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-27T10:00:00.000Z',
  },
];

function catalogItem(id, category, code, name) {
  return {
    id,
    contractId: 'visual-contract',
    category,
    code,
    name,
    metadata: {},
    version: 1,
    isCurrent: true,
    createdByProfessorId: 'visual-professor',
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  };
}

const catalog = [
  catalogItem('muscle-1', 'muscle_group', 'QUADRICEPS', 'Quadríceps'),
  catalogItem('muscle-2', 'muscle_group', 'POSTERIORES', 'Posteriores de coxa'),
  catalogItem('muscle-3', 'muscle_group', 'GLUTEOS', 'Glúteos'),
  catalogItem('muscle-4', 'muscle_group', 'CORE', 'Core'),
  catalogItem('method-1', 'method', 'CIRCUITO', 'Circuito'),
  catalogItem('split-1', 'training_split', 'FULL_BODY', 'Corpo inteiro'),
  catalogItem('cyclic-1', 'cyclic_stimulus', 'CONTINUO', 'Contínuo'),
  catalogItem('articulation-1', 'articulation', 'OMBRO', 'Ombro'),
  catalogItem('articulation-2', 'articulation', 'QUADRIL', 'Quadril'),
  catalogItem('articulation-3', 'articulation', 'JOELHO', 'Joelho'),
  catalogItem('load-1', 'microcycle_load', 'ADP', 'Carga de adaptação'),
];

const profile = {
  alunoId: 'visual-aluno',
  recordId: 'visual-student-profile',
  source: { type: 'student', reference: 'visual-external-reference' },
  identification: {},
  preferences: {
    preferredActivities: ['Corrida ao ar livre'],
    restrictions: ['Evitar progressões abruptas'],
  },
  objectives: null,
  updatedAt: '2026-07-26T10:00:00.000Z',
};

const assessments = {
  alunoId: 'visual-aluno',
  total: 1,
  hasSegmentedRecords: true,
  hasLegacyRecords: false,
  items: [
    {
      id: 'visual-assessment',
      category: 'flexibility',
      title: 'Avaliação de flexibilidade e mobilidade',
      performedAt: '2026-07-24T10:00:00.000Z',
      status: 'completed',
      source: { type: 'professional', reference: 'visual-assessment' },
      measurements: [],
      updatedAt: '2026-07-24T11:00:00.000Z',
    },
  ],
};

const assessmentSources = [
  {
    ref: {
      type: 'flexibility_assessment',
      id: 'visual-assessment',
      label: 'Avaliação de flexibilidade e mobilidade',
      assessedAt: '2026-07-24T10:00:00.000Z',
      origin: 'FLEX-VISUAL-001',
      version: '2026-07-24T11:00:00.000Z',
      responsibleProfessorId: 'visual-professor',
    },
    category: 'flexibility',
    status: 'completed',
    details: [
      { label: 'Flexão de ombro', value: 160, unit: '°' },
      { label: 'Déficit de quadril', value: 'leve', unit: null },
    ],
  },
];

function envelope(data) {
  return JSON.stringify({ success: true, data });
}

function fixtureFor(url, method) {
  const { pathname } = new URL(url);
  if (pathname.endsWith('/api/v1/auth/me')) return user;
  if (pathname === '/api/v1/alunos') {
    return {
      alunos: [student],
      pagination: { page: 1, limit: 100, total: 1, pages: 1 },
    };
  }
  if (pathname === '/api/v1/prontuario/alunos/visual-aluno') return prontuario;
  if (pathname === '/api/v1/prontuario/alunos/visual-aluno/parq-submissions') return [];
  if (pathname === '/api/v1/capacity-prescriptions/alunos/visual-aluno') return [];
  if (pathname === '/api/v1/capacity-prescriptions/parameters') return parameterSets;
  if (pathname === '/api/v1/capacity-prescriptions/catalog') return catalog;
  if (pathname === '/api/v1/capacity-prescriptions/alunos/visual-aluno/planning') return [];
  if (pathname === '/api/v1/capacity-prescriptions/alunos/visual-aluno/goal-classifications') {
    return [];
  }
  if (pathname === '/api/v1/capacity-prescriptions/alunos/visual-aluno/assessment-sources') {
    return assessmentSources;
  }
  if (pathname === '/api/v1/alunos/visual-aluno/profile') return profile;
  if (pathname === '/api/v1/alunos/visual-aluno/assessment-records') return assessments;
  if (method !== 'GET') return { id: 'visual-write-result' };
  return null;
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

async function selectStudentAndWait(page) {
  await page.waitForSelector('#capacity-student');
  await page.select('#capacity-student', 'visual-aluno');
  await page.waitForFunction(
    () => document.body.textContent?.includes('Fontes para Resistido'),
    { timeout: 30_000 }
  );
  await page.waitForFunction(
    () => document.body.textContent?.includes('Ana Carolina de Oliveira Albuquerque'),
    { timeout: 30_000 }
  );
}

await mkdir(outputDir, { recursive: true });
await waitForPreview();

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
const browserErrors = [];

page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
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

  const fixture = fixtureFor(request.url(), request.method());
  await request.respond({
    status: fixture === null ? 404 : 200,
    contentType: 'application/json; charset=utf-8',
    body:
      fixture === null
        ? JSON.stringify({ error: 'Fixture visual não configurada' })
        : envelope(fixture),
  });
});

try {
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/protocolo-avaliacao-fisica/prescricao-capacidades`, {
    waitUntil: 'networkidle0',
  });
  await selectStudentAndWait(page);

  await page.focus('#capacity-tab-resisted');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () => document.activeElement?.id === 'capacity-tab-flexibility',
    { timeout: 5_000 }
  );
  const keyboardSelectedTab = await page.evaluate(() => document.activeElement?.id);

  await page.click('#capacity-tab-resisted');
  await page.select('#capacity-parameter-set', 'parameter-resisted');
  await page.waitForFunction(() => {
    const label = Array.from(document.querySelectorAll('label')).find(
      (item) => item.textContent?.trim() === 'Séries'
    );
    const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
    return input instanceof HTMLInputElement && input.matches(':disabled');
  });

  await page.screenshot({
    path: path.join(outputDir, 'capacity-prescription-1366x768.png'),
    fullPage: true,
  });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: 'networkidle0' });
  await selectStudentAndWait(page);
  await page.screenshot({
    path: path.join(outputDir, 'capacity-prescription-390x844.png'),
    fullPage: true,
  });

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  if (horizontalOverflow) throw new Error('Horizontal overflow detected at 390px viewport');
  if (browserErrors.length) {
    throw new Error(`Browser emitted errors:\n${browserErrors.join('\n')}`);
  }

  const evidence = {
    schemaVersion: 1,
    route: '/protocolo-avaliacao-fisica/prescricao-capacidades',
    viewports: [
      { width: 1366, height: 768, screenshot: 'capacity-prescription-1366x768.png' },
      { width: 390, height: 844, screenshot: 'capacity-prescription-390x844.png' },
    ],
    scenarios: [
      'professor with exact view/manage blocks',
      'student selected with long name',
      'PRNT goals and technical sources',
      'canonical assessment source with responsible professor and measurements',
      'versioned parameter set selected and fields disabled',
      'keyboard tab navigation',
      'mobile horizontal overflow check',
    ],
    keyboardSelectedTab,
    horizontalOverflow,
    consoleErrors: browserErrors,
    generatedAt: new Date().toISOString(),
  };

  await writeFile(
    path.join(outputDir, 'visual-evidence.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
