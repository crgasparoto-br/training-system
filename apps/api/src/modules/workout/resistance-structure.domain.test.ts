import { normalizeResistanceBlocks, ResistanceStructureValidationError } from './resistance-structure.domain';
describe('Issue #399 - blocos e séries estruturadas', () => {
  const valid = () => [{ position: 1, kind: 'principal', plannedSets: [
    { position: 1, repsMin: 8, repsMax: 12, loadKg: 35.5, loadPercent: null, rir: 2, rpe: 8, tempo: '3-1-1-0', restSec: 90 },
    { position: 2, repsMin: null, repsMax: null, loadPercent: 70 },
  ] }];
  it('preserva valores, faixas, ordem e campos nulos sem inventar metas', () => {
    const [block] = normalizeResistanceBlocks(valid());
    expect(block.plannedSets[0]).toMatchObject({ repsMin: 8, repsMax: 12, loadKg: 35.5, rir: 2, rpe: 8, restSec: 90 });
    expect(block.plannedSets[1].loadPercent).toBe(70);
    expect(block.plannedSets[1].repsMin).toBeNull();
    expect(normalizeResistanceBlocks([])).toEqual([]);
  });
  it.each([
    [{ ...valid()[0], position: 2 }],
    [{ ...valid()[0], kind: 'incorrect' }],
    [{ ...valid()[0], plannedSets: [] }],
    [{ ...valid()[0], plannedSets: [{ position: 2 }] }],
    [{ ...valid()[0], plannedSets: [{ position: 1, repsMin: 12, repsMax: 8 }] }],
    [{ ...valid()[0], plannedSets: [{ position: 1, rir: -1 }] }],
    [{ ...valid()[0], plannedSets: [{ position: 1, loadKg: '35' }] }],
  ])('rejeita estrutura inválida %#', (block) => {
    expect(() => normalizeResistanceBlocks([block])).toThrow(ResistanceStructureValidationError);
  });
});
