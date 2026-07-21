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
  transitionStudentLifecycleStatus,
  discardStudentLead,
  reopenDiscardedStudentLead,
  completeStudentPreRegistration,
  legacyDirectActiveStudentCreationFields,
  StudentLifecycleError,
} from './student-lifecycle.service.js';

describe('student-lifecycle normalization', () => {
  it('normaliza e-mail para minusculo e sem espacos', () => {
    expect(normalizeLeadEmail('  Fulano@Exemplo.COM ')).toBe('fulano@exemplo.com');
    expect(normalizeLeadEmail(undefined)).toBeUndefined();
    expect(normalizeLeadEmail('')).toBeUndefined();
  });

  it('normaliza telefone para somente digitos', () => {
    expect(normalizeLeadPhone('(11) 98888-7777')).toBe('11988887777');
    expect(normalizeLeadPhone(null)).toBeUndefined();
  });

  it('normaliza cpf para somente digitos', () => {
    expect(normalizeLeadCpf('123.456.789-00')).toBe('12345678900');
    expect(normalizeLeadCpf(undefined)).toBeUndefined();
  });

  it('deriva idade sem persistir valor artificial', () => {
    expect(deriveAgeFromBirthDate(new Date('2000-06-15'), new Date('2026-06-14'))).toBe(25);
    expect(deriveAgeFromBirthDate(new Date('2000-06-15'), new Date('2026-06-15'))).toBe(26);
    expect(deriveAgeFromBirthDate(new Date('2000-06-15'), new Date('2026-06-16'))).toBe(26);
  });
});

describe('legacyDirectActiveStudentCreationFields', () => {
  it('centraliza a decisao de status/ativacao do fluxo de criacao legado', () => {
    const fields = legacyDirectActiveStudentCreationFields();
    expect(fields.status).toBe('ACTIVE_STUDENT');
    expect(fields.activatedAt).toBeInstanceOf(Date);
  });
});

describe('student-lifecycle transitions', () => {
  it('permite a matriz de transicoes documentada', () => {
    expect(() => assertValidStudentLifecycleTransition('LEAD', 'INVITED')).not.toThrow();
    expect(() => assertValidStudentLifecycleTransition('INVITED', 'PRE_REGISTRATION_IN_PROGRESS')).not.toThrow();
    expect(() =>
      assertValidStudentLifecycleTransition('PRE_REGISTRATION_IN_PROGRESS', 'PRE_REGISTRATION_COMPLETED')
    ).not.toThrow();
    expect(() =>
      assertValidStudentLifecycleTransition('PRE_REGISTRATION_COMPLETED', 'READY_FOR_ENROLLMENT')
    ).not.toThrow();
    expect(() => assertValidStudentLifecycleTransition('READY_FOR_ENROLLMENT', 'ACTIVE_STUDENT')).not.toThrow();
    expect(() => assertValidStudentLifecycleTransition('DISCARDED', 'LEAD')).not.toThrow();
  });

  it('rejeita transicoes fora da matriz', () => {
    expect(() => assertValidStudentLifecycleTransition('LEAD', 'ACTIVE_STUDENT')).toThrow(StudentLifecycleError);
    expect(() => assertValidStudentLifecycleTransition('ACTIVE_STUDENT', 'LEAD')).toThrow(StudentLifecycleError);
    expect(() => assertValidStudentLifecycleTransition('LEAD', 'PRE_REGISTRATION_COMPLETED')).toThrow(
      StudentLifecycleError
    );
  });

  it('DISCARDED so permite reabrir explicitamente para LEAD, nunca para estados posteriores', () => {
    expect(() => assertValidStudentLifecycleTransition('DISCARDED', 'ACTIVE_STUDENT')).toThrow(
      StudentLifecycleError
    );
    expect(() => assertValidStudentLifecycleTransition('DISCARDED', 'READY_FOR_ENROLLMENT')).toThrow(
      StudentLifecycleError
    );
  });
});

describe('student-lifecycle stage requirements', () => {
  it('aponta campos ausentes para concluir o pre-cadastro', () => {
    const missing = findMissingPreRegistrationFields({});
    expect(missing).toEqual(
      expect.arrayContaining(['name', 'birthDate', 'phone_or_email', 'privacyNoticeVersion', 'privacyAcceptedAt'])
    );
  });

  it('aceita quando telefone OU e-mail estao presentes', () => {
    const missingWithPhone = findMissingPreRegistrationFields({
      name: 'Maria',
      birthDate: new Date('2000-01-01'),
      phone: '11988887777',
      privacyNoticeVersion: 'v1',
      privacyAcceptedAt: new Date(),
    });
    expect(missingWithPhone).toEqual([]);

    const missingWithEmail = findMissingPreRegistrationFields({
      name: 'Maria',
      birthDate: new Date('2000-01-01'),
      email: 'maria@example.com',
      privacyNoticeVersion: 'v1',
      privacyAcceptedAt: new Date(),
    });
    expect(missingWithEmail).toEqual([]);
  });
});

