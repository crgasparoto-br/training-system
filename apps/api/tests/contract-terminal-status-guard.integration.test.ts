import {
  ContractPartyType,
  ContractStatus,
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const companyContractId = 'issue-263-terminal-status-company';
const emailPrefix = 'issue-263-terminal-status-';

async function cleanupFixtures() {
  await prisma.contract.deleteMany({ where: { companyContractId } });
  await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
}

describeDatabase('terminal generated contract status protection', () => {
  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects reclassification of signed, cancelled and expired documents', async () => {
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '57365610000702',
        name: 'Contrato teste estados terminais issue 263',
      },
    });
    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId: companyContractId,
        name: 'Professor',
        code: 'issue-263-terminal-professor',
        isActive: true,
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `${emailPrefix}collaborator@example.com`,
        passwordHash: 'test-hash',
        type: UserType.professor,
        profile: { create: { name: 'Colaborador estados terminais', cpf: '26300000004' } },
      },
    });
    const collaborator = await prisma.professor.create({
      data: {
        userId: user.id,
        contractId: companyContractId,
        collaboratorFunctionId: collaboratorFunction.id,
        role: ProfessorRole.master,
      },
    });
    const template = await prisma.contractTemplate.create({
      data: {
        contractId: companyContractId,
        name: 'Modelo estados terminais',
        version: 1,
        status: 'ACTIVE',
        headerHtml: '',
        footerHtml: '',
      },
    });

    const createDocument = (id: string, status: ContractStatus) => prisma.contract.create({
      data: {
        id,
        companyContractId,
        templateId: template.id,
        templateVersion: 1,
        collaboratorId: collaborator.id,
        partyType: ContractPartyType.COLLABORATOR,
        status,
        title: `Documento ${status}`,
        renderedHtml: `<p>${status}</p>`,
        dataSnapshot: { party: { type: 'COLLABORATOR', id: collaborator.id } },
      },
    });

    const signed = await createDocument('issue-263-terminal-signed', ContractStatus.SIGNED);
    const cancelled = await createDocument('issue-263-terminal-cancelled', ContractStatus.CANCELLED);
    const expired = await createDocument('issue-263-terminal-expired', ContractStatus.EXPIRED);

    await expect(prisma.contract.update({
      where: { id: signed.id },
      data: { status: ContractStatus.CANCELLED },
    })).rejects.toThrow('Terminal contract status cannot be changed');
    await expect(prisma.contract.update({
      where: { id: cancelled.id },
      data: { status: ContractStatus.SENT },
    })).rejects.toThrow('Terminal contract status cannot be changed');
    await expect(prisma.contract.update({
      where: { id: expired.id },
      data: { status: ContractStatus.CANCELLED },
    })).rejects.toThrow('Terminal contract status cannot be changed');

    await prisma.contract.update({
      where: { id: expired.id },
      data: { title: 'Documento expirado preservado' },
    });
    const statuses = await prisma.contract.findMany({
      where: { id: { in: [signed.id, cancelled.id, expired.id] } },
      select: { id: true, status: true },
    });
    expect(new Map(statuses.map((item) => [item.id, item.status]))).toEqual(new Map([
      [signed.id, ContractStatus.SIGNED],
      [cancelled.id, ContractStatus.CANCELLED],
      [expired.id, ContractStatus.EXPIRED],
    ]));
  });
});
