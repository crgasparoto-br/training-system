import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { syncAccessPermissionsForFunction } from '../src/modules/access-control/access-control.service.js';
import { createStudentLead } from '../src/modules/alunos/student-lifecycle.service.js';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';
import {
  preRegistrationEnrollmentService,
  type PreRegistrationEnrollmentActor,
} from '../src/modules/pre-registration-enrollment/pre-registration-enrollment.service.js';
import { preRegistrationDuplicateReviewService } from '../src/modules/pre-registration-public/pre-registration-duplicate-review.service.js';
import { preRegistrationPublicAtomicService } from '../src/modules/pre-registration-public/pre-registration-public-atomic.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const suffix = `issue-274-remediation-${Date.now()}`;
const contractId = `${suffix}-contract`;
const createdUserIds: string[] = [];

async function createUser(
  label: string,
  type: UserType,
  name: string
) {
  const user = await prisma.user.create({
    data: {
      email: `${suffix}-${label}@example.com`,
      passwordHash: 'integration-test-hash',
      type,
      profile: { create: { name } },
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createProfessorActor(input: {
  label: string;
  role?: ProfessorRole;
}): Promise<PreRegistrationEnrollmentActor & { functionId: string; functionCode: string }> {
  const functionCode = `${suffix}-${input.label}`;
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: `Função ${input.label}`,
      code: functionCode,
      isActive: true,
    },
  });
  const user = await createUser(input.label, UserType.professor, `Professor ${input.label}`);
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      collaboratorFunctionId: collaboratorFunction.id,
      role: input.role ?? ProfessorRole.professor,
    },
  });
  return {
    userId: user.id,
    professorId: professor.id,
    contractId,
    functionId: collaboratorFunction.id,
    functionCode,
  };
}

