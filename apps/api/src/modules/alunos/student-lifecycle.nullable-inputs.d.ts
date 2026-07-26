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

export {};
