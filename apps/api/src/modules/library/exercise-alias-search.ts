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
