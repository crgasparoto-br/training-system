import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('API real legacy execution route mount', () => {
  const mainSource = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');

  it('registers the legacy execution router before the global 404 fallback', () => {
    const mountIndex = mainSource.indexOf("app.use('/api/v1/executions', executionsRoutes);");
    const fallbackIndex = mainSource.indexOf("app.use((_req, res) => {");

    expect(mountIndex).toBeGreaterThanOrEqual(0);
    expect(fallbackIndex).toBeGreaterThan(mountIndex);
  });
});
