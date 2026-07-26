import './student-lifecycle.service.js';

declare module './student-lifecycle.service.js' {
  export function findMissingPreRegistrationFields(data: {
    name?: string | null;
    birthDate?: string | Date | null;
    phone?: string | null;
    email?: string | null;
    privacyNoticeVersion?: string | null;
    privacyAcceptedAt?: string | Date | null;
  }): string[];
}

declare global {
  // Compatibilidade temporária para um vestígio sem uso no fluxo de consolidação.
  // Deve ser removido junto com `void targetIdentity` antes do handoff final.
  var targetIdentity: undefined;
}

export {};
