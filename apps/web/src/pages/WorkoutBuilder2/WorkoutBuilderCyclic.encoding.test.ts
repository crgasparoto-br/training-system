import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const cyclicPath = join(process.cwd(), 'src/pages/WorkoutBuilder2/WorkoutBuilderCyclic.tsx');
const cyclicSource = readFileSync(cyclicPath, 'utf8');

describe('WorkoutBuilderCyclic: rótulos pt-BR', () => {
  it('mantém os rótulos visíveis da montagem cíclica em UTF-8 correto', () => {
    const expectedLabels = [
      'Inserção',
      'Nº sessões',
      'Nº de séries',
      '%VO2Máx interv.',
      '%VO2Máx',
    ];

    expectedLabels.forEach((label) => expect(cyclicSource).toContain(label));
  });

  it('rejeita as variantes de mojibake já observadas na tela', () => {
    const brokenLabels = [
      'InserÃ§Ã£o',
      'NÂº sessÃµes',
      'NÂº de sÃ©ries',
      '%VO2MÃ¡x interv.',
      '%VO2MÃ¡x',
    ];

    brokenLabels.forEach((label) => expect(cyclicSource).not.toContain(label));
  });
});
