import { PrismaClient } from '@prisma/client';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { assertPreRegistrationClaimRoleEligibility } from '../src/modules/pre-registration-public/pre-registration-claim-role.guard.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('public pre-registration claim role eligibility', () => {
  const suffix = `issue271-role-${Date.now()}`;
  let contractId: string;

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271c`,
        name: 'Academia Claim Role Issue 271',
      },
    });
    contractId = contract.id;
  });

  afterAll(async () => {
    if (contractId) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function createInvite(label: string, birthDate: string) {
    const token = `${suffix}-${label}-token`;
    const aluno = await prisma.aluno.create({
      data: {
        contractId,
        status: 'INVITED',
        onboarding: { create: { contractId } },
        preRegistrationInvites: {
          create: {
            contractId,
            tokenHash: hashInviteToken(token),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        },
      },
    });
    await upsertStudentIdentity(
      aluno.id,
      contractId,
      { name: `Pessoa ${label}`, birthDate },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_claim_role_test',
      }
    );
    return { alunoId: aluno.id, token };
  }

  it('requires the guardian role for a minor without an active guardian authorization', async () => {
    const invited = await createInvite('Menor', '2012-03-01');

    await expect(
      assertPreRegistrationClaimRoleEligibility(invited.token, 'STUDENT')
    ).rejects.toMatchObject({
      code: 'GUARDIAN_AUTHORIZATION_REQUIRED',
      details: { recommendedRole: 'GUARDIAN' },
    });

    await expect(
      assertPreRegistrationClaimRoleEligibility(invited.token, 'GUARDIAN')
    ).resolves.toBeUndefined();
  });

  it('keeps self-claim available for an adult', async () => {
    const invited = await createInvite('Adulto', '1990-03-01');

    await expect(
      assertPreRegistrationClaimRoleEligibility(invited.token, 'STUDENT')
    ).resolves.toBeUndefined();
  });
});