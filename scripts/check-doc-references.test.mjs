import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { collectDocumentationMarkdownFiles, findBrokenMarkdownReferences } from './check-doc-references.mjs';

function withFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'check-doc-references-'));
  mkdirSync(join(root, 'docs', 'product'), { recursive: true });

  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('aceita links relativos e referencias docs existentes', () => {
  withFixture((root) => {
    writeFileSync(join(root, 'README.md'), '[Produto](docs/product/roadmap.md)\n');
    writeFileSync(join(root, 'docs', 'README.md'), '`docs/product/roadmap.md`\n');
    writeFileSync(join(root, 'docs', 'product', 'roadmap.md'), '# Roadmap\n');

    const files = collectDocumentationMarkdownFiles(root);
    assert.deepEqual(findBrokenMarkdownReferences(root, files), []);
  });
});

test('reprova link Markdown relativo inexistente', () => {
  withFixture((root) => {
    writeFileSync(join(root, 'docs', 'README.md'), '[Removido](product/removido.md)\n');

    const errors = findBrokenMarkdownReferences(root);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /docs\/README\.md:1 referencia local inexistente: product\/removido\.md/);
  });
});

test('reprova referencia docs em crases depois de mover arquivo', () => {
  withFixture((root) => {
    writeFileSync(
      join(root, 'docs', 'README.md'),
      'Fonte: `docs/execution-plans/active/plano-concluido.md`.\n',
    );

    const errors = findBrokenMarkdownReferences(root);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /docs\/execution-plans\/active\/plano-concluido\.md/);
  });
});

test('ignora URLs externas, ancoras e exemplos em blocos de codigo', () => {
  withFixture((root) => {
    writeFileSync(
      join(root, 'docs', 'README.md'),
      [
        '[GitHub](https://github.com/example/repo)',
        '[Secao](#secao)',
        '```text',
        '`docs/exemplo/inexistente.md`',
        '```',
      ].join('\n'),
    );

    assert.deepEqual(findBrokenMarkdownReferences(root), []);
  });
});
