import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourceRoute = readFileSync(
  join(
    process.cwd(),
    'src/modules/capacity-prescriptions/capacity-prescription-source.routes.ts'
  ),
  'utf8'
);

describe('capacity prescription adipometry snapshot contract', () => {
  it('persiste entradas, resultados e versão da fórmula na versão da origem', () => {
    expect(sourceRoute).toContain("kind: 'adipometry-composition'");
    expect(sourceRoute).toContain('formulaVersion: ADIPOMETRY_FORMULA_VERSION');
    expect(sourceRoute).toContain('skinfoldsMm: input.skinfoldsMm');
    expect(sourceRoute).toContain('result,');
    expect(sourceRoute).toContain('JSON.stringify(adipometry.snapshot)');
  });

  it('não aceita adipometria selecionada sem snapshot calculável', () => {
    expect(sourceRoute).toContain("mappedType === 'adipometry' && !adipometry.snapshot");
    expect(sourceRoute).toContain('CapacitySourceValidationError');
    expect(sourceRoute).toContain("return sendError(res, error.message, 400)");
  });

  it('expõe a falha de cálculo na consulta em vez de omiti-la silenciosamente', () => {
    expect(sourceRoute).toContain("label: 'Status do cálculo'");
    expect(sourceRoute).toContain('Adipometria sem sexo válido');
    expect(sourceRoute).toContain('Adipometria sem peso válido');
  });
});
