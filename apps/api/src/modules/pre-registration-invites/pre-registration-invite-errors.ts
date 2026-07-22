import {
  PRE_REGISTRATION_INVITE_GENERIC_PUBLIC_ERROR,
  type PreRegistrationInviteErrorCode,
} from '@corrida/types';

export class PreRegistrationInviteError extends Error {
  constructor(
    message: string,
    public readonly code: PreRegistrationInviteErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PreRegistrationInviteError';
  }
}

export class PreRegistrationInvitePublicAccessError extends Error {
  constructor(message: string = PRE_REGISTRATION_INVITE_GENERIC_PUBLIC_ERROR) {
    super(message);
    this.name = 'PreRegistrationInvitePublicAccessError';
  }
}
