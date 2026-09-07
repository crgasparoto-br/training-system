import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('plans: fronteira de escrita legada de Microcycle', () => {
  const routeSource = readFileSync(
    join(process.cwd(), 'src/modules/plans/plan.routes.ts'),
    'utf8'
  );
  const serviceSource = readFileSync(
    join(process.cwd(), 'src/modules/plans/plan.service.ts'),
    'utf8'
  );

  it('não expõe endpoints REST de criação, edição ou exclusão de Microcycle', () => {
    expect(routeSource).not.toMatch(/router\.post\(['"]\/microcycles['"]/);
    expect(routeSource).not.toMatch(/router\.put\(['"]\/microcycles\/:id['"]/);
    expect(routeSource).not.toMatch(/router\.delete\(['"]\/microcycles\/:id['"]/);
  });

  it('não mantém serviços órfãos de escrita de Microcycle', () => {
    expect(serviceSource).not.toContain('CreateMicrocycleDTO');
    expect(serviceSource).not.toMatch(/\bcreateMicrocycle\b/);
    expect(serviceSource).not.toMatch(/\bupdateMicrocycle\b/);
    expect(serviceSource).not.toMatch(/\bdeleteMicrocycle\b/);
  });

  it('preserva somente a leitura histórica do legado', () => {
    expect(serviceSource).toMatch(/microcycles:\s*(true|\{)/);
    expect(serviceSource).toContain('prisma.microcycle.findMany');
  });
});
