import {
  PreRegistrationAdminError,
  preRegistrationAdminService as corePreRegistrationAdminService,
} from './pre-registration-admin.service.core.js';
import {
  isPrismaSerializableConflict,
  retryPrismaSerializableConflict,
} from './pre-registration-serializable-retry.js';

export * from './pre-registration-admin.service.core.js';

export const preRegistrationAdminService = {
  ...corePreRegistrationAdminService,

  async updateCommercial(
    ...args: Parameters<typeof corePreRegistrationAdminService.updateCommercial>
  ): Promise<Awaited<ReturnType<typeof corePreRegistrationAdminService.updateCommercial>>> {
    try {
      return await retryPrismaSerializableConflict(
        () => corePreRegistrationAdminService.updateCommercial(...args),
        2
      );
    } catch (error) {
      if (isPrismaSerializableConflict(error)) {
        throw new PreRegistrationAdminError(
          'Os dados foram alterados em outro local. Recarregue antes de editar novamente.',
          'CONCURRENT_MODIFICATION'
        );
      }
      throw error;
    }
  },
};
