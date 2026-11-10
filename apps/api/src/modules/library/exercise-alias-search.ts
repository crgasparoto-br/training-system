import type { PrismaClient } from '@prisma/client';

/** Parameterized tenant-scoped, case-insensitive substring search for exercise aliases. */
export async function findExerciseIdsByAlias(
  client: Pick<PrismaClient, '$queryRaw'>,
  contractId: string,
  search: string,
): Promise<string[]> {
  const term = search.trim();
  if (!term) return [];
  // strpos treats % and _ as literals, unlike ILIKE, and allows partial matches.
  const matches = await client.$queryRaw<Array<{ id: string }>>`
    SELECT e."id"
    FROM "ExerciseLibrary" AS e
    WHERE e."contractId" = ${contractId}
      AND EXISTS (
        SELECT 1 FROM unnest(e."aliases") AS a(value)
        WHERE strpos(lower(a.value), lower(${term})) > 0
      )
  `;
  return matches.map((item) => item.id);
}

/** Search both primary and secondary muscles without crossing tenants.
 * The same finder supports substring search and exact case-insensitive filter.
 */
export async function findExerciseIdsByMuscleGroup(
  client: Pick<PrismaClient, '$queryRaw'>,
  contractId: string,
  search: string,
  exact = false,
): Promise<string[]> {
  const term = search.trim();
  if (!term) return [];
  const matches = await client.$queryRaw<Array<{ id: string }>>`
    SELECT e."id"
    FROM "ExerciseLibrary" AS e
    WHERE e."contractId" = ${contractId}
      AND EXISTS (
        SELECT 1 FROM unnest(e."primaryMuscleGroups" || e."secondaryMuscleGroups") AS m(value)
        WHERE CASE WHEN ${exact}
          THEN lower(btrim(m.value)) = lower(${term})
          ELSE strpos(lower(m.value), lower(${term})) > 0
        END
      )
  `;
  return matches.map(({ id }) => id);
}
