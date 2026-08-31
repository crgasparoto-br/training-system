-- Corrige apenas mojibake CP850 identificável com segurança em nomes legados.
-- A passagem C1 converte somente caracteres de controle. Bytes visíveis ambíguos
-- (como NBSP, Ç, Ó e Ô) só são tratados em fragmentos legados conhecidos.
-- Assim a migration é idempotente e preserva nomes customizados Unicode válidos.
WITH RECURSIVE
encoding_map AS (
  SELECT
    chr(128) || chr(129) || chr(130) || chr(131) || chr(132) || chr(133) ||
    chr(135) || chr(136) || chr(137) || chr(138) || chr(139) || chr(140) ||
    chr(141) || chr(142) || chr(144) || chr(147) || chr(148) || chr(149) ||
    chr(150) || chr(151) || chr(153) || chr(154) AS source_chars,
    'ÇüéâäàçêëèïîìÄÉôöòûùÖÜ'::text AS target_chars
),
lexical_repairs(ord, source_text, target_text) AS (
  VALUES
    (1, 'çÆ', 'çã'),
    (2, 'CÆo', 'Cão'),
    (3, 'cÆo', 'cão'),
    (4, 'DorsiflexÆo', 'Dorsiflexão'),
    (5, 'FlexÆo', 'Flexão'),
    (6, 'flexÆo', 'flexão'),
    (7, 'ExtensÆo', 'Extensão'),
    (8, 'impulsÆo', 'impulsão'),
    (9, 'B£lgaro', 'Búlgaro'),
    (10, 'S¢leo', 'Sóleo'),
    (11, 'C¢coras', 'Cócoras'),
    (12, 'N¢rdica', 'Nórdica'),
    (13, 'Equil¡brio', 'Equilíbrio'),
    (14, 'Tr¡ceps', 'Tríceps'),
    (15, 'n¡vel', 'nível'),
    (16, 'poss¡vel', 'possível'),
    (17, 'M quina', 'Máquina'),
    (18, 'm quina', 'máquina'),
    (19, 'El stico', 'Elástico'),
    (20, 'el stico', 'elástico'),
    (21, 'Tor cica', 'Torácica'),
    (22, 'esc pula', 'escápula'),
    (23, 'r pido', 'rápido')
),
translated_names AS (
  SELECT
    exercise."id",
    exercise."contractId" AS contract_id,
    exercise."name" AS original_name,
    translate(exercise."name", encoding_map.source_chars, encoding_map.target_chars) AS repaired_name
  FROM "ExerciseLibrary" AS exercise
  CROSS JOIN encoding_map
),
repaired_names AS (
  SELECT
    translated."id",
    translated.contract_id,
    translated.original_name,
    0 AS ord,
    translated.repaired_name
  FROM translated_names AS translated

  UNION ALL

  SELECT
    repaired."id",
    repaired.contract_id,
    repaired.original_name,
    lexical.ord,
    replace(repaired.repaired_name, lexical.source_text, lexical.target_text) AS repaired_name
  FROM repaired_names AS repaired
  JOIN lexical_repairs AS lexical
    ON lexical.ord = repaired.ord + 1
),
final_repairs AS (
  SELECT DISTINCT ON (repaired."id")
    repaired."id",
    repaired.contract_id,
    repaired.original_name,
    repaired.repaired_name
  FROM repaired_names AS repaired
  ORDER BY repaired."id", repaired.ord DESC
),
safe_repairs AS (
  SELECT repaired."id", repaired.repaired_name
  FROM final_repairs AS repaired
  WHERE repaired.repaired_name IS DISTINCT FROM repaired.original_name
    AND NOT EXISTS (
      SELECT 1
      FROM "ExerciseLibrary" AS existing
      WHERE existing."contractId" = repaired.contract_id
        AND existing."name" = repaired.repaired_name
        AND existing."id" <> repaired."id"
    )
)
UPDATE "ExerciseLibrary" AS exercise
SET "name" = safe_repairs.repaired_name
FROM safe_repairs
WHERE exercise."id" = safe_repairs."id";
