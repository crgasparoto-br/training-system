import { Prisma } from '@prisma/client';
import { mapAdipometryPersistenceError } from './adipometry-http-support.js';

function prismaError(databaseMessage: string) {
  return new Prisma.PrismaClientKnownRequestError(
    `Raw query failed. Code: 23514. Message: ${databaseMessage}`,
    {
      code: 'P2010',
      clientVersion: '5.7.0',
      meta: {
        code: '23514',
        message: databaseMessage,
      },
    }
  );
}

describe('adipometry HTTP persistence error mapping', () => {
  it('maps correction conflicts without exposing the raw database message', () => {
    const rawMarker = 'sensitive-db-detail';
    const mapped = mapAdipometryPersistenceError(
      prismaError(`ADIPOMETRY_CORRECTION_ALREADY_OPEN ${rawMarker}`)
    );

    expect(mapped).toMatchObject({
      code: 'ADIPOMETRY_CORRECTION_ALREADY_OPEN',
      statusCode: 409,
    });
    expect(mapped?.message).not.toContain(rawMarker);
    expect(mapped?.message).not.toContain('23514');
  });

  it('normalizes cross-tenant actor failures as resource not found', () => {
    const mapped = mapAdipometryPersistenceError(
      prismaError('ADIPOMETRY_ACTOR_CROSS_TENANT_OR_INACTIVE internal-user-id')
    );

    expect(mapped).toMatchObject({
      code: 'ADIPOMETRY_RESOURCE_NOT_FOUND',
      statusCode: 404,
      message: 'Avaliação não encontrada.',
    });
  });

  it('does not reinterpret unrelated persistence failures', () => {
    expect(mapAdipometryPersistenceError(prismaError('UNRELATED_DATABASE_FAILURE'))).toBeNull();
  });
});
