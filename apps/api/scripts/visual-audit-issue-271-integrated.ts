import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import puppeteer, { type Page } from 'puppeteer';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outputDir = path.join(repoRoot, 'artifacts', 'issue-271-integrated');
const webUrl = 'http://127.0.0.1:4173';
const apiUrl = 'http://127.0.0.1:3000';
const prisma = new PrismaClient();

async function waitForUrl(url: string, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
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

async function waitForText(page: Page, text: string, timeout = 20_000) {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    { timeout },
    text
  );
}

async function waitForHeading(page: Page, text: string, timeout = 20_000) {
  await page.waitForFunction(
    (expected) => Array.from(document.querySelectorAll('h1, h2')).some(
      (heading) => heading.textContent?.trim() === expected
    ),
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
  if (!clicked) throw new Error(`Controle não encontrado: ${selector} contendo "${text}"`);
}

async function fillByLabel(page: Page, labelText: string, value: string) {
  const selector = await page.evaluate((expected) => {
    const label = Array.from(document.querySelectorAll('label')).find(
      (candidate) => candidate.textContent?.includes(expected)
    );
    if (!label) return null;
    const htmlFor = label.getAttribute('for');
    const field = htmlFor
      ? document.getElementById(htmlFor)
      : label.querySelector('input, textarea');
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return null;
    if (!field.id) field.id = `e2e-${Math.random().toString(36).slice(2)}`;
    return `#${CSS.escape(field.id)}`;
  }, labelText);
  if (!selector) throw new Error(`Campo não encontrado para o rótulo "${labelText}"`);
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
  if (!checked) throw new Error(`Opção não encontrada: "${text}"`);
}

async function assertNoHorizontalOverflow(page: Page, scenario: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (dimensions.scrollWidth > dimensions.viewport + 1) {
    throw new Error(`${scenario}: overflow horizontal ${dimensions.scrollWidth}/${dimensions.viewport}`);
  }
}

await mkdir(outputDir, { recursive: true });
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const token = `issue-271-${crypto.randomBytes(24).toString('base64url')}`;
const guardianEmail = `issue-271-${suffix}@example.com`;
const guardianPassword = 'Senha-segura-271';
let contractId = '';
let alunoId = '';
let apiProcess: ChildProcess | undefined;
let previewProcess: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

try {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `271${Date.now()}`,
      name: 'Academia Integrada Issue 271 com Nome Extenso para Responsividade',
    },
  });
  contractId = contract.id;

  const aluno = await prisma.aluno.create({
    data: {
      contractId,
      status: 'INVITED',
      leadName: 'Dependente Integrado Issue 271',
      onboarding: { create: { contractId } },
      preRegistrationInvites: {
        create: {
          contractId,
          tokenHash: hashInviteToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
    },
  });
  alunoId = aluno.id;
  await upsertStudentIdentity(
    alunoId,
    contractId,
    {
      name: 'Dependente Integrado Issue 271',
      birthDate: '2012-05-10',
      cpf: '52998224725',
    },
    {
      sourceType: 'professional',
      sourceReference: 'issue_271_integrated_visual_fixture',
    }
  );

  apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      PORT: '3000',
      API_PORT: '3000',
      NODE_ENV: 'test',
      JWT_SECRET: 'issue-271-integrated-test-secret',
      FRONTEND_URL: webUrl,
      CORS_ORIGINS: webUrl,
      PRIVACY_NOTICE_URL: `${webUrl}/privacidade`,
      PRIVACY_NOTICE_VERSION: '2026-07',
    },
    stdio: 'inherit',
  });

  previewProcess = spawn(
    'pnpm',
    ['--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4173'],
    {
      cwd: repoRoot,
      detached: true,
      env: process.env,
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

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.goto(`${webUrl}/pre-cadastro/${token}`, {
    waitUntil: 'networkidle0',
    timeout: 30_000,
  });
  await waitForText(page, 'Convite de pré-matrícula');
  await assertNoHorizontalOverflow(page, 'landing-mobile-real');

  await clickByText(page, 'button', 'Criar acesso');
  await checkByLabelText(page, 'Responsável legal');
  await fillByLabel(page, 'Nome completo', 'Responsável Integrado Issue 271');
  await fillByLabel(page, 'E-mail', guardianEmail);
  await fillByLabel(page, 'Senha', guardianPassword);
  await clickByText(page, 'button', 'Criar acesso e continuar');

  await waitForHeading(page, 'Confirme seu vínculo');
  if (new URL(page.url()).pathname !== '/pre-cadastro') {
    throw new Error(`Token permaneceu na navegação após claim: ${page.url()}`);
  }
  const localStorageKeys = await page.evaluate(() => Object.keys(localStorage).sort());
  if (localStorageKeys.join(',') !== 'token,user') {
    throw new Error(`localStorage inesperado após claim: ${localStorageKeys.join(', ')}`);
  }
  await assertNoHorizontalOverflow(page, 'guardian-confirmation-mobile-real');
  await page.screenshot({
    path: path.join(outputDir, 'guardian-confirmation-mobile-real.png'),
    fullPage: true,
  });

  await fillByLabel(page, 'Vínculo com o menor', 'Mãe');
  await checkByLabelText(page, 'Declaro que sou responsável legal');
  await clickByText(page, 'button', 'Confirmar e continuar');
  await waitForHeading(page, 'Identificação');

  await upsertStudentIdentity(
    alunoId,
    contractId,
    { phone: '15988887777' },
    {
      sourceType: 'professional',
      sourceReference: 'issue_271_integrated_conflict',
    }
  );
  await clickByText(page, 'button', 'Salvar e avançar');
  await waitForText(page, 'Os dados foram alterados em outro local');
  await page.screenshot({
    path: path.join(outputDir, 'concurrent-conflict-mobile-real.png'),
    fullPage: true,
  });

  await page.reload({ waitUntil: 'networkidle0', timeout: 30_000 });
  await waitForHeading(page, 'Identificação');
  await page.setViewport({ width: 1366, height: 768 });
  await assertNoHorizontalOverflow(page, 'identification-low-height-real');
  await page.screenshot({
    path: path.join(outputDir, 'identification-low-height-real.png'),
    fullPage: true,
  });

  await clickByText(page, 'button', 'Salvar e avançar');
  await waitForHeading(page, 'Contato');
  await fillByLabel(page, 'Telefone principal', '15999990000');
  await fillByLabel(page, 'E-mail principal', `dependente-${suffix}@example.com`);
  await clickByText(page, 'button', 'Salvar e avançar');
  await waitForHeading(page, 'Endereço');
  await clickByText(page, 'button', 'Salvar e avançar');
  await waitForHeading(page, 'Responsável');
  await fillByLabel(page, 'Nome do responsável legal', 'Responsável Integrado Issue 271');
  await fillByLabel(page, 'CPF do responsável', '39053344705');
  await fillByLabel(page, 'Telefone do responsável', '15977776666');
  await fillByLabel(page, 'E-mail do responsável', guardianEmail);
  await clickByText(page, 'button', 'Salvar e avançar');
  await waitForHeading(page, 'Privacidade');
  await checkByLabelText(page, 'Li e aceito');
  await clickByText(page, 'button', 'Concluir pré-cadastro');
  await waitForHeading(page, 'Pré-cadastro concluído');

  await page.setViewport({ width: 1440, height: 900 });
  await assertNoHorizontalOverflow(page, 'completed-desktop-real');
  await page.screenshot({
    path: path.join(outputDir, 'completed-desktop-real.png'),
    fullPage: true,
  });

  const [completedAluno, onboarding, invite, completionEvents] = await Promise.all([
    prisma.aluno.findUniqueOrThrow({ where: { id: alunoId } }),
    prisma.studentOnboardingProcess.findUniqueOrThrow({ where: { alunoId } }),
    prisma.preRegistrationInvite.findUniqueOrThrow({ where: { tokenHash: hashInviteToken(token) } }),
    prisma.studentLifecycleEvent.count({
      where: { alunoId, eventType: 'PRE_REGISTRATION_COMPLETED' },
    }),
  ]);
  if (completedAluno.status !== 'PRE_REGISTRATION_COMPLETED') {
    throw new Error(`Status final inesperado: ${completedAluno.status}`);
  }
  if (!onboarding.privacyAcceptedAt || !onboarding.completedAt) {
    throw new Error('Consentimento ou conclusão não foi persistido.');
  }
  if (invite.status !== 'COMPLETED' || completionEvents !== 1) {
    throw new Error(`Conclusão não idempotente: convite=${invite.status}, eventos=${completionEvents}`);
  }
  const unexpectedBrowserErrors = browserErrors.filter((message) => !message.includes('409'));
  if (unexpectedBrowserErrors.length > 0) {
    throw new Error(`Erros no navegador: ${unexpectedBrowserErrors.join(' | ')}`);
  }

  console.log(JSON.stringify({
    result: 'success',
    scenarios: [
      'guardian registration and same-SPA authenticated redirect',
      'pending guardian privacy barrier',
      'guardian relationship confirmation',
      'administrative concurrency conflict',
      'incremental save through all basic-data steps',
      'versioned privacy consent and completion',
    ],
  }, null, 2));
} finally {
  if (browser) await browser.close();
  stopProcess(previewProcess);
  stopProcess(apiProcess);
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (contractId) {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
  }
  const createdUser = await prisma.user.findUnique({ where: { email: guardianEmail } }).catch(() => null);
  if (createdUser) {
    await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
}
