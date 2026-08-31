-- Corrige somente marcadores CP850 inequívocos presentes em nomes legados.
-- A tradução é feita em uma única passagem e não inclui codepoints que também
-- representam acentos pt-BR válidos (por exemplo, é/ã), preservando texto correto.
WITH encoding_map AS (
  SELECT
    chr(128) || chr(129) || chr(130) || chr(131) || chr(132) || chr(133) ||
    chr(135) || chr(136) || chr(137) || chr(138) || chr(139) || chr(140) ||
    chr(141) || chr(142) || chr(144) || chr(147) || chr(148) || chr(149) ||
    chr(150) || chr(151) || chr(153) || chr(154) || chr(160) || chr(161) ||
    chr(162) || chr(163) || chr(181) || chr(182) || chr(183) || chr(198) ||
    chr(199) || chr(210) || chr(211) || chr(212) || chr(214) || chr(215) ||
    chr(216) || chr(222) AS source_chars,
    'ÇüéâäàçêëèïîìÄÉôöòûùÖÜáíóúÁÂÀãÃÊËÈÍÎÏÌ'::text AS target_chars
), repaired_names AS (
  SELECT
    exercise."id",
    exercise."contractId",
    exercise."name" AS original_name,
    translate(exercise."name", encoding_map.source_chars, encoding_map.target_chars) AS repaired_name
  FROM "ExerciseLibrary" AS exercise
  CROSS JOIN encoding_map
), safe_repairs AS (
  SELECT repaired."id", repaired.repaired_name
  FROM repaired_names AS repaired
  WHERE repaired.repaired_name IS DISTINCT FROM repaired.original_name
    AND NOT EXISTS (
      SELECT 1
      FROM "ExerciseLibrary" AS existing
      WHERE existing."contractId" = repaired."contractId"
        AND existing."name" = repaired.repaired_name
        AND existing."id" <> repaired."id"
    )
)
UPDATE "ExerciseLibrary" AS exercise
SET "name" = safe_repairs.repaired_name
FROM safe_repairs
WHERE exercise."id" = safe_repairs."id";
