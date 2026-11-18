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
