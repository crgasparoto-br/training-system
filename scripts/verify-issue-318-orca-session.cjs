const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
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

const chromeProbe = spawnSync('bash', ['-lc', 'command -v google-chrome-stable || command -v google-chrome'], {
  encoding: 'utf8',
  env: process.env,
});
const chromeExecutable = (chromeProbe.stdout || '').trim().split('\n')[0];
if (chromeProbe.status !== 0 || !chromeExecutable) {
  throw new Error(`System Google Chrome is required for native Orca evidence: ${chromeProbe.stderr || chromeProbe.stdout}`);
}
const chromeVersion = spawnSync(chromeExecutable, ['--version'], { encoding: 'utf8', env: process.env });
if (chromeVersion.status !== 0) throw new Error(`Google Chrome version probe failed: ${chromeVersion.stderr || chromeVersion.stdout}`);
fs.writeFileSync(path.join(outputDir, 'native-chrome-version.txt'), `${chromeVersion.stdout || ''}${chromeVersion.stderr || ''}`);

const pyatspiProbe = spawnSync('python3', ['-c', 'import pyatspi; print("pyatspi available")'], {
  encoding: 'utf8',
  env: process.env,
});
if (pyatspiProbe.status !== 0) {
  throw new Error(`python3-pyatspi is required for native AT-SPI evidence: ${pyatspiProbe.stderr || pyatspiProbe.stdout}`);
}
fs.writeFileSync(path.join(outputDir, 'native-pyatspi-version.txt'), `${pyatspiProbe.stdout || ''}${pyatspiProbe.stderr || ''}`);

const origin = new URL(url).origin;
const debugFile = path.join(outputDir, 'native-orca-debug.log');
const orcaStdoutFile = path.join(outputDir, 'native-orca-stdout.log');
const chromeStdoutFile = path.join(outputDir, 'native-chrome-stdout.log');
const atspiTranscriptFile = path.join(outputDir, 'native-atspi-transcript.txt');
const orcaStdout = fs.openSync(orcaStdoutFile, 'w');
const chromeStdout = fs.openSync(chromeStdoutFile, 'w');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-318-native-profile-'));

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const TRANSIENT_PROFILE_CLEANUP_ERRORS = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);

async function removeTemporaryProfile(directory) {
  const maxAttempts = 20;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!TRANSIENT_PROFILE_CLEANUP_ERRORS.has(error.code)) throw error;
      if (attempt === maxAttempts) {
        console.warn(
          `Temporary Chrome profile cleanup remained busy after ${maxAttempts} attempts (${error.code}); ` +
          'continuing because evidence collection is complete and the profile is runner-local.'
        );
        return;
      }
      await delay(250);
    }
  }
}

function listAtspiApplications() {
  const script = String.raw`
import pyatspi

desktop = pyatspi.Registry.getDesktop(0)
for index in range(desktop.childCount):
    try:
        app = desktop.getChildAtIndex(index)
        name = app.name or ''
        pid = app.get_process_id() if hasattr(app, 'get_process_id') else 0
        print(f'{pid}\t{name}')
    except Exception as exc:
        print(f'error\t{exc}')
`;
  return spawnSync('python3', ['-c', script], {
    encoding: 'utf8',
    env: process.env,
    timeout: 10000,
  });
}

async function waitForAtspiApp(pattern, label, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let lastOutput = '';
  let lastStatus = null;
  while (Date.now() < deadline) {
    const listed = listAtspiApplications();
    lastStatus = listed.status;
    lastOutput = `${listed.stdout || ''}\n${listed.stderr || ''}`;
    if (listed.status === 0 && pattern.test(lastOutput)) return lastOutput;
    await delay(500);
  }
  throw new Error(`${label} was not registered in AT-SPI (pyatspi status ${lastStatus}): ${lastOutput}`);
}

async function waitForFilePattern(file, pattern, label, child, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastContent = '';
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`${label} exited before becoming ready (exit ${child.exitCode})`);
    }
    try {
      lastContent = fs.readFileSync(file, 'utf8');
      if (pattern.test(lastContent)) return lastContent;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await delay(250);
  }
  throw new Error(`${label} did not become ready: ${lastContent.slice(-2000)}`);
}

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

async function prepareAuthenticatedProfile() {
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromeExecutable,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    viewport: { width: 1366, height: 768 },
  });
  try {
    await context.addInitScript(({ expectedOrigin, authToken, authUser }) => {
      if (window.location.origin === expectedOrigin) {
        window.localStorage.setItem('token', authToken);
        window.localStorage.setItem('user', JSON.stringify(authUser));
      }
    }, { expectedOrigin: origin, authToken: token, authUser: user });
    const page = context.pages()[0] || await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.getByText('Montagem Consolidada da Prescrição', { exact: true }).first().waitFor({ timeout: 20000 });
    assert.equal(await page.evaluate(() => window.localStorage.getItem('token')), token);
  } finally {
    await context.close();
  }
}

