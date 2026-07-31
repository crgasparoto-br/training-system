from pathlib import Path

script = Path('scripts/verify-adipometry-persistence-boundaries.sh')
content = script.read_text()

anchor = '''DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAssessment"
    WHERE "id" = 'issue246-boundary-direct-a1'
      AND "skinfoldTotalMm" = 30'''

diagnostic = '''SELECT
  "skinfoldTotalMm",
  "bodyFatPercentage",
  "fatMassKg",
  "leanMassKg",
  "calculationSnapshot" #>> '{results,bodyFatPercentage}' AS snapshot_body_fat,
  "calculationSnapshot" ->> 'ageAtAssessment' AS snapshot_age,
  "calculationSnapshot" #>> '{profileCriteria,sex}' AS snapshot_sex,
  "calculationSnapshot" #>> '{profileCriteria,sources,birthDate,kind}' AS birth_date_source,
  "calculationSnapshot" #>> '{profileCriteria,sources,sex,kind}' AS sex_source,
  JSONB_TYPEOF("calculationSnapshot" #> '{rules,equations}') AS equations_type,
  "calculationSnapshot" ->> 'implementationVersion' AS implementation_version,
  "calculationSnapshot"
FROM "AdipometryAssessment"
WHERE "id" = 'issue246-boundary-direct-a1';

'''

count = content.count(anchor)
if count != 1:
    raise RuntimeError(f'boundary aggregate assertion anchor mismatch: expected 1, got {count}')

script.write_text(content.replace(anchor, diagnostic + anchor, 1))
