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

async function main() {
  const orca = spawn('orca', [
    '--replace',
    '--enable=braille-monitor',
    '--disable=speech',
    '--debug',
    `--debug-file=${debugFile}`,
  ], { stdio: ['ignore', stdout, stdout], env: process.env });

  let browser;
  try {
    await delay(2500);
    browser = await chromium.launch({
      headless: false,
      args: ['--force-renderer-accessibility', '--disable-gpu', '--no-sandbox'],
    });
    const context = await browser.newContext({
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
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Montagem Consolidada da Prescrição' }).waitFor({ timeout: 15000 });

    const history = page.getByRole('button', { name: '8. Histórico de versões' });
    await history.focus();
    await page.keyboard.press('Enter');
    const summary = page.locator('summary').first();
    await summary.focus();
    await page.keyboard.press('Enter');
    await delay(2500);

    const listed = spawnSync('orca', ['--list-apps'], { encoding: 'utf8', env: process.env });
    const listedApps = `${listed.stdout || ''}\n${listed.stderr || ''}`;
    fs.writeFileSync(path.join(outputDir, 'native-orca-apps.txt'), listedApps);
    assert.match(listedApps, /(chromium|chrome)/i, 'Orca did not enumerate Chromium as an AT-SPI application');

    await context.close();
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    orca.kill('SIGTERM');
    await delay(1000);
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
