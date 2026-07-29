import { createHash } from 'node:crypto';
import {
  PreRegistrationAdminError,
  preRegistrationAdminService as corePreRegistrationAdminService,
} from './pre-registration-admin.service.core.js';
import {
  isPrismaRetryableTransactionError,
  retryPrismaTransactionConflict,
} from './pre-registration-serializable-retry.js';

export * from './pre-registration-admin.service.core.js';

export function opaquePreRegistrationAuditItemId(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const preRegistrationAdminService = {
  ...corePreRegistrationAdminService,

  async getAuditTrail(
    ...args: Parameters<typeof corePreRegistrationAdminService.getAuditTrail>
  ): Promise<Awaited<ReturnType<typeof corePreRegistrationAdminService.getAuditTrail>>> {
    const result = await corePreRegistrationAdminService.getAuditTrail(...args);
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        id: opaquePreRegistrationAuditItemId(item.id),
      })),
    };
  },

  async updateCommercial(
    ...args: Parameters<typeof corePreRegistrationAdminService.updateCommercial>
  ): Promise<Awaited<ReturnType<typeof corePreRegistrationAdminService.updateCommercial>>> {
    try {
      return await retryPrismaTransactionConflict(
        () => corePreRegistrationAdminService.updateCommercial(...args),
        2
      );
    } catch (error) {
      if (isPrismaRetryableTransactionError(error)) {
        throw new PreRegistrationAdminError(
          'Os dados foram alterados em outro local. Recarregue antes de editar novamente.',
          'CONCURRENT_MODIFICATION'
        );
      }
      throw error;
    }
  },
};
