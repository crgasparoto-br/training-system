import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION_PATH = resolve(
  process.cwd(),
  'prisma/migrations/20260831121000_repair_exercise_library_ptbr_encoding/migration.sql',
);

const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');

function buildControlMap(): Map<string, string> {
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

function buildLexicalRepairs(): Array<readonly [string, string]> {
  return Array.from(
    migrationSql.matchAll(/\(\s*\d+,\s*'([^']*)',\s*'([^']*)'\s*\)/g),
    (match) => [match[1], match[2]] as const,
  );
}

function applyMigrationRepair(value: string): string {
  const controlMap = buildControlMap();
  const controlsRepaired = Array.from(value, (character) => controlMap.get(character) ?? character).join('');

  return buildLexicalRepairs().reduce(
    (text, [source, target]) => text.split(source).join(target),
    controlsRepaired,
  );
}

const corruptedCases = [
  ['m\u0082dia', 'média'],
  ['P\u0082 a P\u0082', 'Pé a Pé'],
  ['Dorsiflex\u00c6o com El\u00a0stico', 'Dorsiflexão com Elástico'],
  ['Tr\u00a1ceps Franc\u0088s', 'Tríceps Francês'],
  ['Abdu\u0087\u00c6o', 'Abdução'],
  ['Abdominal M\u00a0quina', 'Abdominal Máquina'],
] as const;

describe('migration de reparo da biblioteca de exercícios', () => {
  it.each(corruptedCases)('repara somente padrões CP850 reconhecidos: %s', (input, expected) => {
    expect(applyMigrationRepair(input)).toBe(expected);
  });

  it.each([
    'média',
    'Elevação',
    'Extensão',
    'Abdução',
    'Ótimo',
    'Ômega',
    'Ção',
    'Supino\u00a0Reto',
    'Exercício customizado do aluno',
  ])('preserva UTF-8 pt-BR válido e NBSP legítimo: %s', (input) => {
    expect(applyMigrationRepair(input)).toBe(input);
  });

  it.each(corruptedCases)('é idempotente após o primeiro reparo: %s', (input) => {
    const repaired = applyMigrationRepair(input);
    expect(applyMigrationRepair(repaired)).toBe(repaired);
  });

  it('restringe translate ao intervalo C1 e trata bytes visíveis só por fragmentos conhecidos', () => {
    const sourceCodes = Array.from(migrationSql.matchAll(/chr\((\d+)\)/g), (match) => Number(match[1]));

    expect(sourceCodes.length).toBeGreaterThan(0);
    expect(sourceCodes.every((codePoint) => codePoint >= 128 && codePoint <= 159)).toBe(true);
    expect(buildLexicalRepairs()).toEqual(
      expect.arrayContaining([
        ['M\u00a0quina', 'Máquina'],
        ['Dorsiflex\u00c6o', 'Dorsiflexão'],
        ['Tr\u00a1ceps', 'Tríceps'],
      ]),
    );
  });

  it('mantém a atualização restrita ao nome e protege colisões por contrato', () => {
    expect(migrationSql).toContain('existing."contractId" = repaired.contract_id');
    expect(migrationSql).toContain('existing."name" = repaired.repaired_name');
    expect(migrationSql).not.toContain('"muscleGroup" =');
    expect(migrationSql).not.toContain('"notes" =');
  });
});
