import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'docs/architecture/overview.md',
  'docs/architecture/api.md',
  'docs/architecture/web.md',
  'docs/architecture/database.md',
  'docs/architecture/auth-and-access-control.md',
  'docs/architecture/deployment.md',
  'docs/product/access-control.md',
  'docs/execution-plans/TEMPLATE.md',
  'docs/quality/validation.md',
];

const requiredPlanSections = [
  '## Objetivo',
  '## Contexto',
  '## Arquivos e modulos principais',
  '## Criterios de aceite',
  '## Validacao manual',
];

const errors = [];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    errors.push(`Arquivo obrigatorio ausente: ${file}`);
  }
}

const activePlan = join(root, 'docs/execution-plans/active/2026-05-harness-engineering-foundation.md');
if (existsSync(activePlan)) {
  const content = readFileSync(activePlan, 'utf8');
  for (const section of requiredPlanSections) {
    if (!content.includes(section)) {
      errors.push(`Plano ativo sem secao obrigatoria: ${section}`);
    }
  }
}

if (errors.length > 0) {
  console.error('docs:check encontrou problemas:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('docs:check OK');