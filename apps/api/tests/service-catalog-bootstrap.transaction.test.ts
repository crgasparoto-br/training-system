import type { PrismaClient } from '@prisma/client';
import {
  SERVICE_CATALOG_BOOTSTRAP_TRANSACTION_MAX_WAIT_MS,
  SERVICE_CATALOG_BOOTSTRAP_TRANSACTION_OPTIONS,
  SERVICE_CATALOG_BOOTSTRAP_TRANSACTION_TIMEOUT_MS,
  createServiceCatalogBootstrap,
} from '../src/modules/services/service.bootstrap.js';
import {
  SERVICE_CATALOG_BOOTSTRAP_UNAVAILABLE_MESSAGE,
  ServiceCatalogBootstrapUnavailableError,
} from '../src/modules/services/service.bootstrap-errors.js';

describe('service catalog bootstrap transaction configuration', () => {
  it('passes the named 10s/30s limits to the interactive transaction', async () => {
    const transaction = jest.fn().mockResolvedValue(undefined);
    const bootstrap = createServiceCatalogBootstrap({
      $transaction: transaction,
    } as unknown as PrismaClient);

    await bootstrap('contract-1', false);

    expect(SERVICE_CATALOG_BOOTSTRAP_TRANSACTION_MAX_WAIT_MS).toBe(10_000);
    expect(SERVICE_CATALOG_BOOTSTRAP_TRANSACTION_TIMEOUT_MS).toBe(30_000);
    expect(SERVICE_CATALOG_BOOTSTRAP_TRANSACTION_OPTIONS).toEqual({
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 30_000,
    });
  });

  it('preloads each catalog table once instead of querying existence inside loops', async () => {
    const transactionClient = {
      companyContract: {
        findUnique: jest.fn().mockResolvedValue({ id: 'contract-1' }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const transaction = jest.fn(
      async (callback: (client: typeof transactionClient) => Promise<void>) =>
        callback(transactionClient)
    );
    const bootstrap = createServiceCatalogBootstrap({
      $transaction: transaction,
    } as unknown as PrismaClient);

    const result = await bootstrap('contract-1', false);

    expect(result.createdServices).toHaveLength(9);
    expect(transactionClient.$queryRaw).toHaveBeenCalledTimes(4);
    expect(transactionClient.$executeRaw).toHaveBeenCalledTimes(4);
  });

  it('translates transaction unavailability without exposing Prisma details', async () => {
    const technicalError = Object.assign(
      new Error('Transaction API error: Transaction not found for internal id tx-secret'),
      { code: 'P2028' }
    );
    const bootstrap = createServiceCatalogBootstrap({
      $transaction: jest.fn().mockRejectedValue(technicalError),
    } as unknown as PrismaClient);

    await expect(bootstrap('contract-1', false)).rejects.toEqual(
      expect.objectContaining({
        name: 'ServiceCatalogBootstrapUnavailableError',
        message: SERVICE_CATALOG_BOOTSTRAP_UNAVAILABLE_MESSAGE,
        technicalCause: technicalError,
      })
    );

    await expect(bootstrap('contract-1', false)).rejects.toBeInstanceOf(
      ServiceCatalogBootstrapUnavailableError
    );
  });
});