describeDatabase('issue 274 audit remediation with PostgreSQL', () => {
  beforeAll(async () => {
    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: `${Date.now()}2749`,
        name: 'Contrato Issue 274 Remediation',
      },
    });
  });

  afterAll(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    for (const userId of createdUserIds.reverse()) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('preserves CPF, email and phone conflicts without exposing duplicate warnings', async () => {
    const actor = await createProfessorActor({
      label: 'public-flow-owner',
      role: ProfessorRole.master,
    });
    const studentUser = await createUser(
      'public-student',
      UserType.aluno,
      'Pessoa em Pré-cadastro'
    );

    const source = await createStudentLead({
      contractId,
      name: 'Pessoa em Pré-cadastro',
      phone: '+55 15 90000-0001',
      email: `${suffix}-source@example.com`,
      origin: 'teste-remediation',
      createdByProfessorId: actor.professorId,
    });
    await prisma.aluno.update({
      where: { id: source.id },
      data: {
        status: 'PRE_REGISTRATION_IN_PROGRESS',
        userId: studentUser.id,
        professorId: actor.professorId,
      },
    });
    await prisma.studentOnboardingProcess.update({
      where: { alunoId: source.id },
      data: {
        claimedByUserId: studentUser.id,
        claimRole: 'STUDENT',
        version: 1,
        currentStep: 'IDENTIFICATION',
        startedAt: new Date(),
      },
    });
    await upsertStudentIdentity(
      source.id,
      contractId,
      {
        name: 'Pessoa em Pré-cadastro',
        birthDate: '1990-01-01',
        phone: '+55 15 90000-0001',
        email: `${suffix}-source@example.com`,
      },
      {
        sourceType: 'professional',
        sourceReference: 'issue_274_remediation_source',
      }
    );

    const candidate = await createStudentLead({
      contractId,
      name: 'Outra Pessoa',
      phone: '+55 15 98888-0000',
      email: `${suffix}-shared@example.com`,
      origin: 'teste-remediation-candidate',
      createdByProfessorId: actor.professorId,
    });
    await upsertStudentIdentity(
      candidate.id,
      contractId,
      {
        name: 'Outra Pessoa',
        birthDate: '1985-05-10',
        cpf: '52998224725',
        phone: '+55 15 98888-0000',
        email: `${suffix}-shared@example.com`,
      },
      {
        sourceType: 'professional',
        sourceReference: 'issue_274_remediation_candidate',
      }
    );

    const initialOnboarding = await prisma.studentOnboardingProcess.findUniqueOrThrow({
      where: { alunoId: source.id },
      select: { version: true },
    });
    const identification = await preRegistrationDuplicateReviewService.preserveDuplicateConflict(
      studentUser.id,
      source.id,
      {
        expectedVersion: initialOnboarding.version,
        step: 'IDENTIFICATION',
        data: {
          name: 'Pessoa em Pré-cadastro',
          birthDate: '1990-01-01',
          cpf: '52998224725',
        },
      }
    );
    expect(identification).toEqual({
      version: initialOnboarding.version + 1,
      currentStep: 'CONTACT',
    });

    const afterCpf = await prisma.aluno.findUniqueOrThrow({
      where: { id: source.id },
      include: { studentProfile: true },
    });
    expect(afterCpf.leadCpf).toBe('52998224725');
    expect(afterCpf.leadCpfNormalized).toBeNull();
    expect(afterCpf.studentProfile?.identificationData).not.toMatchObject({
      cpf: '52998224725',
    });

    const contact = await preRegistrationDuplicateReviewService.preserveDuplicateConflict(
      studentUser.id,
      source.id,
      {
        expectedVersion: identification.version,
        step: 'CONTACT',
        data: {
          phone: '(15) 98888-0000',
          email: `${suffix}-shared@example.com`.toUpperCase(),
        },
      }
    );
    expect(contact).toEqual({
      version: identification.version + 1,
      currentStep: 'ADDRESS',
    });

    const address = await preRegistrationDuplicateReviewService.preserveDuplicateConflict(
      studentUser.id,
      source.id,
      {
        expectedVersion: contact.version,
        step: 'ADDRESS',
        data: {
          addressStreet: 'Rua do Rascunho',
          addressNumber: '274',
          addressCity: 'Sorocaba',
          addressState: 'SP',
        },
      }
    );
    expect(address).toEqual({
      version: contact.version + 1,
      currentStep: 'PRIVACY',
    });

    const [persisted, pendingReview, session] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: source.id } }),
      prisma.studentProfileReview.findFirstOrThrow({
        where: {
          alunoId: source.id,
          requestedByUserId: studentUser.id,
          status: 'pending',
        },
        orderBy: { createdAt: 'desc' },
      }),
      preRegistrationPublicAtomicService.getSession(studentUser.id, source.id),
    ]);
    expect(persisted.leadCpf).toBe('52998224725');
    expect(persisted.leadCpfNormalized).toBeNull();
    expect(persisted.leadPhoneNormalized).toBe('5515988880000');
    expect(persisted.leadEmailNormalized).toBe(`${suffix}-shared@example.com`);
    expect(pendingReview.snapshotAfter).toMatchObject({
      cpf: '52998224725',
      phone: '(15) 98888-0000',
      email: `${suffix}-shared@example.com`.toUpperCase(),
    });

    const projected = await preRegistrationDuplicateReviewService.projectPublicSession(
      studentUser.id,
      source.id,
      session
    );
    expect(projected.identity).toMatchObject({
      cpf: '52998224725',
      phone: '(15) 98888-0000',
      email: `${suffix}-shared@example.com`.toUpperCase(),
    });
    expect(projected.duplicateWarnings).toEqual([]);

    const completed = await preRegistrationPublicAtomicService.complete(
      studentUser.id,
      source.id,
      { expectedVersion: address.version, privacyAccepted: true },
      { ipAddress: '127.0.0.1', userAgent: 'issue-274-remediation-test' }
    );
    expect(completed.status).toBe('PRE_REGISTRATION_COMPLETED');

    const administrativeReview = await preRegistrationEnrollmentService.inspect(
      actor,
      source.id
    );
    expect(administrativeReview.classification).toBe('BLOCKING');
    expect(
      administrativeReview.candidates.map((item) => item.candidateAlunoId)
    ).toContain(candidate.id);
    expect(administrativeReview.canMarkReady).toBe(false);
  });

  it('revalidates the create block inside the write transaction', async () => {
    const actor = await createProfessorActor({ label: 'restricted-create' });
    await syncAccessPermissionsForFunction(
      actor.functionId,
      actor.functionCode
    );
    await prisma.accessPermission.updateMany({
      where: {
        collaboratorFunctionId: actor.functionId,
        screenKey: 'students.preRegistration',
        blockKey: '',
      },
      data: { canView: true, dataScope: 'contract' },
    });
    await prisma.accessPermission.updateMany({
      where: {
        collaboratorFunctionId: actor.functionId,
        blockKey: 'students.preRegistration.create',
      },
      data: { canView: false },
    });

    const before = await prisma.aluno.count({ where: { contractId } });
    await expect(
      preRegistrationEnrollmentCreateService.create(actor, {
        name: 'Criação sem permissão',
        phone: '+55 15 97777-0000',
        email: `${suffix}-forbidden-create@example.com`,
        origin: 'teste-permissao',
        responsibleProfessorId: actor.professorId,
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await prisma.aluno.count({ where: { contractId } })).toBe(before);

    await prisma.accessPermission.updateMany({
      where: {
        collaboratorFunctionId: actor.functionId,
        blockKey: 'students.preRegistration.create',
      },
      data: { canView: true },
    });
    const createdId = await preRegistrationEnrollmentCreateService.create(actor, {
      name: 'Criação autorizada',
      phone: '+55 15 97777-0001',
      email: `${suffix}-allowed-create@example.com`,
      origin: 'teste-permissao',
      responsibleProfessorId: actor.professorId,
    });
    expect(createdId).toEqual(expect.any(String));
  });
});
