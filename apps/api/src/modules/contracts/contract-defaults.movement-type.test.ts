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

  it('mantém código não suportado do catálogo ausente em vez de coerci-lo', () => {
    const rawRows = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'src/scripts/exercises-data.json'), 'utf8')
    ) as Array<{ name?: string; movementType?: string }>;
    const bicycleSource = rawRows.find((row) => row.name === 'Bicicleta');

    expect(bicycleSource?.movementType).toBe('-');

    const defaults = loadProductExerciseDefaults();
    const bicycleDefault = defaults.find((item) => item.name === 'Bicicleta');

    expect(bicycleDefault).toBeDefined();
    expect(bicycleDefault?.movementType).toBeUndefined();
  });
});
