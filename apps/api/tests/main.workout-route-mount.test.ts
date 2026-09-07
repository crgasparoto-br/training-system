import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('API main workout route mount', () => {
  const mainPath = join(process.cwd(), 'src/main.ts');
  const mainSource = readFileSync(mainPath, 'utf8');

  it('imports and mounts workout routes before the fallback 404 handler', () => {
    const importIndex = mainSource.indexOf("import workoutRoutes from './routes/workout.routes.js';");
    const mountIndex = mainSource.indexOf("app.use('/api/v1/workout', workoutRoutes);");
    const fallback404Index = mainSource.indexOf("app.use((_req, res) => {");

    expect(importIndex).toBeGreaterThanOrEqual(0);
    expect(mountIndex).toBeGreaterThanOrEqual(0);
    expect(fallback404Index).toBeGreaterThan(mountIndex);
  });

  it('advertises the mounted workout API prefix in the API index', () => {
    expect(mainSource).toContain("workout: '/api/v1/workout'");
  });
});
