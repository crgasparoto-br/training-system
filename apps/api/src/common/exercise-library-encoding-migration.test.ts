import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION_PATH = resolve(
  process.cwd(),
  'prisma/migrations/20260831121000_repair_exercise_library_ptbr_encoding/migration.sql',
);

const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');

function buildMigrationMap(): Map<string, string> {
  const sourceCodes = Array.from(migrationSql.matchAll(/chr\((\d+)\)/g), (match) => Number(match[1]));
  const targetMatch = migrationSql.match(/'([^']+)'::text AS target_chars/);

  if (!targetMatch) {
    throw new Error('target_chars não encontrado na migration de encoding');
  }

  const targetCharacters = Array.from(targetMatch[1]);
  expect(targetCharacters).toHaveLength(sourceCodes.length);

  return new Map(
    sourceCodes.map((codePoint, index) => [String.fromCodePoint(codePoint), targetCharacters[index]]),
  );
}

function applyMigrationTranslation(value: string): string {
  const translation = buildMigrationMap();
  return Array.from(value, (character) => translation.get(character) ?? character).join('');
}

describe('migration de reparo da biblioteca de exercícios', () => {
  it.each([
    ['m\u0082dia', 'média'],
    ['P\u0082 a P\u0082', 'Pé a Pé'],
    ['Dorsiflex\u00c6o com El\u00a0stico', 'Dorsiflexão com Elástico'],
    ['Tr\u00a1ceps Franc\u0088s', 'Tríceps Francês'],
  ])('traduz marcador CP850 em passagem única: %s', (input, expected) => {
    expect(applyMigrationTranslation(input)).toBe(expected);
  });

  it.each(['média', 'Elevação', 'Extensão', 'Abdução', 'Exercício customizado do aluno'])(
    'preserva UTF-8 pt-BR válido: %s',
    (input) => {
      expect(applyMigrationTranslation(input)).toBe(input);
    },
  );

  it('não remapeia codepoints ambíguos que também são acentos Unicode válidos', () => {
    const sourceCodes = Array.from(migrationSql.matchAll(/chr\((\d+)\)/g), (match) => Number(match[1]));

    expect(sourceCodes).not.toEqual(expect.arrayContaining([224, 226, 227, 228, 229, 233, 234, 235]));
  });

  it('mantém a atualização restrita ao nome e protege colisões por contrato', () => {
    expect(migrationSql).toContain('existing."contractId" = repaired."contractId"');
    expect(migrationSql).toContain('existing."name" = repaired.repaired_name');
    expect(migrationSql).not.toContain('"muscleGroup" =');
    expect(migrationSql).not.toContain('"notes" =');
  });
});
