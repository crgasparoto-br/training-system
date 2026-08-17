import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const main = readFileSync(resolve(root, 'apps/api/src/main.ts'), 'utf8');
const routes = readFileSync(
  resolve(root, 'apps/api/src/modules/periodization/periodization.routes.ts'),
  'utf8'
);
const webService = readFileSync(
  resolve(root, 'apps/web/src/services/periodization.service.ts'),
  'utf8'
);

describe('periodization route mount contract', () => {
  it('mounts periodization before the global 404 fallback', () => {
    const mount = "app.use('/api/v1/periodization', periodizationRoutes)";
    const fallback = "app.use((_req, res) => {";

    expect(main).toContain("import { periodizationRoutes } from './modules/periodization/index.js'");
    expect(main).toContain("periodization: '/api/v1/periodization'");
    expect(main).toContain(mount);
    expect(main.indexOf(mount)).toBeGreaterThan(-1);
    expect(main.indexOf(mount)).toBeLessThan(main.indexOf(fallback));
  });

  it('keeps the settings parameters client aligned with the mounted backend route', () => {
    expect(webService).toContain("api.get(`/periodization/parameters${query}`)");
    expect(routes).toContain('router.use(authMiddleware)');
    expect(routes).toContain("router.get('/parameters', professorMiddleware");
  });
});
