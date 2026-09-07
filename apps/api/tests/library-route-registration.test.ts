import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const main = readFileSync(resolve(root, 'apps/api/src/main.ts'), 'utf8');
const routes = readFileSync(resolve(root, 'apps/api/src/routes/library.routes.ts'), 'utf8');
const service = readFileSync(
  resolve(root, 'apps/api/src/modules/library/library.service.ts'),
  'utf8'
);

describe('issue 373 library route registration', () => {
  it('mounts the library router in the API bootstrap', () => {
    expect(main).toContain("import libraryRoutes from './routes/library.routes.js'");
    expect(main).toContain("app.use('/api/v1/library', libraryRoutes)");
  });

  it('keeps exercise listing protected and scoped to the authenticated contract', () => {
    expect(routes).toContain('router.use(authMiddleware)');
    expect(routes).toContain('router.use(professorMiddleware)');
    expect(routes).toContain("router.get('/exercises'");
    expect(routes).toContain('libraryService.listExercises(contractId');
    expect(service).toContain('const where: ExerciseLibraryListWhere = { contractId }');
  });
});
