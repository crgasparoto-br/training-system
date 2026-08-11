const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const url = process.env.ISSUE318_SCREEN_READER_URL;
const token = process.env.ISSUE318_SCREEN_READER_TOKEN;
const user = JSON.parse(process.env.ISSUE318_SCREEN_READER_USER || 'null');
const outputDir = process.env.ISSUE318_SCREEN_READER_DIR || path.resolve('issue-318-browser-evidence');
if (!url || !token || !user) throw new Error('Missing native screen-reader evidence inputs');
fs.mkdirSync(outputDir, { recursive: true });
const versionResult = spawnSync('orca', ['--version'], { encoding: 'utf8', env: process.env });
if (versionResult.status !== 0) throw new Error(`Orca version probe failed: ${versionResult.stderr || versionResult.stdout}`);
fs.writeFileSync(path.join(outputDir, 'native-orca-version.txt'), `${versionResult.stdout || ''}${versionResult.stderr || ''}`);
const origin = new URL(url).origin;
const debugFile = path.join(outputDir, 'native-orca-debug.log');
const stdoutFile = path.join(outputDir, 'native-orca-stdout.log');
const stdout = fs.openSync(stdoutFile, 'w');

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(5000).then(() => false),
  ]);
  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(2000),
    ]);
  }
}

async function closeWithTimeout(closeFn) {
  await Promise.race([
    Promise.resolve().then(closeFn).catch(() => undefined),
    delay(5000),
  ]);
}

async function main() {
  let browser;
  let context;
  let orca;
  try {
    browser = await chromium.launch({
      headless: false,
      args: ['--force-renderer-accessibility', '--disable-gpu', '--no-sandbox'],
    });
    context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      storageState: {
        cookies: [],
        origins: [{
          origin,
          localStorage: [
            { name: 'token', value: token },
            { name: 'user', value: JSON.stringify(user) },
          ],
        }],
      },
    });
    const page = await context.newPage();

    // With renderer accessibility forced, Chromium can leave Playwright waiting for
    // DOMContentLoaded while AT-SPI initializes in the GitHub runner. The response
    // commit is enough to prove navigation succeeded; the rendered application text
    // below is the real readiness criterion before Orca starts consuming the tree.
    await page.goto(url, { waitUntil: 'commit', timeout: 15000 });
    await page.getByText('Montagem Consolidada da Prescrição', { exact: true }).first().waitFor({ timeout: 20000 });

    orca = spawn('orca', [
      '--replace',
      '--disable=speech',
      '--debug',
      `--debug-file=${debugFile}`,
    ], { stdio: ['ignore', stdout, stdout], env: process.env });
    await delay(3000);

    const listed = spawnSync('orca', ['--list-apps'], { encoding: 'utf8', env: process.env });
    const listedApps = `${listed.stdout || ''}\n${listed.stderr || ''}`;
    fs.writeFileSync(path.join(outputDir, 'native-orca-apps.txt'), listedApps);
    assert.equal(listed.status, 0, `Orca application enumeration failed: ${listedApps}`);
    assert.match(listedApps, /(chromium|chrome)/i, 'Orca did not enumerate Chromium as an AT-SPI application');

    const history = page.locator('button', { hasText: '8. Histórico de versões' }).first();
    await history.waitFor({ state: 'visible', timeout: 10000 });
    await history.focus();
    if ((await history.getAttribute('aria-expanded')) === 'false') await page.keyboard.press('Enter');
    assert.equal(await history.getAttribute('aria-expanded'), 'true');

    const summary = page.locator('summary').first();
    await summary.waitFor({ state: 'visible', timeout: 10000 });
    await summary.focus();
    await page.keyboard.press('Enter');
    await delay(2500);

    // Stop Orca first so Chromium teardown cannot deadlock on AT-SPI callbacks.
    await stopChild(orca);
    orca = undefined;
    await closeWithTimeout(() => context.close());
    context = undefined;
    await closeWithTimeout(() => browser.close());
    browser = undefined;
  } finally {
    await stopChild(orca);
    if (context) await closeWithTimeout(() => context.close());
    if (browser) await closeWithTimeout(() => browser.close());
    fs.closeSync(stdout);
  }

  const debug = fs.readFileSync(debugFile, 'utf8');
  assert.match(debug, /(Montagem Consolidada|Histórico de versões|Versão [0-9])/i,
    'Orca debug log did not observe the Issue 318 accessible content');
  fs.writeFileSync(path.join(outputDir, 'native-orca-summary.json'), JSON.stringify({
    screenReader: 'Orca',
    transport: 'AT-SPI',
    browser: 'headed Chromium',
    interaction: 'keyboard focus + Enter on accordion/history',
    evidence: ['native-orca-version.txt', 'native-orca-debug.log', 'native-orca-apps.txt', 'native-orca-stdout.log'],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
