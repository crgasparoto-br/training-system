import { PrismaClient } from '@prisma/client';
import {
  normalizeLeadEmail,
  normalizeLeadPhone,
  normalizeLeadCpf,
  deriveAgeFromBirthDate,
  assertValidStudentLifecycleTransition,
  findMissingPreRegistrationFields,
  createStudentLead,
  claimAccountForStudentLead,
  recordStudentInvitationCreated,
  startStudentPreRegistration,
  discardStudentLead,
  reopenDiscardedStudentLead,
  completeStudentPreRegistration,
  markStudentReadyForEnrollment,
  activateStudentEnrollment,
  legacyDirectActiveStudentCreationFields,
  recordStudentOnboardingProgress,
  StudentLifecycleError,
} from './student-lifecycle.service.js';
import { loadStudentIdentity } from './student-identity.service.js';

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('student-lifecycle normalization', () => {
  it('normaliza e-mail, telefone e CPF em uma única fronteira', () => {
    expect(normalizeLeadEmail('  Fulano@Exemplo.COM ')).toBe('fulano@exemplo.com');
    expect(normalizeLeadPhone('(11) 98888-7777')).toBe('11988887777');
    expect(normalizeLeadCpf('123.456.789-00')).toBe('12345678900');
  });

  it('deriva idade sem fabricar valor persistido', () => {
    expect(deriveAgeFromBirthDate(new Date('2000-06-15'), new Date('2026-06-14'))).toBe(25);
    expect(deriveAgeFromBirthDate(new Date('2000-06-15'), new Date('2026-06-15'))).toBe(26);
  });
});

describe('legacyDirectActiveStudentCreationFields', () => {
  it('centraliza a decisão de status do cadastro administrativo completo', () => {
    const fields = legacyDirectActiveStudentCreationFields();
    expect(fields.status).toBe('ACTIVE_STUDENT');
    expect(fields.activatedAt).toBeInstanceOf(Date);
  });
});

describe('student-lifecycle transitions', () => {
  it('aceita somente a matriz pública de transições', () => {
    expect(() => assertValidStudentLifecycleTransition('LEAD', 'INVITED')).not.toThrow();
    expect(() =>
      assertValidStudentLifecycleTransition('INVITED', 'PRE_REGISTRATION_IN_PROGRESS')
    ).not.toThrow();
    expect(() =>
      assertValidStudentLifecycleTransition(
        'PRE_REGISTRATION_IN_PROGRESS',
        'PRE_REGISTRATION_COMPLETED'
      )
    ).not.toThrow();
    expect(() =>
      assertValidStudentLifecycleTransition(
        'PRE_REGISTRATION_COMPLETED',
        'READY_FOR_ENROLLMENT'
      )
    ).not.toThrow();
    expect(() =>
      assertValidStudentLifecycleTransition('READY_FOR_ENROLLMENT', 'ACTIVE_STUDENT')
    ).not.toThrow();
    expect(() => assertValidStudentLifecycleTransition('DISCARDED', 'LEAD')).not.toThrow();

    expect(() => assertValidStudentLifecycleTransition('LEAD', 'ACTIVE_STUDENT')).toThrow(
      StudentLifecycleError
    );
    expect(() => assertValidStudentLifecycleTransition('ACTIVE_STUDENT', 'LEAD')).toThrow(
      StudentLifecycleError
    );
  });
});

describe('student-lifecycle stage requirements', () => {
  it('mantém a mesma definição compartilhada de campos mínimos', () => {
    expect(findMissingPreRegistrationFields({})).toEqual(
      expect.arrayContaining([
        'name',
        'birthDate',
        'phone',
        'privacyNoticeVersion',
        'privacyAcceptedAt',
      ])
    );

    expect(
      findMissingPreRegistrationFields({
        name: 'Maria',
        birthDate: new Date('2000-01-01'),
        email: 'maria@example.com',
        privacyNoticeVersion: 'v1',
        privacyAcceptedAt: new Date(),
      })
    ).toContain('phone');
  });
});

const RUN_DB_TESTS = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDb = RUN_DB_TESTS ? describe : describe.skip;

