import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import puppeteer from 'puppeteer';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const previousRoot = path.resolve(process.env.ISSUE_275_PREVIOUS_WEB_ROOT || '/tmp/issue-275-previous-web');
const expectedPreviousSha = process.env.ISSUE_275_PREVIOUS_WEB_SHA || '';
const expectedHeadSha = process.env.ISSUE_275_HEAD_SHA || '';
const apiUrl = 'http://127.0.0.1:3012';
const currentWebUrl = 'http://127.0.0.1:4186';
const previousWebUrl = 'http://127.0.0.1:4187';
const jwtSecret = 'issue-275-literal-scenarios-secret';
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const contractIds = [];
const userEmails = new Set();
const children = [];
let browser;
let serial = 0;

function assert(value, message) {
  if (!value) throw new Error(message);
}

function start(command, args, cwd, env = process.env, capture = false) {
  const output = [];
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (capture) {
    child.stdout?.on('data', (chunk) => output.push(String(chunk)));
    child.stderr?.on('data', (chunk) => output.push(String(chunk)));
  }
  children.push(child);
  return { child, output };
}

function stop(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

async function waitFor(url, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Servidor não respondeu em ${url}`);
}

function gitSha(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  assert(result.status === 0, `Não foi possível resolver o SHA em ${root}: ${result.stderr}`);
  return result.stdout.trim();
}

async function filesUnder(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(root, absolute)));
    if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll(path.sep, '/'));
  }
  return files.sort();
}

async function digestDirectory(root) {
  const hash = crypto.createHash('sha256');
  const files = await filesUnder(root);
  assert(files.length > 0, `Bundle anterior vazio em ${root}`);
  for (const relative of files) {
    hash.update(relative).update('\0').update(await readFile(path.join(root, relative))).update('\0');
  }
  return hash.digest('hex');
}

function cpfFor(value) {
  const base = String(100000000 + value).slice(-9);
  const digit = (source, factor) => {
    let total = 0;
    for (const character of source) total += Number(character) * factor--;
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  const first = digit(base, 10);
  return `${base}${first}${digit(`${base}${first}`, 11)}`;
}

function identity(label) {
  serial += 1;
  return {
    name: `Pessoa ${label} ${serial}`,
    phone: `1598${String(1000000 + serial).slice(-7)}`,
    email: `issue-275-${label}-${serial}-${suffix}@example.test`,
    cpf: cpfFor(5000 + serial),
  };
}

async function request(pathname, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${apiUrl}/api/v1${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: 'NON_JSON_RESPONSE', message: text };
  }
  return { status: response.status, body: payload };
}

function dataOf(result, expected, label) {
  assert(result.status === expected, `${label}: HTTP ${result.status}: ${JSON.stringify(result.body)}`);
  assert(result.body.data !== undefined, `${label}: resposta sem data`);
  return result.body.data;
}

async function seedAdmin() {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275-literal-${suffix}`,
      name: 'Academia Issue 275 Cenários Literais',
      tradeName: 'Acesso QA Literal',
    },
  });
  contractIds.push(contract.id);
  const functionOption = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: contract.id,
      name: 'Administrador QA Literal',
      code: `issue-275-literal-${suffix}`,
      isActive: true,
    },
  });
  const email = `issue-275-literal-admin-${suffix}@example.test`;
  userEmails.add(email);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'not-used',
      type: 'professor',
      profile: { create: { name: 'Administrador QA Literal' } },
    },
    include: { profile: true },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId: contract.id,
      collaboratorFunctionId: functionOption.id,
      role: 'master',
    },
  });
  const token = jwt.sign({ userId: user.id, email, type: 'professor' }, jwtSecret, { expiresIn: '1h' });
  return {
    token,
    browserUser: {
      id: user.id,
      email,
      name: user.profile?.name || email,
      type: 'professor',
      profile: { name: user.profile?.name || email, avatar: null },
      professor: {
        id: professor.id,
        role: 'master',
        collaboratorFunction: { ...functionOption, accessPermissions: [] },
        contract,
      },
      accessControl: { isMaster: true, permissions: [] },
    },
  };
}

