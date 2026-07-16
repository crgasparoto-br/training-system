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

const companyContractId = 'sign-expiration-terminal-company';
const emailPrefix = 'sign-expiration-terminal-';
const tokenHash = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

describeDatabase('expired public signature and terminal link consistency', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '88990011000166',
        name: 'Contrato Expiração da Assinatura',
      },
    });
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('expires the document without overwriting a canceled student link', async () => {
    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId: companyContractId,
        name: 'Professor',
        code: 'sign-expiration-terminal-professor',
        isActive: true,
      },
    });
    const professorUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}professor@example.com`,
        passwordHash: 'test-hash',
        type: UserType.professor,
        profile: { create: { name: 'Professor Expiração' } },
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
        profile: { create: { name: 'Aluno Expiração' } },
      },
    });
    const aluno = await prisma.aluno.create({
      data: {
        userId: alunoUser.id,
        professorId: professor.id,
        schedulePlan: 'free',
        age: 36,
      },
    });
    const template = await prisma.contractTemplate.create({
      data: {
        contractId: companyContractId,
        name: 'Modelo Expiração',
        version: 1,
        status: 'ACTIVE',
        headerHtml: '',
        footerHtml: '',
      },
    });
    const token = 'expired-signature-terminal-token';
    const document = await prisma.contract.create({
      data: {
        companyContractId,
        templateId: template.id,
        templateVersion: 1,
        alunoId: aluno.id,
        professorId: professor.id,
        status: ContractStatus.SENT,
        title: 'Contrato expirado',
        renderedHtml: '<p>Contrato</p>',
        dataSnapshot: {},
        publicTokenHash: tokenHash(token),
        publicTokenExpiresAt: new Date('2026-07-10T12:00:00.000Z'),
      },
    });
    const link = await prisma.studentContract.create({
      data: {
        alunoId: aluno.id,
        contractId: document.id,
        status: 'pending_signature',
      },
    });

    await prisma.studentContract.update({
      where: { id: link.id },
      data: {
        status: 'canceled',
        canceledAt: new Date('2026-07-01T12:00:00.000Z'),
        cancellationReason: 'Cancelado anteriormente',
      },
    });
    await prisma.contract.update({
      where: { id: document.id },
      data: {
        status: ContractStatus.SENT,
        publicTokenHash: tokenHash(token),
        publicTokenExpiresAt: new Date('2026-07-10T12:00:00.000Z'),
      },
    });

    await expect(
      studentContractLifecycleService.signPublicContract(token, {
        signerName: 'Aluno Expiração',
        signerCpf: '12345678901',
      })
    ).rejects.toThrow('Link expirado');

    const [persistedDocument, persistedLink, signatures] = await Promise.all([
      prisma.contract.findUniqueOrThrow({ where: { id: document.id } }),
      prisma.studentContract.findUniqueOrThrow({ where: { id: link.id } }),
      prisma.contractSignature.findMany({ where: { contractId: document.id } }),
    ]);

    expect(persistedDocument.status).toBe(ContractStatus.EXPIRED);
    expect(persistedDocument.publicTokenHash).toBeNull();
    expect(persistedLink.status).toBe('canceled');
    expect(persistedLink.cancellationReason).toBe('Cancelado anteriormente');
    expect(signatures).toHaveLength(0);
  });
});