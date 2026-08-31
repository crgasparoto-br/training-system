import { repairPtBrMojibake } from './pt-br-text.js';

const corruptedCases = [
  ['Abdominal P\u0082 a P\u0082', 'Abdominal Pé a Pé'],
  ['Abdu\u0087\u00c6o de quadril com caneleira', 'Abdução de quadril com caneleira'],
  ['Agachamento B\u00a3lgaro', 'Agachamento Búlgaro'],
  ['Banco S\u00a2leo', 'Banco Sóleo'],
  ['C\u00c6o Ca\u0087ador', 'Cão Caçador'],
  ['Dorsiflex\u00c6o Unilateral com El\u00a0stico', 'Dorsiflexão Unilateral com Elástico'],
  ['Eleva\u0087\u00c6o P\u0082lvica', 'Elevação Pélvica'],
  ['média e P\u0082 a P\u0082', 'média e Pé a Pé'],
  ['Elevação com El\u00a0stico', 'Elevação com Elástico'],
  ['Ótimo P\u0082 a P\u0082', 'Ótimo Pé a Pé'],
] as const;

describe('repairPtBrMojibake', () => {
  it.each(corruptedCases)(
    'recupera exportação CP850 corrompida sem alterar Unicode válido: %s',
    (input, expected) => {
      expect(repairPtBrMojibake(input)).toBe(expected);
    },
  );

  it.each([
    'Abdômen',
    'Elevação Pélvica',
    'Flexão de braço',
    'Rotação externa com elástico',
    'Extensão de quadril',
    'média',
    'Ção',
    'Ótimo',
    'Ômega',
    'Supino\u00a0Reto',
    'Exercício customizado do aluno',
  ])('preserva texto pt-BR já correto e espaços legítimos: %s', (input) => {
    expect(repairPtBrMojibake(input)).toBe(input);
  });

  it.each(corruptedCases)(
    'é idempotente depois do primeiro reparo: %s',
    (input) => {
      const repaired = repairPtBrMojibake(input);
      expect(repairPtBrMojibake(repaired)).toBe(repaired);
    },
  );
});
