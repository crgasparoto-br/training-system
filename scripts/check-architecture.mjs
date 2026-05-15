import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'package.json',
  'pnpm-workspace.yaml',
  'apps/api/package.json',
  'apps/web/package.json',
  'packages/types/package.json',
  'AGENTS.md',
  '.github/workflows/validate-pr.yml',
];

const errors = [];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    errors.push(`Arquivo estrutural ausente: ${file}`);
  }
}

const packageJsonPath = join(root, 'package.json');
if (existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  for (const scriptName of ['validate', 'arch:check', 'access:check', 'docs:check']) {
    if (!packageJson.scripts?.[scriptName]) {
      errors.push(`Script ausente em package.json: ${scriptName}`);
    }
  }
}

const agentPath = join(root, 'AGENTS.md');
if (existsSync(agentPath)) {
  const content = readFileSync(agentPath, 'utf8');
  for (const expected of [
    'docs/architecture/overview.md',
    'docs/architecture/auth-and-access-control.md',
    'docs/execution-plans/active/',
    'pnpm validate',
  ]) {
    if (!content.includes(expected)) {
      errors.push(`AGENTS.md nao aponta para: ${expected}`);
    }
  }
}

if (errors.length > 0) {
  console.error('arch:check encontrou problemas:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('arch:check OK');
