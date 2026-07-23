import { PrismaClient } from '@prisma/client';
import type { PreRegistrationClaimRole } from '@corrida/types';
import { loadStudentIdentity } from '../alunos/student-identity.service.js';
import {
  hashInviteToken,
  timingSafeEqualHash,
} from '../pre-registration-invites/pre-registration-invite-token.js';
import { PreRegistrationPublicError } from './pre-registration-public.service.js';

const prisma = new PrismaClient();

function isMinorBirthDate(value?: string | Date | null, now = new Date()): boolean {
  if (!value) return false;
  const birthDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(birthDate.getTime())) return false;
  let age = now.getFullYear() - birthDate.getFullYear();
  const month = now.getMonth() - birthDate.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age < 18;
}

export async function assertPreRegistrationClaimRoleEligibility(
  token: string,
  role: PreRegistrationClaimRole
): Promise<void> {
  if (role !== 'STUDENT') return;

  const tokenHash = hashInviteToken(token);
  const invite = await prisma.preRegistrationInvite.findUnique({
    where: { tokenHash },
    select: {
      alunoId: true,
      contractId: true,
      tokenHash: true,
      status: true,
      expiresAt: true,
    },
  });
  if (
    !invite ||
    !timingSafeEqualHash(invite.tokenHash, tokenHash) ||
    invite.status !== 'ACTIVE' ||
    invite.expiresAt <= new Date()
  ) {
    return;
  }

  const identity = await loadStudentIdentity(invite.alunoId, invite.contractId);
  if (!isMinorBirthDate(identity.birthDate)) return;

  const activeGuardian = await prisma.preRegistrationGuardianAuthorization.findFirst({
    where: {
      alunoId: invite.alunoId,
      contractId: invite.contractId,
      purpose: 'PRE_REGISTRATION',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (activeGuardian) return;

  throw new PreRegistrationPublicError(
    'Este convite pertence a um menor de idade. Continue com a conta do responsável legal.',
    'GUARDIAN_AUTHORIZATION_REQUIRED',
    { recommendedRole: 'GUARDIAN' }
  );
}