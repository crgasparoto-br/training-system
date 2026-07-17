import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  collectDocumentationMarkdownFiles,
  findBrokenMarkdownReferences,
} from './check-doc-references.mjs';

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
  'docs/product/student-centered-training-experience.md',
  'docs/execution-plans/TEMPLATE.md',
  'docs/quality/validation.md',
];

const contentChecks = [
  {
    file: 'docs/execution-plans/TEMPLATE.md',
    label: 'Template de plano',
    sections: [
      '## Objetivo',
      '## Contexto',
      '## Arquivos e modulos principais',
      '## Criterios de aceite',
      '## Validacao manual',
    ],
  },
  {
    file: 'docs/product/roadmap.md',
    label: 'Roadmap canonico',
    sections: [
      '## Estado funcional atual',
      '## Ordem priorizada de evolucao',
      '## Criterio de pronto',
    ],
  },
  {
    file: 'docs/product/student-centered-training-experience.md',
    label: 'Experiencia centrada no aluno',
    sections: [
      '## Jornada do aluno',
      '## Catalogo interno de templates',
      '## Execucao e feedback pos-treino',
    ],
  },
];

const errors = [];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    errors.push(`Arquivo obrigatorio ausente: ${file}`);
  }
}

for (const check of contentChecks) {
  const absolutePath = join(root, check.file);
  if (!existsSync(absolutePath)) continue;

  const content = readFileSync(absolutePath, 'utf8');
  for (const section of check.sections) {
    if (!content.includes(section)) {
      errors.push(`${check.label} sem secao obrigatoria: ${section}`);
    }
  }
}

const markdownFiles = collectDocumentationMarkdownFiles(root);
errors.push(...findBrokenMarkdownReferences(root, markdownFiles));

if (errors.length > 0) {
  console.error('docs:check encontrou problemas:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('docs:check OK');
