import crypto from 'crypto';
import {
  ContractStatus,
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { studentContractLifecycleService } from '../src/modules/student-contracts/student-contract-lifecycle.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const companyContractId = 'late-signature-company';
const emailPrefix = 'late-signature-';
const tokenHash = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

describeDatabase('late public contract signature with PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '88223344000155',
        name: 'Contrato Assinatura Tardia',
      },
    });
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('starts the replacement at signedAt when the requested start date is already in the past', async () => {
    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId: companyContractId,
        name: 'Professor',
        code: 'late-signature-professor',
      },
    });
    const professorUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}professor@example.com`,
        passwordHash: 'test-hash',
        type: UserType.professor,
        profile: { create: { name: 'Professor Assinatura Tardia' } },
      },
    });
    const professor = await prisma.professor.create({
      data: {
        userId: professorUser.id,
        contractId: companyContractId,
        collaboratorFunctionId: collaboratorFunction.id,
        role: ProfessorRole.master,
      },
    });
    const alunoUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}aluno@example.com`,
        passwordHash: 'test-hash',
        type: UserType.aluno,
        profile: { create: { name: 'Aluno Assinatura Tardia' } },
      },
    });
    const aluno = await prisma.aluno.create({
      data: {
        userId: alunoUser.id,
        professorId: professor.id,
        schedulePlan: 'free',
        age: 31,
      },
    });
    const template = await prisma.contractTemplate.create({
      data: {
        contractId: companyContractId,
        name: 'Modelo Assinatura Tardia',
        version: 1,
        status: 'ACTIVE',
        headerHtml: '',
        footerHtml: '',
      },
    });

    const oldSignedAt = new Date('2026-06-01T12:00:00.000Z');
    const oldDocument = await prisma.contract.create({
      data: {
        companyContractId,
        templateId: template.id,
        templateVersion: 1,
        alunoId: aluno.id,
        professorId: professor.id,
        status: ContractStatus.SIGNED,
        title: 'Contrato vigente',
        renderedHtml: '<p>Contrato vigente</p>',
        dataSnapshot: {},
        signedAt: oldSignedAt,
      },
    });
    const oldLink = await prisma.studentContract.create({
      data: {
        alunoId: aluno.id,
        contractId: oldDocument.id,
        status: 'active',
        startDate: oldSignedAt,
        signedAt: oldSignedAt,
      },
    });
    await prisma.aluno.update({
      where: { id: aluno.id },
      data: { currentStudentContractId: oldLink.id },
    });

    const token = 'late-signature-public-token';
    const plannedStart = new Date('2026-07-01T12:00:00.000Z');
    const candidateDocument = await prisma.contract.create({
      data: {
        companyContractId,
        templateId: template.id,
        templateVersion: 1,
        alunoId: aluno.id,
        professorId: professor.id,
        status: ContractStatus.SENT,
        title: 'Contrato substituto',
        renderedHtml: '<p>Contrato substituto</p>',
        dataSnapshot: {},
        publicTokenHash: tokenHash(token),
        publicTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const candidateLink = await prisma.studentContract.create({
      data: {
        alunoId: aluno.id,
        contractId: candidateDocument.id,
        status: 'draft',
        startDate: plannedStart,
      },
    });

    const beforeSignature = new Date();
    const result = await studentContractLifecycleService.signPublicContract(token, {
      signerName: 'Aluno Assinatura Tardia',
      signerCpf: '12345678901',
    });
    const afterSignature = new Date();

    const [updatedOldLink, updatedCandidateLink, updatedDocument, updatedAluno] =
      await Promise.all([
        prisma.studentContract.findUniqueOrThrow({ where: { id: oldLink.id } }),
        prisma.studentContract.findUniqueOrThrow({ where: { id: candidateLink.id } }),
        prisma.contract.findUniqueOrThrow({ where: { id: candidateDocument.id } }),
        prisma.aluno.findUniqueOrThrow({ where: { id: aluno.id } }),
      ]);

    expect(result.activation.scheduled).toBe(false);
    expect(updatedCandidateLink.status).toBe('active');
    expect(updatedCandidateLink.startDate).not.toBeNull();
    expect(updatedCandidateLink.signedAt).not.toBeNull();
    expect(updatedDocument.signedAt).not.toBeNull();
    expect(updatedCandidateLink.startDate!.getTime()).toBeGreaterThanOrEqual(
      beforeSignature.getTime()
    );
    expect(updatedCandidateLink.startDate!.getTime()).toBeLessThanOrEqual(
      afterSignature.getTime()
    );
    expect(updatedCandidateLink.startDate!.toISOString()).toBe(
      updatedCandidateLink.signedAt!.toISOString()
    );
    expect(updatedCandidateLink.startDate!.toISOString()).toBe(
      updatedDocument.signedAt!.toISOString()
    );
    expect(updatedCandidateLink.startDate!.getTime()).toBeGreaterThan(
      plannedStart.getTime()
    );
    expect(updatedOldLink.status).toBe('terminated');
    expect(updatedOldLink.endDate?.toISOString()).toBe(
      updatedCandidateLink.startDate!.toISOString()
    );
    expect(result.activation.effectiveAt).toBe(
      updatedCandidateLink.startDate!.toISOString()
    );
    expect(updatedAluno.currentStudentContractId).toBe(updatedCandidateLink.id);
  });
});
