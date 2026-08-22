import { repairPtBrMojibake } from './pt-br-text.js';

describe('repairPtBrMojibake', () => {
  it.each([
    ['Abdominal P\u0082 a P\u0082', 'Abdominal Pé a Pé'],
    ['Abdu\u0087\u00c6o de quadril com caneleira', 'Abdução de quadril com caneleira'],
    ['Agachamento B\u00a3lgaro', 'Agachamento Búlgaro'],
    ['Banco S\u00a2leo', 'Banco Sóleo'],
    ['C\u00c6o Ca\u0087ador', 'Cão Caçador'],
    ['Dorsiflex\u00c6o Unilateral com El\u00a0stico', 'Dorsiflexão Unilateral com Elástico'],
    ['Eleva\u0087\u00c6o P\u0082lvica', 'Elevação Pélvica'],
  ])('recupera exportação CP850 corrompida: %s', (input, expected) => {
    expect(repairPtBrMojibake(input)).toBe(expected);
  });

  it.each([
    'Abdômen',
    'Elevação Pélvica',
    'Flexão de braço',
    'Rotação externa com elástico',
    'Exercício customizado do aluno',
  ])('preserva texto pt-BR já correto: %s', (input) => {
    expect(repairPtBrMojibake(input)).toBe(input);
  });
});
