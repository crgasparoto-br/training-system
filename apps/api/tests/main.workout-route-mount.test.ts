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

  it('imports and mounts legacy execution routes before the fallback 404 handler', () => {
    const importIndex = mainSource.indexOf("import executionsRoutes from './routes/executions.routes.js';");
    const mountIndex = mainSource.indexOf("app.use('/api/v1/executions', executionsRoutes);");
    const fallback404Index = mainSource.indexOf("app.use((_req, res) => {");

    expect(importIndex).toBeGreaterThanOrEqual(0);
    expect(mountIndex).toBeGreaterThanOrEqual(0);
    expect(fallback404Index).toBeGreaterThan(mountIndex);
  });

  it('advertises the mounted legacy execution prefix in the API index', () => {
    expect(mainSource).toContain("executions: '/api/v1/executions'");
  });
});