async function createLead(adminToken, label) {
  const person = identity(label);
  const lead = dataOf(
    await request('/pre-registration-admin/leads', {
      token: adminToken,
      method: 'POST',
      body: { name: person.name, phone: person.phone, origin: `issue-275-${label}` },
    }),
    201,
    `${label}: criar lead`
  );
  return { id: String(lead.id), person };
}

async function invite(adminToken, alunoId, label) {
  const value = dataOf(
    await request(`/pre-registration-admin/leads/${encodeURIComponent(alunoId)}/invites`, {
      token: adminToken,
      method: 'POST',
      body: {},
    }),
    201,
    `${label}: gerar convite`
  );
  const token = new URL(String(value.url)).pathname.split('/').filter(Boolean).at(-1);
  assert(token, `${label}: convite sem token`);
  return token;
}

async function registerInvite(inviteToken, person) {
  const password = 'Senha-segura-275';
  userEmails.add(person.email);
  dataOf(
    await request(`/pre-cadastro/${encodeURIComponent(inviteToken)}/register`, {
      method: 'POST',
      body: { name: person.name, email: person.email, password, role: 'STUDENT' },
    }),
    201,
    'registrar e reivindicar convite'
  );
  return { email: person.email, password };
}

async function isolatedPage() {
  const context = browser.createBrowserContext
    ? await browser.createBrowserContext()
    : await browser.createIncognitoBrowserContext();
  return { context, page: await context.newPage() };
}

async function fill(page, labelText, value) {
  const selector = await page.evaluate((expected) => {
    const label = [...document.querySelectorAll('label')].find((item) => item.textContent?.includes(expected));
    if (!label) return null;
    const field = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input, textarea');
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return null;
    if (!field.id) field.id = `literal-${Math.random().toString(36).slice(2)}`;
    return `#${CSS.escape(field.id)}`;
  }, labelText);
  assert(selector, `Campo não encontrado: ${labelText}`);
  await page.focus(selector);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, value);
}

async function click(page, selector, text) {
  await page.waitForFunction(
    (query, expected) => [...document.querySelectorAll(query)].some((item) => item.textContent?.trim().includes(expected)),
    { timeout: 30000 },
    selector,
    text
  );
  const clicked = await page.$$eval(selector, (items, expected) => {
    const target = items.find((item) => item.textContent?.trim().includes(expected));
    if (!(target instanceof HTMLElement)) return false;
    target.click();
    return true;
  }, text);
  assert(clicked, `Controle não encontrado: ${text}`);
}

async function heading(page, text) {
  await page.waitForFunction(
    (expected) => [...document.querySelectorAll('h1, h2')].some((item) => item.textContent?.trim().includes(expected)),
    { timeout: 30000 },
    text
  );
}

async function bodyText(page, text) {
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), { timeout: 30000 }, text);
}

async function login(page, webUrl, credentials) {
  let requests = 0;
  page.on('request', (item) => {
    if (item.method() === 'POST' && item.url().endsWith('/api/v1/auth/login')) requests += 1;
  });
  await page.goto(`${webUrl}/login?returnTo=%2Fpre-cadastro`, { waitUntil: 'networkidle0', timeout: 30000 });
  await fill(page, 'E-mail', credentials.email);
  await fill(page, 'Senha', credentials.password);
  const [response] = await Promise.all([
    page.waitForResponse((item) => item.request().method() === 'POST' && item.url().endsWith('/api/v1/auth/login'), { timeout: 30000 }),
    click(page, 'button', 'Entrar'),
  ]);
  await page.waitForFunction(() => location.pathname === '/pre-cadastro', { timeout: 30000 });
  return { requests, status: response.status() };
}

