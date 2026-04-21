BEGIN;

CREATE TYPE "CollaboratorFunction" AS ENUM (
  'professor',
  'intern',
  'manager',
  'administrative',
  'cleaning_services'
);

ALTER TABLE "Professor"
ADD COLUMN "collaboratorFunction" "CollaboratorFunction" NOT NULL DEFAULT 'professor';

COMMIT;
