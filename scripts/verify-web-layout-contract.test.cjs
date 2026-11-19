const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');

test('o shell usa largura fluida e gutters de 16/24/32 px', () => {
  const css = read('apps/web/src/index.css');
  const layout = read('apps/web/src/layouts/DashboardLayout.tsx');
  assert.match(css, /\.ts-container\s*\{[^}]*max-w-none[^}]*px-4 sm:px-6 xl:px-8/s);
  assert.match(layout, /ts-container flex min-w-0/);
  assert.match(layout, /min-w-0 flex-1 py-6/);
});

test('telas densas não têm limites arbitrários de largura', () => {
  const library = read('apps/web/src/pages/Library/index.tsx');
  const workout = read('apps/web/src/pages/WorkoutBuilder2/index.tsx');
  const collaborator = read('apps/web/src/pages/Settings/CollaboratorFunctions.tsx');
  assert.match(library, /className="ts-content-fluid"/);
  assert.doesNotMatch(library, /max-w-7xl/);
  assert.doesNotMatch(workout, /max-w-\[1800px\]/);
  assert.ok((workout.match(/ts-content-fluid/g) || []).length >= 3);
  assert.match(workout, /overflow-x-auto rounded-lg border border-gray-200/);
  assert.match(workout, /min-w-\[760px\] w-full divide-y divide-gray-200/);
  assert.match(collaborator, /activeTab === 'access' \? 'ts-content-fluid' : 'ts-content-readable'/);
});

test('abas migradas têm estados suaves e CSS por variante, não por role global', () => {
  const css = read('apps/web/src/index.css');
  assert.match(css, /\.ts-tab-button-active\s*\{[^}]*bg-primary\/10 text-foreground/s);
  assert.match(css, /\.ts-tab-tile-active\s*\{[^}]*bg-primary\/10 text-foreground/s);
  assert.doesNotMatch(css, /^\s*\[role='tablist'\]\s*>\s*\[role='tab'\]\s*\{/m);
  assert.match(read('apps/web/src/pages/Settings/ServicesCatalog.tsx'), /ts-tab-button-active/);
  assert.match(read('apps/web/src/pages/Settings/CollaboratorFunctions.tsx'), /ts-tab-button-active/);
  assert.match(read('apps/web/src/pages/WorkoutBuilder/index.tsx'), /ts-tab-button-active/);
  assert.match(read('apps/web/src/pages/PublicPreRegistration/PublicPreRegistration.tsx'), /ts-tab-button-active/);
  assert.match(read('apps/web/src/pages/PhysicalAssessment/CapacityPrescriptionScreen.tsx'), /ts-tab-tile-active/);
});

test('harness de navegador cobre quatro viewports e detecta shell limitado', () => {
  const harness = read('apps/api/scripts/visual-audit-settings-parameters.mjs');
  const docs = read('docs/visual-guidelines.md');
  for (const viewport of ['1920x1080', '1440x900', '1366x768', '390x844']) {
    assert.ok(harness.includes(viewport) || (viewport === '1920x1080' && harness.includes('width: 1920, height: 1080')), viewport);
    assert.ok(docs.includes(viewport), viewport);
  }
  assert.match(harness, /dashboardShellWidth < diagnostics\.viewportWidth - 64/);
});

test('issue #553 registra rotas reais, estados, SHA, teclado e quatro viewports no navegador', () => {
  const harness = read('apps/web/src/pages/issue-553-visual-browser.test.js');
  const workflow = read('.github/workflows/validate-pr.yml');
  for (const route of [
    '/library', '/settings/collaborator-functions', '/settings/services',
    '/pre-cadastro/visual-invite-553', '/protocolo-avaliacao-fisica/prescricao-capacidades',
    '/__issue-553-legacy.html',
  ]) assert.ok(harness.includes(route), route);
  for (const width of [390, 1366, 1440, 1920]) {
    assert.match(harness, new RegExp(`width: ${width}, height: (844|768|900|1080)`));
  }
  assert.match(harness, /documentScrollWidth > dimensions\.viewportWidth \+ 1/);
  assert.match(harness, /ArrowRight.*End.*Home/s);
  assert.match(harness, /screenshotSha256/);
  assert.match(harness, /sha: subjectSha/);
  assert.match(harness, /inspectFilter\(page\)/);
  assert.match(workflow, /ISSUE_553_BROWSER_EVIDENCE: '1'/);
  assert.match(workflow, /artifacts\/issue-553\/\*\*/);
});

test('filtro de permissoes usa tom suave e foco explicito, nunca fundo solido', () => {
  const editor = read('apps/web/src/pages/Settings/CollaboratorFunctions.tsx');
  assert.match(editor, /aria-label="Filtro de permissões"/);
  assert.match(editor, /permFilter === filter \? 'bg-primary\/10 text-foreground/);
  assert.doesNotMatch(editor, /permFilter === filter \? 'bg-primary text-primary-foreground/);
  assert.match(editor, /focus-visible:ring-2/);
});

// Regressao A-003: remover o CSS global de role=tablist nao pode quebrar os dias da Montagem 2.
test('dias resistidos mantêm rolagem interna horizontal e não dependem da regra global removida', () => {
  const css = read('apps/web/src/index.css');
  const component = read('apps/web/src/pages/WorkoutBuilder2/WorkoutBuilderResistance.tsx');
  const harness = read('apps/web/src/pages/WorkoutBuilder2/issue-399-full-page-browser-evidence.test.js');
  const listRule = css.match(/\[role='tablist'\]\[data-tabs='resistance-days'\]\s*\{([^}]*)\}/)?.[1];
  const itemRule = css.match(/\[role='tablist'\]\[data-tabs='resistance-days'\]\s*>\s*\[role='tab'\]\s*\{([^}]*)\}/)?.[1];
  assert.ok(listRule, 'o seletor de dias deve ter regra especifica');
  assert.match(listRule, /\bflex\b.*\bw-max\b.*\bmin-w-full\b.*\bflex-nowrap\b/s);
  assert.match(itemRule, /inline-flex.*shrink-0.*whitespace-nowrap/s);
  assert.match(component, /overflow-x-auto[^\n]*>\s*\n\s*<div role="tablist"[^>]*data-tabs="resistance-days"/);
  assert.match(harness, /tabsSameRow/);
  assert.match(harness, /wrapperScrollWidth > wrapperClientWidth/);
  assert.match(harness, /page\.keyboard\.press\('ArrowRight'\)/);
  assert.match(harness, /page\.keyboard\.press\('End'\)/);
  assert.match(harness, /page\.keyboard\.press\('Home'\)/);
});