describeDb('student-lifecycle integration (banco real)', () => {
  const prisma = new PrismaClient();
  const createdContractIds: string[] = [];
  const createdUserIds: string[] = [];
  let contractId: string;
  let professorId: string;

  const createContract = async (withProfessor = false) => {
    const suffix = unique();
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `lifecycle-${suffix}`,
        name: `Contrato lifecycle ${suffix}`,
      },
    });
    createdContractIds.push(contract.id);

    if (!withProfessor) return { contractId: contract.id };

    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId: contract.id,
        name: 'Professor teste',
        code: `PROF-${suffix}`,
      },
    });
    const professorUser = await prisma.user.create({
      data: {
        email: `professor-${suffix}@example.com`,
        passwordHash: 'x',
        type: 'professor',
        profile: { create: { name: 'Professor Lifecycle' } },
      },
    });
    createdUserIds.push(professorUser.id);
    const professor = await prisma.professor.create({
      data: {
        userId: professorUser.id,
        contractId: contract.id,
        collaboratorFunctionId: collaboratorFunction.id,
      },
    });
    return { contractId: contract.id, professorId: professor.id };
  };

  const createMatchingStudentAccount = async (
    name: string,
    phone: string,
    birthDate?: Date,
    email?: string
  ) => {
    const suffix = unique();
    const user = await prisma.user.create({
      data: {
        email: email ?? `student-${suffix}@example.com`,
        passwordHash: 'x',
        type: 'aluno',
        profile: {
          create: { name, phone, birthDate },
        },
      },
    });
    createdUserIds.push(user.id);
    return user;
  };

  const prepareInProgressLead = async (input: {
    contractId?: string;
    professorId?: string;
    name: string;
    phone: string;
    userId?: string;
  }) => {
    const scopedContractId = input.contractId ?? contractId;
    const scopedProfessorId = input.professorId ?? professorId;
    const lead = await createStudentLead({
      contractId: scopedContractId,
      name: input.name,
      phone: input.phone,
      origin: 'test-suite',
      createdByProfessorId: scopedProfessorId,
    });
    await recordStudentInvitationCreated(lead.id, scopedContractId, {
      invitationId: `invite-${unique()}`,
      actor: { professorId: scopedProfessorId },
    });
    const account = input.userId
      ? { id: input.userId }
      : await createMatchingStudentAccount(input.name, input.phone);
    await claimAccountForStudentLead(lead.id, scopedContractId, account.id);
    await startStudentPreRegistration(lead.id, scopedContractId, account.id);
    return { lead, userId: account.id };
  };

  beforeAll(async () => {
    const primary = await createContract(true);
    contractId = primary.contractId;
    professorId = primary.professorId!;
  });

  afterAll(async () => {
    for (const id of [...createdContractIds].reverse()) {
      await prisma.companyContract.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of [...createdUserIds].reverse()) {
      await prisma.user.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('cria lead com telefone sem conta, senha, professor ou idade artificial', async () => {
    const aluno = await createStudentLead({
      contractId,
      name: 'Lead Telefone',
      phone: '(11) 90000-0001',
      origin: 'landing-page',
    });

    expect(aluno.userId).toBeNull();
    expect(aluno.professorId).toBeNull();
    expect(aluno.age).toBeNull();
    expect(aluno.status).toBe('LEAD');
    expect(aluno.leadPhoneNormalized).toBe('11900000001');

    const identity = await loadStudentIdentity(aluno.id, contractId);
    expect(identity.name).toBe('Lead Telefone');
    expect(identity.phone).toBe('(11) 90000-0001');
  });

  it('permite telefone/e-mail repetidos para revisão, mas bloqueia CPF dentro do tenant', async () => {
    await createStudentLead({
      contractId,
      name: 'Contato compartilhado A',
      phone: '11955554444',
      origin: 'test-suite',
    });
    await expect(
      createStudentLead({
        contractId,
        name: 'Contato compartilhado B',
        phone: '11955554444',
        origin: 'test-suite',
      })
    ).resolves.toBeTruthy();

    const first = await prepareInProgressLead({
      name: 'CPF A',
      phone: '11910000001',
    });
    await completeStudentPreRegistration(first.lead.id, contractId, {
      name: 'CPF A',
      phone: '11910000001',
      cpf: '123.456.789-01',
      birthDate: '1990-01-01',
      privacyNoticeVersion: 'v1',
      privacyAcceptedAt: new Date(),
    }, first.userId);

    const second = await prepareInProgressLead({
      name: 'CPF B',
      phone: '11910000002',
    });
    await expect(
      completeStudentPreRegistration(second.lead.id, contractId, {
        name: 'CPF B',
        phone: '11910000002',
        cpf: '123.456.789-01',
        birthDate: '1991-01-01',
        privacyNoticeVersion: 'v1',
        privacyAcceptedAt: new Date(),
      }, second.userId)
    ).rejects.toMatchObject({ code: 'IDENTIFIER_CONFLICT' });
  });

  it('permite o mesmo CPF em contratos diferentes, inclusive nas projeções legadas', async () => {
    const other = await createContract(true);
    const cpf = '321.654.987-00';
    const first = await prepareInProgressLead({
      name: 'CPF Cross Tenant A',
      phone: '11910101010',
    });
    const second = await prepareInProgressLead({
      contractId: other.contractId,
      professorId: other.professorId,
      name: 'CPF Cross Tenant B',
      phone: '11920202020',
    });

    await completeStudentPreRegistration(
      first.lead.id,
      contractId,
      {
        name: 'CPF Cross Tenant A',
        phone: '11910101010',
        cpf,
        birthDate: '1990-01-01',
        privacyNoticeVersion: 'v1',
        privacyAcceptedAt: new Date(),
      },
      first.userId
    );
    await expect(
      completeStudentPreRegistration(
        second.lead.id,
        other.contractId,
        {
          name: 'CPF Cross Tenant B',
          phone: '11920202020',
          cpf,
          birthDate: '1991-01-01',
          privacyNoticeVersion: 'v1',
          privacyAcceptedAt: new Date(),
        },
        second.userId
      )
    ).resolves.toMatchObject({ id: second.lead.id });

    expect(
      await prisma.profile.count({
        where: { cpf },
      })
    ).toBe(2);
  });

  it('mantém o mesmo ID no fluxo completo e persiste identidade/consentimento canônicos', async () => {
    const prepared = await prepareInProgressLead({
      name: 'Ciclo Completo',
      phone: '11933332222',
    });
    const originalId = prepared.lead.id;

    const completed = await completeStudentPreRegistration(
      originalId,
      contractId,
      {
        name: 'Ciclo Completo',
        birthDate: '1995-05-05',
        phone: '11933332222',
        email: 'contato-ciclo@example.com',
        addressCity: 'Sorocaba',
        privacyNoticeVersion: 'v1',
        privacyAcceptedAt: new Date(),
      },
      prepared.userId
    );
    expect(completed.id).toBe(originalId);

    await markStudentReadyForEnrollment(originalId, contractId, {
      reviewReference: 'review-1',
      deduplicationReference: 'dedup-1',
      actor: { professorId },
    });
    const active = await activateStudentEnrollment(originalId, contractId, {
      activationReference: 'activation-1',
      actor: { professorId },
    });

    expect(active.id).toBe(originalId);
    expect(active.status).toBe('ACTIVE_STUDENT');
    const identity = await loadStudentIdentity(originalId, contractId);
    expect(identity.birthDate).toContain('1995-05-05');
    expect(identity.addressCity).toBe('Sorocaba');

    const onboarding = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: originalId },
    });
    expect(onboarding.startedAt).not.toBeNull();
    expect(onboarding.completedAt).not.toBeNull();
    expect(onboarding.reviewedAt).not.toBeNull();
    expect(onboarding.convertedAt).not.toBeNull();
    expect(onboarding.privacyNoticeVersion).toBe('v1');

    const events = await prisma.studentLifecycleEvent.findMany({
      where: { alunoId: originalId },
      select: { eventType: true },
    });
    const eventTypes = events.map((event) => event.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        'LEAD_CREATED',
        'ACCOUNT_LINKED',
        'PRIVACY_CONSENT_RECORDED',
        'PRE_REGISTRATION_COMPLETED',
        'ADMIN_REVIEWED',
        'CONVERTED_TO_ACTIVE_STUDENT',
      ])
    );
  });

  it('não permite concluir, revisar ou ativar sem as pré-condições específicas', async () => {
    const lead = await createStudentLead({
      contractId,
      name: 'Sem convite',
      phone: '11911112222',
      origin: 'test-suite',
    });
    await expect(
      completeStudentPreRegistration(lead.id, contractId, {
        name: 'Sem convite',
        phone: '11911112222',
        birthDate: '1990-01-01',
        privacyNoticeVersion: 'v1',
        privacyAcceptedAt: new Date(),
      })
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    await expect(
      activateStudentEnrollment(lead.id, contractId, {
        activationReference: 'invalid',
        actor: { professorId },
      })
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('permite a mesma conta global em contratos diferentes e bloqueia repetição no mesmo contrato', async () => {
    const other = await createContract(false);
    const name = 'Conta Global';
    const phone = '11988887777';
    const account = await createMatchingStudentAccount(name, phone);

    const leadA = await createStudentLead({
      contractId,
      name,
      phone,
      origin: 'test-suite',
    });
    const leadB = await createStudentLead({
      contractId: other.contractId,
      name,
      phone,
      origin: 'test-suite',
    });
    await claimAccountForStudentLead(leadA.id, contractId, account.id);
    await claimAccountForStudentLead(leadB.id, other.contractId, account.id);

    expect(
      await prisma.aluno.count({ where: { userId: account.id } })
    ).toBe(2);

    const secondInSameTenant = await createStudentLead({
      contractId,
      name,
      phone,
      origin: 'test-suite',
    });
    await expect(
      claimAccountForStudentLead(secondInSameTenant.id, contractId, account.id)
    ).rejects.toMatchObject({ code: 'ACCOUNT_CONTRACT_CONFLICT' });
  });

  it('não confunde e-mail de contato tenant-scoped com e-mail global de login', async () => {
    const name = 'Contato Diferente';
    const phone = '11988886666';
    const lead = await createStudentLead({
      contractId,
      name,
      phone,
      email: 'contato.operacional@example.com',
      origin: 'test-suite',
    });
    const account = await createMatchingStudentAccount(name, phone);

    await expect(
      claimAccountForStudentLead(lead.id, contractId, account.id)
    ).resolves.toMatchObject({ userId: account.id });
  });

  it('não sobrescreve Profile global quando a conta possui múltiplos tenants', async () => {
    const other = await createContract(false);
    const name = 'Conta Compartilhada';
    const phone = '11933334444';
    const account = await createMatchingStudentAccount(name, phone);

    const first = await createStudentLead({ contractId, name, phone, origin: 'test-suite' });
    const second = await createStudentLead({
      contractId: other.contractId,
      name,
      phone,
      origin: 'test-suite',
    });
    await claimAccountForStudentLead(first.id, contractId, account.id);
    await claimAccountForStudentLead(second.id, other.contractId, account.id);
    await recordStudentInvitationCreated(second.id, other.contractId, {
      invitationId: `invite-${unique()}`,
      actor: {},
    });
    await startStudentPreRegistration(second.id, other.contractId, account.id);

    await completeStudentPreRegistration(
      second.id,
      other.contractId,
      {
        name: 'Nome Tenant Dois',
        phone: '11999990000',
        cpf: '987.654.321-00',
        birthDate: '1992-02-02',
        privacyNoticeVersion: 'v1',
        privacyAcceptedAt: new Date(),
      },
      account.id
    );

    const globalProfile = await prisma.profile.findUniqueOrThrow({
      where: { userId: account.id },
    });
    expect(globalProfile.name).toBe(name);
    expect(globalProfile.phone).toBe(phone);
    expect(globalProfile.cpf).toBeNull();

    const tenantIdentity = await loadStudentIdentity(second.id, other.contractId);
    expect(tenantIdentity.name).toBe('Nome Tenant Dois');
    expect(tenantIdentity.phone).toBe('11999990000');
    expect(tenantIdentity.cpf).toBe('987.654.321-00');
  });

  it('claim concorrente não sobrescreve o vencedor e gera um único evento', async () => {
    const name = 'Claim Concorrente';
    const phone = '11977776666';
    const lead = await createStudentLead({ contractId, name, phone, origin: 'test-suite' });
    const accountA = await createMatchingStudentAccount(name, phone);
    const accountB = await createMatchingStudentAccount(name, phone);

    const results = await Promise.allSettled([
      claimAccountForStudentLead(lead.id, contractId, accountA.id),
      claimAccountForStudentLead(lead.id, contractId, accountB.id),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const persisted = await prisma.aluno.findUniqueOrThrow({ where: { id: lead.id } });
    expect([accountA.id, accountB.id]).toContain(persisted.userId);
    expect(
      await prisma.studentLifecycleEvent.count({
        where: { alunoId: lead.id, eventType: 'ACCOUNT_LINKED' },
      })
    ).toBe(1);
  });

  it('rejeita claim com identidade divergente sem vincular silenciosamente', async () => {
    const lead = await createStudentLead({
      contractId,
      name: 'Pessoa Correta',
      phone: '11966665555',
      origin: 'test-suite',
    });
    const account = await createMatchingStudentAccount('Outra Pessoa', '11900000000');

    await expect(
      claimAccountForStudentLead(lead.id, contractId, account.id)
    ).rejects.toMatchObject({ code: 'ACCOUNT_DATA_MISMATCH' });
    expect(
      (await prisma.aluno.findUniqueOrThrow({ where: { id: lead.id } })).userId
    ).toBeNull();
  });

  it('tentativa cross-tenant de conclusão não grava consentimento nem identidade', async () => {
    const other = await createContract(false);
    const prepared = await prepareInProgressLead({
      name: 'Cross Tenant',
      phone: '11955550000',
    });
    const before = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: prepared.lead.id },
    });
    const identityBefore = await loadStudentIdentity(prepared.lead.id, contractId);

    await expect(
      completeStudentPreRegistration(
        prepared.lead.id,
        other.contractId,
        {
          name: 'Alterado indevidamente',
          phone: '11999999999',
          birthDate: '1980-01-01',
          privacyNoticeVersion: 'evil',
          privacyAcceptedAt: new Date(),
        },
        prepared.userId
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const after = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: prepared.lead.id },
    });
    const identityAfter = await loadStudentIdentity(prepared.lead.id, contractId);
    expect(after.privacyNoticeVersion).toBe(before.privacyNoticeVersion);
    expect(after.privacyAcceptedAt).toEqual(before.privacyAcceptedAt);
    expect(identityAfter).toEqual(identityBefore);
  });

  it('descarta e reabre somente com motivo e ator auditável', async () => {
    const lead = await createStudentLead({
      contractId,
      name: 'Descarte',
      phone: '11900002222',
      origin: 'test-suite',
    });

    await expect(discardStudentLead(lead.id, contractId, '', professorId)).rejects.toThrow(
      StudentLifecycleError
    );
    expect(
      (await discardStudentLead(lead.id, contractId, 'Sem interesse', professorId)).status
    ).toBe('DISCARDED');
    expect(
      (await reopenDiscardedStudentLead(
        lead.id,
        contractId,
        'Contato retomado',
        professorId
      )).status
    ).toBe('LEAD');
  });

  it('registra progresso incremental tenant-scoped sem mudar estado', async () => {
    const lead = await createStudentLead({
      contractId,
      name: 'Progresso Incremental',
      phone: '11900004444',
      origin: 'test-suite',
    });
    await recordStudentOnboardingProgress(lead.id, contractId, {
      formVersion: 'v2',
      privacyNoticeVersion: 'v1',
    });
    const onboarding = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: lead.id },
    });
    expect(onboarding.formVersion).toBe('v2');
    expect(onboarding.lastSavedAt).not.toBeNull();
    expect(
      (await prisma.aluno.findUniqueOrThrow({ where: { id: lead.id } })).status
    ).toBe('LEAD');
  });
});
