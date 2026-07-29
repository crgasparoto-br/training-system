import type { InviteCopyState } from './PreRegistrationInviteCard';

export type PreRegistrationInviteHandoff = {
  generatedInviteUrl: string;
  inviteCopyState: Exclude<InviteCopyState, 'idle'>;
};

const pendingByLeadId = new Map<string, PreRegistrationInviteHandoff>();

/**
 * Keeps the one-time raw invite only in the current JavaScript runtime while
 * React Router changes screens. It is intentionally not written to URL,
 * localStorage or sessionStorage and disappears on reload/navigation away.
 */
export function rememberPreRegistrationInviteHandoff(
  leadId: string,
  handoff: PreRegistrationInviteHandoff
): void {
  pendingByLeadId.set(leadId, handoff);
}

export function peekPreRegistrationInviteHandoff(
  leadId: string
): PreRegistrationInviteHandoff | null {
  return pendingByLeadId.get(leadId) || null;
}

export function clearPreRegistrationInviteHandoff(leadId: string): void {
  pendingByLeadId.delete(leadId);
}
