import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'docs/README.md',
  'docs/architecture/overview.md',
  'docs/architecture/api.md',
  'docs/architecture/web.md',
  'docs/architecture/database.md',
  'docs/architecture/auth-and-access-control.md',
  'docs/architecture/deployment.md',
  'docs/product/roadmap.md',
  'docs/product/access-control.md',
  'docs/product/integrated-prescription-control.md',
  'docs/execution-plans/TEMPLATE.md',
  'docs/quality/validation.md',
];

const errors = [];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    errors.push(`Arquivo obrigatorio ausente: ${file}`);
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
