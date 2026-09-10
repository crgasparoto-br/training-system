import fs from 'node:fs';
import path from 'node:path';
import { loadProductExerciseDefaults } from './contract-defaults.service.js';

describe('movementType dos exercícios padrão', () => {
  it('aceita A como movimento Alternado a partir do catálogo canônico', () => {
    const defaults = loadProductExerciseDefaults();
    const alternating = defaults.filter((item) => item.movementType === 'A');

    expect(alternating.length).toBeGreaterThan(0);
    expect(alternating.map((item) => item.name)).toContain('Mobilidade de Quadril Alternado');
  });

  it('não converte B ou - para outro tipo de movimento', () => {
    const rawRows = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'src/scripts/exercises-data.json'), 'utf8')
    ) as Array<{ movementType?: string }>;
    const unsupportedCodes = rawRows
      .map((row) => row.movementType?.trim().toUpperCase())
      .filter((value) => value === 'B' || value === '-');

    expect(unsupportedCodes.length).toBeGreaterThan(0);

    const defaults = loadProductExerciseDefaults();
    expect(
      defaults.some((item) => ['B', '-'].includes(String(item.movementType ?? '')))
    ).toBe(false);
  });
});