async function realReauthentication(adminToken) {
  const lead = await createLead(adminToken, 'real-reauthentication');
  const inviteToken = await invite(adminToken, lead.id, 'real-reauthentication');
  const credentials = await registerInvite(inviteToken, lead.person);

  const first = await isolatedPage();
  await first.page.setViewport({ width: 390, height: 844 });
  const firstLogin = await login(first.page, currentWebUrl, credentials);
  assert(firstLogin.status === 200, 'Primeiro dispositivo não autenticou');
  await heading(first.page, 'Identificação');
  await fill(first.page, 'Data de nascimento', '1992-03-10');
  await fill(first.page, 'CPF', lead.person.cpf);
  await click(first.page, 'button', 'Salvar e avançar');
  await heading(first.page, 'Contato');
  await first.context.close();

  const second = await isolatedPage();
  await second.page.setViewport({ width: 390, height: 844 });
  await second.page.goto(`${currentWebUrl}/login?returnTo=%2Fpre-cadastro`, { waitUntil: 'networkidle0', timeout: 30000 });
  const clean = await second.page.evaluate(() => !localStorage.getItem('token') && !localStorage.getItem('user'));
  assert(clean, 'Segundo contexto iniciou com sessão injetada');
  await fill(second.page, 'E-mail', credentials.email);
  await fill(second.page, 'Senha', credentials.password);
  let requests = 0;
  second.page.on('request', (item) => {
    if (item.method() === 'POST' && item.url().endsWith('/api/v1/auth/login')) requests += 1;
  });
  const [response] = await Promise.all([
    second.page.waitForResponse((item) => item.request().method() === 'POST' && item.url().endsWith('/api/v1/auth/login'), { timeout: 30000 }),
    click(second.page, 'button', 'Entrar'),
  ]);
  await second.page.waitForFunction(() => location.pathname === '/pre-cadastro', { timeout: 30000 });
  await heading(second.page, 'Contato');
  const state = await second.page.evaluate(() => ({
    url: `${location.pathname}${location.search}${location.hash}`,
    token: localStorage.getItem('token'),
    user: localStorage.getItem('user'),
    storage: JSON.stringify({ ...localStorage, ...sessionStorage }),
  }));
  const evidence = {
    secondContextStartedWithoutSession: clean,
    authLoginRequestCount: requests,
    authLoginStatus: response.status(),
    resumedStep: 'CONTACT',
    expectedResumedStep: 'CONTACT',
    inviteTokenAbsentFromUrl: !state.url.includes(inviteToken),
    inviteTokenAbsentFromStorage: !state.storage.includes(inviteToken),
    authenticatedSessionPresent: Boolean(state.token && state.user),
  };
  assert(evidence.authLoginRequestCount === 1, 'Retomada não executou exatamente um login real');
  assert(evidence.authLoginStatus === 200, `Login real retornou ${evidence.authLoginStatus}`);
  assert(evidence.inviteTokenAbsentFromUrl && evidence.inviteTokenAbsentFromStorage, 'Retomada dependeu do token do convite');
  assert(evidence.authenticatedSessionPresent, 'Login real não criou sessão utilizável');
  await second.page.screenshot({ path: path.join(artifactDir, 'literal-resume-after-real-login.png'), fullPage: true });
  await second.context.close();
  return evidence;
}

