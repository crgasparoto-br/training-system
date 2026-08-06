import { PrismaClient } from '@prisma/client';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import {
  PreRegistrationPublicError,
  preRegistrationPublicService,
} from '../src/modules/pre-registration-public/pre-registration-public.service.js';
import { preRegistrationPublicAtomicService } from '../src/modules/pre-registration-public/pre-registration-public-atomic.service.js';
import { hashInviteToken } from '../src/modules/pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;

type CreatedInvite = {
  alunoId: string;
  token: string;
};

describeDatabase('public pre-registration integration', () => {
  const suffix = `issue271-${Date.now()}`;
  let contractId: string;
  let validatorUserId: string;
  const createdUserIds: string[] = [];
  const createdContractIds: string[] = [];

  async function createUser(input: {
    label: string;
    name: string;
    email?: string;
    phone?: string;
    cpf?: string;
    birthDate?: Date;
  }) {
    const user = await prisma.user.create({
      data: {
        email: input.email || `${suffix}-${input.label}@example.com`,
        passwordHash: 'integration-test-hash',
        type: 'aluno',
        profile: {
          create: {
            name: input.name,
            phone: input.phone,
            cpf: input.cpf,
            birthDate: input.birthDate,
          },
        },
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createInvitedAluno(input: {
    label: string;
    name: string;
    email?: string;
    phone?: string;
    cpf?: string;
    birthDate: string;
    contract?: string;
  }): Promise<CreatedInvite> {
    const token = `${suffix}-${input.label}-token`;
    const targetContractId = input.contract || contractId;
    const aluno = await prisma.aluno.create({
      data: {
        contractId: targetContractId,
        status: 'INVITED',
        leadName: input.name,
        onboarding: { create: { contractId: targetContractId } },
        preRegistrationInvites: {
          create: {
            contractId: targetContractId,
            tokenHash: hashInviteToken(token),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        },
      },
    });
    await upsertStudentIdentity(
      aluno.id,
      targetContractId,
      {
        name: input.name,
        email: input.email,
        phone: input.phone,
        cpf: input.cpf,
        birthDate: input.birthDate,
      },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_test_fixture',
      }
    );
    return { alunoId: aluno.id, token };
  }

  async function approveGuardianAuthorization(
    alunoId: string,
    guardianUserId: string
  ) {
    const changed = await prisma.preRegistrationGuardianAuthorization.updateMany({
      where: {
        alunoId,
        contractId,
        guardianUserId,
        status: 'PENDING',
        relationship: { not: null },
      },
      data: {
        status: 'ACTIVE',
        validatedAt: new Date(),
        validatedByUserId: validatorUserId,
      },
    });
    expect(changed.count).toBe(1);
  }

  async function requestAndApproveGuardian(
    guardianUserId: string,
    alunoId: string,
    relationship: string
  ) {
    const request = await preRegistrationPublicService.requestGuardianAuthorization(
      guardianUserId,
      alunoId,
      { relationship, declarationAccepted: true }
    );
    expect(request).toMatchObject({
      status: 'PENDING',
      relationship,
      approvalRequired: true,
    });
    await approveGuardianAuthorization(alunoId, guardianUserId);
    return preRegistrationPublicService.getSession(guardianUserId, alunoId);
  }

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271`,
        name: 'Academia Issue 271',
      },
    });
    contractId = contract.id;
    createdContractIds.push(contract.id);
    const validator = await createUser({
      label: 'guardian-validator',
      name: 'Validador da Academia',
    });
    validatorUserId = validator.id;
  });

  afterAll(async () => {
    for (const id of createdContractIds.reverse()) {
      await prisma.companyContract.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of createdUserIds.reverse()) {
      await prisma.user.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('keeps guardian access pending until an independent academy validation', async () => {
    const guardian = await createUser({
      label: 'guardian-pending',
      name: 'Responsável Pendente',
    });
    const invited = await createInvitedAluno({
      label: 'pending-minor',
      name: 'Nome Sensível do Menor',
      birthDate: '2012-05-10',
      cpf: '52998224725',
    });

    const claim = await preRegistrationPublicService.claim(guardian.id, {
      token: invited.token,
      role: 'GUARDIAN',
    });
    expect(claim.alunoId).toBe(invited.alunoId);

    const [aluno, authorization, processes] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: invited.alunoId } }),
      prisma.preRegistrationGuardianAuthorization.findFirstOrThrow({
        where: { alunoId: invited.alunoId, guardianUserId: guardian.id },
      }),
      preRegistrationPublicService.listProcesses(guardian.id),
    ]);

    expect(aluno.status).toBe('INVITED');
    expect(authorization.status).toBe('PENDING');
    expect(authorization.validatedAt).toBeNull();
    expect(processes).toEqual([
      expect.objectContaining({
        alunoId: invited.alunoId,
        displayName: 'Dependente convidado',
        guardianAuthorizationStatus: 'PENDING',
        requiresGuardianConfirmation: true,
      }),
    ]);
    await expect(
      preRegistrationPublicService.getSession(guardian.id, invited.alunoId)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' } satisfies Partial<PreRegistrationPublicError>);

    const request = await preRegistrationPublicService.requestGuardianAuthorization(
      guardian.id,
      invited.alunoId,
      { relationship: 'Mãe', declarationAccepted: true }
    );
    expect(request).toMatchObject({
      status: 'PENDING',
      relationship: 'Mãe',
      approvalRequired: true,
    });
    const pending = await prisma.preRegistrationGuardianAuthorization.findFirstOrThrow({
      where: { alunoId: invited.alunoId, guardianUserId: guardian.id },
    });
    expect(pending.validatedAt).toBeNull();
    expect(pending.validatedByUserId).toBeNull();
    await expect(
      preRegistrationPublicService.getSession(guardian.id, invited.alunoId)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const unrelated = await createUser({
      label: 'unrelated-guardian',
      name: 'Pessoa Não Vinculada',
    });
    await expect(
      preRegistrationPublicService.requestGuardianAuthorization(
        unrelated.id,
        invited.alunoId,
        { relationship: 'Pai', declarationAccepted: true }
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await approveGuardianAuthorization(invited.alunoId, guardian.id);
    const session = await preRegistrationPublicService.getSession(guardian.id, invited.alunoId);
    expect(session.identity.name).toBe('Nome Sensível do Menor');
    expect(session.guardianAuthorization).toMatchObject({
      status: 'ACTIVE',
      relationship: 'Mãe',
    });

    const saved = await preRegistrationPublicService.saveStep(
      guardian.id,
      invited.alunoId,
      {
        expectedVersion: session.version,
        step: 'IDENTIFICATION',
        data: {
          name: 'Nome Sensível do Menor',
          birthDate: '2012-05-10',
          cpf: '52998224725',
        },
      }
    );
    expect(saved.status).toBe('PRE_REGISTRATION_IN_PROGRESS');
  });

  it('allows one guardian to select and resume each linked dependent explicitly', async () => {
    const guardian = await createUser({
      label: 'guardian-multiple',
      name: 'Responsável Múltiplo',
    });
    const first = await createInvitedAluno({
      label: 'dependent-one',
      name: 'Dependente Um',
      birthDate: '2013-01-01',
      cpf: '11144477735',
    });
    const second = await createInvitedAluno({
      label: 'dependent-two',
      name: 'Dependente Dois',
      birthDate: '2014-02-02',
      cpf: '12345678909',
    });

    for (const invited of [first, second]) {
      await preRegistrationPublicService.claim(guardian.id, {
        token: invited.token,
        role: 'GUARDIAN',
      });
      await requestAndApproveGuardian(guardian.id, invited.alunoId, 'Pai');
    }

    const processes = await preRegistrationPublicService.listProcesses(guardian.id);
    expect(processes.map((item) => item.alunoId).sort()).toEqual(
      [first.alunoId, second.alunoId].sort()
    );

    const [firstSession, secondSession] = await Promise.all([
      preRegistrationPublicService.getSession(guardian.id, first.alunoId),
      preRegistrationPublicService.getSession(guardian.id, second.alunoId),
    ]);
    expect(firstSession.identity.name).toBe('Dependente Um');
    expect(secondSession.identity.name).toBe('Dependente Dois');
  });

  it('rejects every incompatible identity field instead of checking an unreachable email mismatch', async () => {
    const account = await createUser({
      label: 'incompatible-account',
      name: 'Outra Pessoa',
      email: `${suffix}-other-person@example.com`,
      phone: '15911112222',
      cpf: '98765432100',
      birthDate: new Date('1980-01-01T12:00:00.000Z'),
    });
    const invited = await createInvitedAluno({
      label: 'incompatible-student',
      name: 'Pessoa Convidada',
      email: `${suffix}-invited-person@example.com`,
      phone: '15999990000',
      cpf: '93541134780',
      birthDate: '1990-05-05',
    });

    await expect(
      preRegistrationPublicService.claim(account.id, {
        token: invited.token,
        role: 'STUDENT',
      })
    ).rejects.toMatchObject({
      code: 'ACCOUNT_INCOMPATIBLE',
      details: {
        fields: expect.arrayContaining(['name', 'phone', 'cpf', 'birthDate', 'email']),
      },
    } satisfies Partial<PreRegistrationPublicError>);

    const aluno = await prisma.aluno.findUniqueOrThrow({ where: { id: invited.alunoId } });
    expect(aluno.userId).toBeNull();
  });

  it('rejects guardian claims for adults and does not create an authorization', async () => {
    const guardian = await createUser({
      label: 'guardian-adult',
      name: 'Responsável Indevido',
    });
    const invited = await createInvitedAluno({
      label: 'adult-invite',
      name: 'Aluno Adulto',
      birthDate: '1985-03-10',
      cpf: '39053344705',
    });

    await expect(
      preRegistrationPublicService.claim(guardian.id, {
        token: invited.token,
        role: 'GUARDIAN',
      })
    ).rejects.toMatchObject({ code: 'ACCOUNT_INCOMPATIBLE' });

    expect(
      await prisma.preRegistrationGuardianAuthorization.count({
        where: { alunoId: invited.alunoId },
      })
    ).toBe(0);
  });

  it('invalidates a stale public form after an administrative canonical identity edit', async () => {
    const email = `${suffix}-compatible-student@example.com`;
    const account = await createUser({
      label: 'compatible-student',
      name: 'Aluno Compatível',
      email,
    });
    const invited = await createInvitedAluno({
      label: 'identity-concurrency',
      name: 'Aluno Compatível',
      email,
      phone: '15999990000',
      cpf: '16899535009',
      birthDate: '1992-06-15',
    });

    await preRegistrationPublicService.claim(account.id, {
      token: invited.token,
      role: 'STUDENT',
    });
    const initial = await preRegistrationPublicService.getSession(account.id, invited.alunoId);

    await upsertStudentIdentity(
      invited.alunoId,
      contractId,
      { phone: '15888880000' },
      {
        sourceType: 'professional',
        sourceReference: 'issue_271_admin_concurrency_test',
      }
    );

    const refreshed = await preRegistrationPublicService.getSession(account.id, invited.alunoId);
    expect(refreshed.version).toBe(initial.version + 1);
    expect(refreshed.identity.phone).toBe('15888880000');

    await expect(
      preRegistrationPublicService.saveStep(account.id, invited.alunoId, {
        expectedVersion: initial.version,
        step: 'CONTACT',
        data: { phone: '15777770000' },
      })
    ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });

    const afterConflict = await preRegistrationPublicService.getSession(account.id, invited.alunoId);
    expect(afterConflict.identity.phone).toBe('15888880000');
  });

  it('requires a normalized primary email before completion', async () => {
    const account = await createUser({
      label: 'missing-email-account',
      name: 'Aluno Sem Email de Contato',
    });
    const invited = await createInvitedAluno({
      label: 'missing-email-student',
      name: 'Aluno Sem Email de Contato',
      birthDate: '1991-02-03',
      cpf: '12345679034',
    });

    await preRegistrationPublicService.claim(account.id, {
      token: invited.token,
      role: 'STUDENT',
    });
    let session = await preRegistrationPublicService.getSession(account.id, invited.alunoId);
    session = await preRegistrationPublicService.saveStep(account.id, invited.alunoId, {
      expectedVersion: session.version,
      step: 'IDENTIFICATION',
      data: {
        name: 'Aluno Sem Email de Contato',
        birthDate: '1991-02-03',
        cpf: '12345679034',
      },
    });
    session = await preRegistrationPublicService.saveStep(account.id, invited.alunoId, {
      expectedVersion: session.version,
      step: 'CONTACT',
      data: { phone: '15999990000' },
    });

    await expect(
      preRegistrationPublicService.complete(account.id, invited.alunoId, {
        expectedVersion: session.version,
        privacyAccepted: true,
      })
    ).rejects.toMatchObject({
      code: 'MISSING_REQUIRED_FIELDS',
      details: { fields: expect.arrayContaining(['email']) },
    });
  });

  it('persists alternative phone and email in the canonical identity', async () => {
    const account = await createUser({
      label: 'alternative-contact-account',
      name: 'Aluno Contato Alternativo',
    });
    const invited = await createInvitedAluno({
      label: 'alternative-contact-student',
      name: 'Aluno Contato Alternativo',
      birthDate: '1990-04-05',
    });

    await preRegistrationPublicService.claim(account.id, {
      token: invited.token,
      role: 'STUDENT',
    });
    const initial = await preRegistrationPublicService.getSession(account.id, invited.alunoId);
    const saved = await preRegistrationPublicService.saveStep(account.id, invited.alunoId, {
      expectedVersion: initial.version,
      step: 'CONTACT',
      data: {
        phone: '15999990000',
        email: `${suffix}-main-contact@example.com`,
        additionalPhone: '15888880000',
        additionalEmail: `${suffix}-alternative-contact@example.com`,
      },
    });

    expect(saved.identity).toMatchObject({
      additionalPhone: '15888880000',
      additionalEmail: `${suffix}-alternative-contact@example.com`,
    });
  });

  it('redirects a compatible account already linked to an active student instead of starting another cycle', async () => {
    const account = await createUser({
      label: 'active-student-account',
      name: 'Aluno Já Ativo',
    });
    await prisma.aluno.create({
      data: {
        contractId,
        status: 'ACTIVE_STUDENT',
        userId: account.id,
      },
    });
    const invited = await createInvitedAluno({
      label: 'active-student-new-invite',
      name: 'Aluno Já Ativo',
      birthDate: '1988-07-08',
    });

    await expect(
      preRegistrationPublicService.claim(account.id, {
        token: invited.token,
        role: 'STUDENT',
      })
    ).rejects.toMatchObject({
      code: 'ACTIVE_STUDENT',
      details: { redirectTo: '/inicio' },
    });
  });

  it('completes consent and invite atomically, emits one completion event and supports retry', async () => {
    const guardian = await createUser({
      label: 'guardian-completion',
      name: 'Responsável Conclusão',
    });
    const invited = await createInvitedAluno({
      label: 'completion-minor',
      name: 'Dependente Conclusão',
      birthDate: '2011-08-20',
      cpf: '86288366757',
    });

    await preRegistrationPublicService.claim(guardian.id, {
      token: invited.token,
      role: 'GUARDIAN',
    });
    let session = await requestAndApproveGuardian(
      guardian.id,
      invited.alunoId,
      'Mãe'
    );
    session = await preRegistrationPublicService.saveStep(
      guardian.id,
      invited.alunoId,
      {
        expectedVersion: session.version,
        step: 'IDENTIFICATION',
        data: {
          name: 'Dependente Conclusão',
          birthDate: '2011-08-20',
          cpf: '86288366757',
        },
      }
    );
    session = await preRegistrationPublicService.saveStep(
      guardian.id,
      invited.alunoId,
      {
        expectedVersion: session.version,
        step: 'CONTACT',
        data: {
          phone: '15955554444',
          email: `${suffix}-dependent-completion@example.com`,
        },
      }
    );
    session = await preRegistrationPublicService.saveStep(
      guardian.id,
      invited.alunoId,
      {
        expectedVersion: session.version,
        step: 'GUARDIAN',
        data: {
          guardianName: 'Responsável Conclusão',
          guardianCpf: '71428793860',
          guardianPhone: '15944443333',
          guardianEmail: `${suffix}-guardian-completion@example.com`,
        },
      }
    );

    const completed = await preRegistrationPublicService.complete(
      guardian.id,
      invited.alunoId,
      { expectedVersion: session.version, privacyAccepted: true },
      { ipAddress: '127.0.0.1', userAgent: 'issue-271-integration-test' }
    );
    expect(completed.status).toBe('PRE_REGISTRATION_COMPLETED');
    expect(completed.privacy.acceptedAt).toBeTruthy();
    expect(completed.nextSteps.every((step) => Boolean(step.href))).toBe(true);

    // The public routes actually serve /processes/:alunoId/complete and
    // /processes/:alunoId/session through the atomic service, not through
    // preRegistrationPublicService above. Both build the nextSteps hrefs
    // independently, so assert the atomic-service copy here too: it drifted
    // once already and dropped ?alunoId=, which silently broke the "open
    // Anamnese/PAR-Q" links after a lead completed pre-registration.
    const atomicSession = await preRegistrationPublicAtomicService.getSession(
      guardian.id,
      invited.alunoId
    );
    for (const step of atomicSession.nextSteps) {
      expect(step.href).toContain(`alunoId=${invited.alunoId}`);
    }

    const retried = await preRegistrationPublicService.complete(
      guardian.id,
      invited.alunoId,
      { expectedVersion: session.version, privacyAccepted: true },
      { ipAddress: '127.0.0.1', userAgent: 'issue-271-integration-test-retry' }
    );
    expect(retried.status).toBe('PRE_REGISTRATION_COMPLETED');

    const [completionEvents, inviteEvents, invite] = await Promise.all([
      prisma.studentLifecycleEvent.count({
        where: {
          alunoId: invited.alunoId,
          eventType: 'PRE_REGISTRATION_COMPLETED',
        },
      }),
      prisma.preRegistrationInviteEvent.count({
        where: {
          invite: { alunoId: invited.alunoId },
          eventType: 'COMPLETED',
        },
      }),
      prisma.preRegistrationInvite.findUniqueOrThrow({
        where: { tokenHash: hashInviteToken(invited.token) },
      }),
    ]);
    expect(completionEvents).toBe(1);
    expect(inviteEvents).toBe(1);
    expect(invite.status).toBe('COMPLETED');
  });

  it('never resolves a guardian process across tenants', async () => {
    const otherContract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `${Date.now()}271b`,
        name: 'Academia Issue 271 - Outro Tenant',
      },
    });
    createdContractIds.push(otherContract.id);
    const guardian = await createUser({
      label: 'cross-tenant-guardian',
      name: 'Responsável Cross Tenant',
    });
    const home = await createInvitedAluno({
      label: 'cross-tenant-home',
      name: 'Mesmo Nome',
      birthDate: '2013-10-10',
      cpf: '07258169004',
    });
    const other = await createInvitedAluno({
      label: 'cross-tenant-other',
      name: 'Mesmo Nome',
      birthDate: '2013-10-10',
      cpf: '65455822006',
      contract: otherContract.id,
    });

    await preRegistrationPublicService.claim(guardian.id, {
      token: home.token,
      role: 'GUARDIAN',
    });
    await requestAndApproveGuardian(guardian.id, home.alunoId, 'Tutor');

    await expect(
      preRegistrationPublicService.getSession(guardian.id, other.alunoId)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const session = await preRegistrationPublicService.getSession(guardian.id, home.alunoId);
    expect(session.tenant.name).toBe('Academia Issue 271');
  });
});