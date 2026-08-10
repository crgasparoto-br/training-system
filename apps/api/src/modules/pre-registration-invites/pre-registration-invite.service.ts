import { preRegistrationInviteAdminService } from './pre-registration-invite-admin.service.js';
import {
  PreRegistrationInviteError,
  PreRegistrationInvitePublicAccessError,
} from './pre-registration-invite-errors.js';
import { preRegistrationInvitePublicService } from './pre-registration-invite-public.service.js';

export { PreRegistrationInviteError, PreRegistrationInvitePublicAccessError };

export const preRegistrationInviteService = {
  ...preRegistrationInviteAdminService,
  ...preRegistrationInvitePublicService,
};