async function previousWebCompatibility(adminToken, adminUser, previousSha, headSha, distDigest) {
  const lead = await createLead(adminToken, 'previous-web');
  const inviteToken = await invite(adminToken, lead.id, 'previous-web');
  userEmails.add(lead.person.email);

  const publicPage = await isolatedPage();
  await publicPage.page.setViewport({ width: 390, height: 844 });
  await publicPage.page.goto(`${previousWebUrl}/pre-cadastro/${inviteToken}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await bodyText(publicPage.page, 'Convite de pré-matrícula');
  await click(publicPage.page, 'button', 'Criar acesso');
  await fill(publicPage.page, 'Nome completo', lead.person.name);
  await fill(publicPage.page, 'E-mail', lead.person.email);
  await fill(publicPage.page, 'Senha', 'Senha-segura-275');
  await click(publicPage.page, 'button', 'Criar acesso e continuar');
  await publicPage.page.waitForFunction(() => location.pathname === '/pre-cadastro', { timeout: 30000 });
  await heading(publicPage.page, 'Identificação');
  await fill(publicPage.page, 'Data de nascimento', '1991-06-15');
  await fill(publicPage.page, 'CPF', lead.person.cpf);
  await click(publicPage.page, 'button', 'Salvar e avançar');
  await heading(publicPage.page, 'Contato');
  await publicPage.page.screenshot({ path: path.join(artifactDir, 'literal-previous-web-authenticated.png'), fullPage: true });
  await publicPage.context.close();

  const adminPage = await isolatedPage();
  await adminPage.page.evaluateOnNewDocument((token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, adminToken, adminUser);
  await adminPage.page.goto(`${previousWebUrl}/pre-matriculas`, { waitUntil: 'networkidle0', timeout: 30000 });
  await heading(adminPage.page, 'Leads e pré-matrículas');
  await bodyText(adminPage.page, lead.person.name);
  await adminPage.page.screenshot({ path: path.join(artifactDir, 'literal-previous-web-administrative.png'), fullPage: true });
  await adminPage.context.close();

  const evidence = {
    previousWebSha: previousSha,
    expectedPreviousWebSha: expectedPreviousSha,
    currentHeadSha: headSha,
    previousWebDistDigest: distDigest,
    publicInviteRendered: true,
    authenticatedResumeRendered: true,
    administrativeListRendered: true,
  };
  assert(previousSha === expectedPreviousSha, 'Checkout anterior divergente');
  assert(previousSha !== headSha, 'Web anterior não pode usar o SHA atual');
  assert(/^[a-f0-9]{64}$/i.test(distDigest), 'Digest do bundle anterior inválido');
  return evidence;
}

async function cleanup() {
  for (const child of children.reverse()) stop(child);
  await new Promise((resolve) => setTimeout(resolve, 700));
  for (const contractId of contractIds.reverse()) {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { email: { in: [...userEmails] } } }).catch(() => undefined);
}

async function main() {
  await mkdir(artifactDir, { recursive: true });
  assert(expectedPreviousSha && expectedHeadSha, 'SHAs esperado e anterior são obrigatórios');
  const previousSha = gitSha(previousRoot);
  const headSha = gitSha(repoRoot);
  assert(headSha === expectedHeadSha, `Checkout atual divergente: ${headSha}`);
  const distDigest = await digestDirectory(path.join(previousRoot, 'apps/web/dist'));

  const build = spawnSync('pnpm', ['--filter', '@corrida/web', 'build'], {
    cwd: repoRoot,
    env: { ...process.env, VITE_API_URL: apiUrl, VITE_PRE_REGISTRATION_ENABLED: 'true' },
    stdio: 'inherit',
  });
  assert(build.status === 0, `Build atual falhou com status ${build.status}`);

  const admin = await seedAdmin();
  const api = start('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], repoRoot, {
    ...process.env,
    PORT: '3012',
    API_PORT: '3012',
    NODE_ENV: 'test',
    JWT_SECRET: jwtSecret,
    FRONTEND_URL: currentWebUrl,
    CORS_ORIGINS: `${currentWebUrl},${previousWebUrl}`,
    PRE_REGISTRATION_ENABLED: 'true',
    PRE_REGISTRATION_TELEMETRY_ENABLED: 'true',
    PRIVACY_NOTICE_URL: `${currentWebUrl}/privacidade`,
    PRIVACY_NOTICE_VERSION: '2026-07',
    HEALTH_PRIVACY_NOTICE_VERSION: '2026-07',
  }, true);
  start('pnpm', ['--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4186'], repoRoot);
  start('pnpm', ['--dir', previousRoot, '--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4187'], previousRoot);
  await Promise.all([waitFor(`${apiUrl}/health`), waitFor(currentWebUrl), waitFor(previousWebUrl)]);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  const reauthentication = await realReauthentication(admin.token);
  const compatibility = await previousWebCompatibility(admin.token, admin.browserUser, previousSha, headSha, distDigest);
  const report = {
    schemaVersion: 1,
    kind: 'issue-275-literal-scenarios',
    repository: process.env.GITHUB_REPOSITORY || 'crgasparoto-br/training-system',
    headSha,
    previousWebSha: previousSha,
    previousWebDistDigest: distDigest,
    dataset: `synthetic-postgresql-browser-${suffix}`,
    scenarios: { reauthentication, previousWebCompatibility: compatibility },
    controls: {
      previousWebIsDistinctCommit: previousSha !== headSha,
      previousWebBundleDigestBound: true,
      secondContextStartsEmpty: reauthentication.secondContextStartedWithoutSession,
      realLoginObserved: reauthentication.authLoginRequestCount === 1,
      resumeWithoutInviteToken: reauthentication.inviteTokenAbsentFromUrl,
    },
  };
  await writeFile(path.join(artifactDir, 'literal-scenarios.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(artifactDir, 'literal-scenarios-api.log'), api.output.join(''));
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close().catch(() => undefined);
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
  });