const RUN_DB_TESTS = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDb = RUN_DB_TESTS ? describe : describe.skip;

describeDb('student-lifecycle integration (banco real)', () => {
  const prisma = new PrismaClient();
  let contractId: string;
  let professorId: string;
  let professorUserId: string;
  let collaboratorFunctionId: string;

  beforeAll(async () => {
    const contract = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `test-doc-${Date.now()}`,
        name: 'Contrato de teste - lifecycle',
      },
    });
    contractId = contract.id;

    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: { contractId, name: 'Professor teste', code: `PROF-TEST-${Date.now()}` },
    });
    collaboratorFunctionId = collaboratorFunction.id;

    const professorUser = await prisma.user.create({
      data: { email: `professor-lifecycle-${Date.now()}@example.com`, passwordHash: 'x', type: 'professor' },
    });
    professorUserId = professorUser.id;

    const professor = await prisma.professor.create({
      data: { userId: professorUserId, contractId, collaboratorFunctionId },
    });
    professorId = professor.id;
  });

  afterAll(async () => {
    await prisma.studentLifecycleEvent.deleteMany({ where: { contractId } });
    await prisma.studentOnboardingProcess.deleteMany({ where: { contractId } });
    await prisma.aluno.deleteMany({ where: { contractId } });
    await prisma.professor.delete({ where: { id: professorId } });
    await prisma.user.delete({ where: { id: professorUserId } });
    await prisma.collaboratorFunctionOption.delete({ where: { id: collaboratorFunctionId } });
    await prisma.companyContract.delete({ where: { id: contractId } });
    await prisma.$disconnect();
  });

  it('cria lead somente com nome e telefone, sem User/senha/professor/idade', async () => {
    const aluno = await createStudentLead({
      contractId,
      name: 'Lead Telefone',
      phone: '(11) 90000-0001',
      origin: 'landing-page',
    });

    expect(aluno.id).toBeTruthy();
    expect(aluno.userId).toBeNull();
    expect(aluno.professorId).toBeNull();
    expect(aluno.age).toBeNull();
    expect(aluno.status).toBe('LEAD');
    expect(aluno.leadPhoneNormalized).toBe('11900000001');

    const onboarding = await prisma.studentOnboardingProcess.findUnique({ where: { alunoId: aluno.id } });
    expect(onboarding).not.toBeNull();

    const events = await prisma.studentLifecycleEvent.findMany({ where: { alunoId: aluno.id } });
    expect(events.map((e) => e.eventType)).toContain('LEAD_CREATED');
  });

  it('cria lead somente com nome e e-mail', async () => {
    const aluno = await createStudentLead({
      contractId,
      name: 'Lead Email',
      email: 'Lead.Email@Example.com',
      origin: 'landing-page',
    });
    expect(aluno.leadEmailNormalized).toBe('lead.email@example.com');
  });

  it('rejeita lead sem telefone e sem e-mail', async () => {
    await expect(
      createStudentLead({ contractId, name: 'Sem contato', origin: 'landing-page' })
    ).rejects.toThrow(StudentLifecycleError);
  });

  it('rejeita duplicidade do mesmo identificador no mesmo contrato', async () => {
    await createStudentLead({ contractId, name: 'Duplicado 1', phone: '11955554444', origin: 'landing-page' });
    await expect(
      createStudentLead({ contractId, name: 'Duplicado 2', phone: '11955554444', origin: 'landing-page' })
    ).rejects.toThrow(StudentLifecycleError);
  });

  it('permite o mesmo identificador em contratos diferentes (dedup e tenant-scoped)', async () => {
    const otherContract = await prisma.companyContract.create({
      data: { type: 'academy', document: `test-doc-other-${Date.now()}` },
    });
    try {
      await createStudentLead({ contractId, name: 'Mesmo Telefone A', phone: '11922223333', origin: 'landing-page' });
      const leadOtherTenant = await createStudentLead({
        contractId: otherContract.id,
        name: 'Mesmo Telefone B',
        phone: '11922223333',
        origin: 'landing-page',
      });
      expect(leadOtherTenant.id).toBeTruthy();
    } finally {
      await prisma.studentLifecycleEvent.deleteMany({ where: { contractId: otherContract.id } });
      await prisma.studentOnboardingProcess.deleteMany({ where: { contractId: otherContract.id } });
      await prisma.aluno.deleteMany({ where: { contractId: otherContract.id } });
      await prisma.companyContract.delete({ where: { id: otherContract.id } });
    }
  });

  it('mantém o id estável ao avançar da criação até ACTIVE_STUDENT', async () => {
    const created = await createStudentLead({
      contractId,
      name: 'Ciclo Completo',
      phone: '11933332222',
      origin: 'landing-page',
    });
    const originalId = created.id;

    await transitionStudentLifecycleStatus(originalId, contractId, 'INVITED');
    await transitionStudentLifecycleStatus(originalId, contractId, 'PRE_REGISTRATION_IN_PROGRESS');
    const completed = await completeStudentPreRegistration(originalId, contractId, {
      name: 'Ciclo Completo',
      birthDate: new Date('1995-05-05'),
      phone: '11933332222',
      privacyNoticeVersion: 'v1',
      privacyAcceptedAt: new Date(),
    });
    expect(completed.id).toBe(originalId);

    await transitionStudentLifecycleStatus(originalId, contractId, 'READY_FOR_ENROLLMENT', {
      professorId,
    });
    const active = await transitionStudentLifecycleStatus(originalId, contractId, 'ACTIVE_STUDENT');

    expect(active.id).toBe(originalId);
    expect(active.status).toBe('ACTIVE_STUDENT');
    expect(active.activatedAt).not.toBeNull();

    // Auditoria (achado de auditoria corrigido): a tabela de processo deve
    // refletir os marcos do ciclo, não apenas existir vazia.
    const onboarding = await prisma.studentOnboardingProcess.findUnique({
      where: { alunoId: originalId },
    });
    expect(onboarding?.startedAt).not.toBeNull();
    expect(onboarding?.completedAt).not.toBeNull();
    expect(onboarding?.reviewedAt).not.toBeNull();
    expect(onboarding?.reviewedByProfessorId).toBe(professorId);
    expect(onboarding?.convertedAt).not.toBeNull();
    expect(onboarding?.privacyNoticeVersion).toBe('v1');
    expect(onboarding?.privacyAcceptedAt).not.toBeNull();

    const events = await prisma.studentLifecycleEvent.findMany({
      where: { alunoId: originalId },
      select: { eventType: true },
    });
    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain('ADMIN_REVIEWED');
    expect(eventTypes).toContain('CONVERTED_TO_ACTIVE_STUDENT');
  });

  it('rejeita transição inválida (ex.: LEAD direto para ACTIVE_STUDENT)', async () => {
    const lead = await createStudentLead({
      contractId,
      name: 'Transição Inválida',
      phone: '11911112222',
      origin: 'landing-page',
    });
    await expect(
      transitionStudentLifecycleStatus(lead.id, contractId, 'ACTIVE_STUDENT')
    ).rejects.toThrow(StudentLifecycleError);
  });

  it('vincula conta de forma idempotente e rejeita reivindicação por outra conta', async () => {
    const lead = await createStudentLead({
      contractId,
      name: 'Reivindicação',
      phone: '11900001111',
      origin: 'landing-page',
    });
    const user = await prisma.user.create({
      data: { email: `claim-${Date.now()}@example.com`, passwordHash: 'x', type: 'aluno' },
    });
    const otherUser = await prisma.user.create({
      data: { email: `other-${Date.now()}@example.com`, passwordHash: 'x', type: 'aluno' },
    });

    try {
      const firstClaim = await claimAccountForStudentLead(lead.id, contractId, user.id);
      expect(firstClaim.userId).toBe(user.id);

      const secondClaimSameUser = await claimAccountForStudentLead(lead.id, contractId, user.id);
      expect(secondClaimSameUser.userId).toBe(user.id);

      await expect(claimAccountForStudentLead(lead.id, contractId, otherUser.id)).rejects.toThrow(
        StudentLifecycleError
      );
    } finally {
      await prisma.aluno.update({ where: { id: lead.id }, data: { userId: null } });
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    }
  });

  it('descarta com motivo e permite reabertura explícita', async () => {
    const lead = await createStudentLead({
      contractId,
      name: 'Descarte',
      phone: '11900002222',
      origin: 'landing-page',
    });

    await expect(discardStudentLead(lead.id, contractId, '', professorId)).rejects.toThrow(StudentLifecycleError);

    const discarded = await discardStudentLead(lead.id, contractId, 'Sem interesse', professorId);
    expect(discarded.status).toBe('DISCARDED');
    expect(discarded.discardReason).toBe('Sem interesse');

    const reopened = await reopenDiscardedStudentLead(lead.id, contractId, professorId);
    expect(reopened.status).toBe('LEAD');
  });

  it('não revela registro de outro contrato (tentativa cross-tenant)', async () => {
    const lead = await createStudentLead({
      contractId,
      name: 'Cross Tenant',
      phone: '11900003333',
      origin: 'landing-page',
    });
    const otherContract = await prisma.companyContract.create({
      data: { type: 'academy', document: `test-doc-crosstenant-${Date.now()}` },
    });
    try {
      await expect(
        transitionStudentLifecycleStatus(lead.id, otherContract.id, 'INVITED')
      ).rejects.toThrow(/não encontrado/i);
    } finally {
      await prisma.companyContract.delete({ where: { id: otherContract.id } });
    }
  });
});
