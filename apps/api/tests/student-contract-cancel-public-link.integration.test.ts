import crypto from 'crypto';
import {
  ContractStatus,
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { contractPublicAccessService } from '../src/modules/contracts/contract-public-access.service.js';
import { studentContractService } from '../src/modules/student-contracts/student-contract.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const companyContractId = 'cancel-public-link-company';
const emailPrefix = 'cancel-public-link-';
const tokenHash = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

async function seedFixture(token: string) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: companyContractId,
      name: 'Professor',
      code: 'cancel-public-link-professor',
      isActive: true,
    },
  });
  const professorUser = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor Cancelamento' } },
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
      profile: { create: { name: 'Aluno Cancelamento' } },
    },
  });
  const aluno = await prisma.aluno.create({
    data: {
      userId: alunoUser.id,
      professorId: professor.id,
      schedulePlan: 'free',
      age: 33,
    },
  });
  const template = await prisma.contractTemplate.create({
    data: {
      contractId: companyContractId,
      name: 'Modelo Cancelamento',
      version: 1,
      status: 'ACTIVE',
      headerHtml: '',
      footerHtml: '',
    },
  });
  const document = await prisma.contract.create({
    data: {
      companyContractId,
      templateId: template.id,
      templateVersion: 1,
      alunoId: aluno.id,
      professorId: professor.id,
      status: ContractStatus.SENT,
      title: 'Contrato aguardando assinatura',
      renderedHtml: '<p>Contrato</p>',
      dataSnapshot: {},
      publicTokenHash: tokenHash(token),
      publicTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const link = await prisma.studentContract.create({
    data: {
      alunoId: aluno.id,
      contractId: document.id,
      status: 'pending_signature',
    },
  });

  return { aluno, document, link };
}

describeDatabase('student contract cancel and public token consistency', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '77889900000155',
        name: 'Contrato Cancelamento Público',
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

  it('cancels the unsigned document and invalidates its public token atomically', async () => {
    const token = 'cancel-public-link-token';
    const fixture = await seedFixture(token);

    const canceled = await studentContractService.cancel(
      fixture.aluno.id,
      fixture.link.id,
      'Substituição cancelada',
      { companyContractId }
    );

    const document = await prisma.contract.findUniqueOrThrow({
      where: { id: fixture.document.id },
    });
    expect(canceled.status).toBe('canceled');
    expect(document.status).toBe(ContractStatus.CANCELLED);
    expect(document.publicTokenHash).toBeNull();
    expect(document.publicTokenExpiresAt).toBeNull();

    await expect(contractPublicAccessService.open(token)).rejects.toThrow(
      'Contrato não encontrado'
    );
  });

  it('invalidates the public token when the generic update path cancels the link', async () => {
    const token = 'generic-update-cancel-token';
    const fixture = await seedFixture(token);

    await studentContractService.update(
      fixture.aluno.id,
      fixture.link.id,
      {
        status: 'canceled',
        canceledAt: new Date('2026-07-15T12:00:00.000Z'),
        cancellationReason: 'Cancelado pelo PATCH administrativo',
      },
      { companyContractId }
    );

    const document = await prisma.contract.findUniqueOrThrow({
      where: { id: fixture.document.id },
    });
    expect(document.status).toBe(ContractStatus.CANCELLED);
    expect(document.publicTokenHash).toBeNull();
    expect(document.publicTokenExpiresAt).toBeNull();
  });

  it('does not overwrite a canceled link when an inconsistent legacy token expires', async () => {
    const token = 'legacy-canceled-public-link-token';
    const fixture = await seedFixture(token);
    await prisma.studentContract.update({
      where: { id: fixture.link.id },
      data: {
        status: 'canceled',
        canceledAt: new Date('2026-07-01T12:00:00.000Z'),
        cancellationReason: 'Cancelado anteriormente',
      },
    });
    await prisma.contract.update({
      where: { id: fixture.document.id },
      data: {
        status: ContractStatus.SENT,
        publicTokenHash: tokenHash(token),
        publicTokenExpiresAt: new Date('2026-07-10T12:00:00.000Z'),
      },
    });

    await expect(
      contractPublicAccessService.open(
        token,
        {},
        prisma,
        new Date('2026-07-15T12:00:00.000Z')
      )
    ).rejects.toThrow('Link expirado');

    const [document, link] = await Promise.all([
      prisma.contract.findUniqueOrThrow({ where: { id: fixture.document.id } }),
      prisma.studentContract.findUniqueOrThrow({ where: { id: fixture.link.id } }),
    ]);
    expect(document.status).toBe(ContractStatus.EXPIRED);
    expect(link.status).toBe('canceled');
    expect(link.cancellationReason).toBe('Cancelado anteriormente');
  });

  it('retires a legacy token that still points to a canceled document', async () => {
    const token = 'legacy-canceled-document-token';
    const fixture = await seedFixture(token);
    await prisma.contract.update({
      where: { id: fixture.document.id },
      data: {
        status: ContractStatus.CANCELLED,
        cancelledAt: new Date('2026-07-01T12:00:00.000Z'),
        publicTokenHash: tokenHash(token),
        publicTokenExpiresAt: new Date('2026-08-01T12:00:00.000Z'),
      },
    });

    await expect(contractPublicAccessService.open(token)).rejects.toThrow(
      'Contrato não está disponível'
    );

    const document = await prisma.contract.findUniqueOrThrow({
      where: { id: fixture.document.id },
    });
    expect(document.publicTokenHash).toBeNull();
    expect(document.publicTokenExpiresAt).toBeNull();
  });
});