function runNativeAtspiInteraction() {
  const script = String.raw`
import re
import sys
import time
import pyatspi

TITLE = 'Montagem Consolidada da Prescrição'
HISTORY = '8. Histórico de versões'
out_path = sys.argv[1]

def walk(root):
    stack = [root]
    while stack:
        node = stack.pop()
        yield node
        try:
            count = node.childCount
        except Exception:
            count = 0
        for index in range(count - 1, -1, -1):
            try:
                stack.append(node.getChildAtIndex(index))
            except Exception:
                pass

def node_name(node):
    try:
        return node.name or ''
    except Exception:
        return ''

def find(predicate, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        desktop = pyatspi.Registry.getDesktop(0)
        for node in walk(desktop):
            try:
                if predicate(node):
                    return node
            except Exception:
                pass
        time.sleep(0.25)
    return None

def invoke(node):
    action = node.queryAction()
    names = [action.getName(i) for i in range(action.nActions)]
    preferred = ['click', 'press', 'activate', 'toggle']
    index = next((i for i, name in enumerate(names) if (name or '').lower() in preferred), 0)
    if action.nActions < 1 or not action.doAction(index):
        raise RuntimeError(f'Could not invoke AT-SPI action on {node_name(node)!r}; actions={names!r}')
    return names

lines = []
title = find(lambda node: TITLE in node_name(node), timeout=25)
if title is None:
    raise RuntimeError('AT-SPI did not expose the Issue 318 page title')
lines.append(f'title={node_name(title)} role={title.getRoleName()}')

history = find(lambda node: node_name(node).strip() == HISTORY, timeout=15)
if history is None:
    raise RuntimeError('AT-SPI did not expose the history accordion button')
lines.append(f'history={node_name(history)} role={history.getRoleName()} actions={invoke(history)!r}')

time.sleep(1)
version = find(lambda node: re.search(r'Versão\s+\d+', node_name(node), re.I) is not None, timeout=10)
if version is None:
    raise RuntimeError('AT-SPI did not expose a history version after expanding the accordion')
lines.append(f'version={node_name(version)} role={version.getRoleName()}')

with open(out_path, 'w', encoding='utf-8') as handle:
    handle.write('\n'.join(lines) + '\n')
`;

  return spawnSync('python3', ['-c', script, atspiTranscriptFile], {
    encoding: 'utf8',
    env: process.env,
    timeout: 40000,
  });
}

async function main() {
  let nativeChrome;
  let orca;
  try {
    // Seed authentication in a normal browser first. The native-accessibility Chrome
    // then opens the target URL directly from its command line, so no Playwright/CDP
    // navigation command can deadlock while the Linux AT-SPI bridge initializes.
    await prepareAuthenticatedProfile();
    await delay(1000);

    // Initialize AT-SPI without launching a second Orca process. Using
    // `orca --list-apps` while the primary Orca is starting races with --replace.
    const registryProbe = listAtspiApplications();
    if (registryProbe.status !== 0) {
      throw new Error(`AT-SPI registry probe failed: ${registryProbe.stderr || registryProbe.stdout}`);
    }

    orca = spawn('orca', [
      '--replace',
      '--disable=speech',
      '--debug',
      `--debug-file=${debugFile}`,
    ], { stdio: ['ignore', orcaStdout, orcaStdout], env: process.env });
    await waitForFilePattern(debugFile, /EVENT MANAGER: Activated/, 'Orca', orca, 20000);

    nativeChrome = spawn(chromeExecutable, [
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--force-renderer-accessibility',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      url,
    ], {
      stdio: ['ignore', chromeStdout, chromeStdout],
      env: { ...process.env, NO_AT_BRIDGE: '0' },
    });

    const listedApps = await waitForAtspiApp(/(chromium|chrome)/i, 'Chrome', 25000);
    fs.writeFileSync(path.join(outputDir, 'native-orca-apps.txt'), listedApps);

    const atspi = runNativeAtspiInteraction();
    if (atspi.error) throw atspi.error;
    if (atspi.status !== 0) {
      throw new Error(`Native AT-SPI interaction failed: ${atspi.stderr || atspi.stdout}`);
    }
    await delay(2000);
  } finally {
    // Stop Chrome first so renderer/profile writers cannot race the temporary
    // profile removal. Orca can then shut down after its client disappears.
    await stopChild(nativeChrome);
    await stopChild(orca);
    fs.closeSync(orcaStdout);
    fs.closeSync(chromeStdout);
    await removeTemporaryProfile(profileDir);
  }

  const debug = fs.readFileSync(debugFile, 'utf8');
  assert.match(debug, /(Montagem Consolidada|Histórico de versões|Versão [0-9])/i,
    'Orca debug log did not observe the Issue 318 accessible content');
  const transcript = fs.readFileSync(atspiTranscriptFile, 'utf8');
  assert.match(transcript, /Montagem Consolidada da Prescrição/);
  assert.match(transcript, /8\. Histórico de versões/);
  assert.match(transcript, /Versão\s+\d+/i);

  fs.writeFileSync(path.join(outputDir, 'native-orca-summary.json'), JSON.stringify({
    screenReader: 'Orca',
    transport: 'AT-SPI',
    browser: 'system Google Chrome launched natively with a pre-authenticated profile',
    interaction: 'native AT-SPI discovery + action invocation on the history accordion',
    evidence: [
      'native-orca-version.txt',
      'native-chrome-version.txt',
      'native-pyatspi-version.txt',
      'native-orca-debug.log',
      'native-orca-apps.txt',
      'native-orca-stdout.log',
      'native-chrome-stdout.log',
      'native-atspi-transcript.txt',
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});