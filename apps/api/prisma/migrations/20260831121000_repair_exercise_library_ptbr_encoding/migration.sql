-- Corrige o catálogo legado que foi exportado em CP850 e persistido como Unicode.
-- A função é removida ao final da migração e não altera caracteres pt-BR já válidos.
CREATE FUNCTION "_repair_exercise_ptbr_encoding"(value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  value := replace(value, chr(128), 'Ç');
  value := replace(value, chr(129), 'ü');
  value := replace(value, chr(130), 'é');
  value := replace(value, chr(131), 'â');
  value := replace(value, chr(132), 'ä');
  value := replace(value, chr(133), 'à');
  value := replace(value, chr(135), 'ç');
  value := replace(value, chr(136), 'ê');
  value := replace(value, chr(137), 'ë');
  value := replace(value, chr(138), 'è');
  value := replace(value, chr(139), 'ï');
  value := replace(value, chr(140), 'î');
  value := replace(value, chr(141), 'ì');
  value := replace(value, chr(142), 'Ä');
  value := replace(value, chr(144), 'É');
  value := replace(value, chr(147), 'ô');
  value := replace(value, chr(148), 'ö');
  value := replace(value, chr(149), 'ò');
  value := replace(value, chr(150), 'û');
  value := replace(value, chr(151), 'ù');
  value := replace(value, chr(153), 'Ö');
  value := replace(value, chr(154), 'Ü');
  value := replace(value, chr(160), 'á');
  value := replace(value, chr(161), 'í');
  value := replace(value, chr(162), 'ó');
  value := replace(value, chr(163), 'ú');
  value := replace(value, chr(181), 'Á');
  value := replace(value, chr(182), 'Â');
  value := replace(value, chr(183), 'À');
  value := replace(value, chr(198), 'ã');
  value := replace(value, chr(199), 'Ã');
  value := replace(value, chr(210), 'Ê');
  value := replace(value, chr(211), 'Ë');
  value := replace(value, chr(212), 'È');
  value := replace(value, chr(214), 'Í');
  value := replace(value, chr(215), 'Î');
  value := replace(value, chr(216), 'Ï');
  value := replace(value, chr(222), 'Ì');
  value := replace(value, chr(224), 'Ó');
  value := replace(value, chr(226), 'Ô');
  value := replace(value, chr(227), 'Ò');
  value := replace(value, chr(228), 'õ');
  value := replace(value, chr(229), 'Õ');
  value := replace(value, chr(233), 'Ú');
  value := replace(value, chr(234), 'Û');
  value := replace(value, chr(235), 'Ù');

  RETURN value;
END;
$$;

WITH repaired_names AS (
  SELECT
    exercise."id",
    exercise."contractId",
    exercise."name" AS original_name,
    "_repair_exercise_ptbr_encoding"(exercise."name") AS repaired_name
  FROM "ExerciseLibrary" AS exercise
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

UPDATE "ExerciseLibrary"
SET
  "muscleGroup" = "_repair_exercise_ptbr_encoding"("muscleGroup"),
  "notes" = "_repair_exercise_ptbr_encoding"("notes")
WHERE
  "muscleGroup" IS DISTINCT FROM "_repair_exercise_ptbr_encoding"("muscleGroup")
  OR "notes" IS DISTINCT FROM "_repair_exercise_ptbr_encoding"("notes");

DROP FUNCTION "_repair_exercise_ptbr_encoding"(TEXT);
