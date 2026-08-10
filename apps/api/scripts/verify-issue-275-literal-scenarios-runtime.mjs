import { spawn } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, '../../..');
const sourcePath = path.join(scriptsDir, 'verify-issue-275-literal-scenarios.mjs');
const runtimePath = path.join(scriptsDir, '.verify-issue-275-literal-scenarios.runtime.mjs');

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`Fixture ${label} deveria ocorrer exatamente uma vez`);
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

function buildRuntime(source) {
  let runtime = replaceExactlyOnce(
    source,
    "  await fill(first.page, 'CPF', lead.person.cpf);\n  await click(first.page, 'button', 'Salvar e avançar');",
    "  await fill(first.page, 'CPF', lead.person.cpf);\n  const firstGender = await first.page.select('#pre-registration-gender', 'male');\n  assert(firstGender.includes('male'), 'Sexo/gênero não foi selecionado no primeiro dispositivo');\n  await click(first.page, 'button', 'Salvar e avançar');",
    'real-reauthentication-gender'
  );

  runtime = replaceExactlyOnce(
    runtime,
    "  await fill(publicPage.page, 'CPF', lead.person.cpf);\n  await click(publicPage.page, 'button', 'Salvar e avançar');",
    "  await fill(publicPage.page, 'CPF', lead.person.cpf);\n  const previousGender = await publicPage.page.select('#pre-registration-gender', 'male');\n  assert(previousGender.includes('male'), 'Sexo/gênero não foi selecionado no bundle anterior');\n  await click(publicPage.page, 'button', 'Salvar e avançar');",
    'previous-web-gender'
  );

  return runtime;
}

async function execute() {
  const child = spawn('node', [runtimePath], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Verificador literal encerrado por sinal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const source = await readFile(sourcePath, 'utf8');
  await writeFile(runtimePath, buildRuntime(source), 'utf8');
  const exitCode = await execute();
  if (exitCode !== 0) process.exitCode = exitCode;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await unlink(runtimePath).catch(() => undefined);
  });
