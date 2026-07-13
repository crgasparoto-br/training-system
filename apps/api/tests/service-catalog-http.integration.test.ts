import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';

const request = require('supertest');
const { serviceRoutes } = require('../src/modules/services/index');

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractA = 'service-http-contract-a';
const contractB = 'service-http-contract-b';
const emailPrefix = 'service-http-test-';

function tokenFor(user: { id: string; email: string; type: UserType }) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

async function createContract(id: string, document: string) {
  return prisma.companyContract.create({
    data: {
      id,
      type: ContractType.CNPJ,
      document,
      name: `Contrato ${id}`,
    },
  });
}

async function createProfessor(input: {
  contractId: string;
  suffix: string;
  role: ProfessorRole;
  canAccessServices: boolean;
}) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: input.contractId,
      name: `Função ${input.suffix}`,
      code: `service-http-${input.suffix}`,
      isActive: true,
    },
  });

  await prisma.accessPermission.create({
    data: {
      collaboratorFunctionId: collaboratorFunction.id,
      screenKey: 'settings.services',
      blockKey: '',
      canView: input.canAccessServices,
    },
  });

  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}${input.suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: `Professor ${input.suffix}` } },
    },
  });

  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId: input.contractId,
      role: input.role,
      collaboratorFunctionId: collaboratorFunction.id,
    },
  });

  return { user, professor, token: tokenFor(user) };
}

async function createService(
  contractId: string,
  suffix: string,
  category: 'individual_service' | 'combined_plan' = 'individual_service'
) {
  return prisma.serviceOption.create({
    data: {
      contractId,
      name: `Serviço ${suffix}`,
      code: `service_http_${suffix}`,
      category,
      displayOrder: 0,
      origin: 'manual',
      isActive: true,
    },
  });
}

async function createOption(contractId: string, serviceId: string, suffix: string, displayOrder: number) {
  return prisma.serviceCommercialOption.create({
    data: {
      contractId,
      serviceId,
      code: `option_http_${suffix}`,
      name: `Opção ${suffix}`,
      priceType: 'fixed',
      priceAmount: 100 + displayOrder,
      displayOrder,
      origin: 'manual',
      isActive: true,
    },
  });
}

async function createComponent(input: {
  contractId: string;
  planServiceId: string;
  targetServiceId?: string;
  targetOptionId?: string;
  isActive?: boolean;
  displayOrder?: number;
}) {
  return prisma.servicePlanComponent.create({
    data: {
      id: crypto.randomUUID(),
      contractId: input.contractId,
      planServiceId: input.planServiceId,
      targetServiceId: input.targetServiceId,
      targetOptionId: input.targetOptionId,
      isActive: input.isActive ?? true,
      displayOrder: input.displayOrder ?? 0,
      origin: 'manual',
    },
  });
}

describeDatabase('service catalog HTTP integration with PostgreSQL', () => {
  const app = express();
  app.use(express.json());
  app.use('/services', serviceRoutes);

  let masterToken = '';
  let deniedToken = '';
  let serviceA: Awaited<ReturnType<typeof createService>>;
  let serviceB: Awaited<ReturnType<typeof createService>>;
  let optionsA: Array<Awaited<ReturnType<typeof createOption>>> = [];

  beforeEach(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractA, contractB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });

    await createContract(contractA, '57365610000401');
    await createContract(contractB, '57365610000402');

    const master = await createProfessor({
      contractId: contractA,
      suffix: 'master',
      role: ProfessorRole.master,
      canAccessServices: true,
    });
    const denied = await createProfessor({
      contractId: contractA,
      suffix: 'denied',
      role: ProfessorRole.professor,
      canAccessServices: false,
    });

    masterToken = master.token;
    deniedToken = denied.token;
    serviceA = await createService(contractA, 'tenant_a');
    serviceB = await createService(contractB, 'tenant_b');
    optionsA = await Promise.all([
      createOption(contractA, serviceA.id, 'a', 0),
      createOption(contractA, serviceA.id, 'b', 1),
      createOption(contractA, serviceA.id, 'c', 2),
    ]);
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractA, contractB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('requires authentication and real settings.services permission', async () => {
    const unauthenticated = await request(app).get('/services/catalog');
    const denied = await request(app)
      .get('/services/catalog')
      .set('Authorization', `Bearer ${deniedToken}`);

    expect(unauthenticated.status).toBe(401);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('Perfil sem permissão para acessar este recurso');
  });

  it('uses the authenticated contract for real reads and writes', async () => {
    const listResponse = await request(app)
      .get('/services/catalog?includeInactive=true')
      .set('Authorization', `Bearer ${masterToken}`);
    const createResponse = await request(app)
      .post('/services/catalog')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        name: 'Serviço criado pela rota',
        code: 'service_http_created',
        category: 'individual_service',
      });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.map((item: { id: string }) => item.id)).toContain(serviceA.id);
    expect(listResponse.body.data.map((item: { id: string }) => item.id)).not.toContain(serviceB.id);
    expect(createResponse.status).toBe(201);

    await expect(
      prisma.serviceOption.findUniqueOrThrow({ where: { id: createResponse.body.data.id } })
    ).resolves.toMatchObject({ contractId: contractA });
  });

  it('does not reveal or update an id from another contract', async () => {
    const readResponse = await request(app)
      .get(`/services/catalog/${serviceB.id}`)
      .set('Authorization', `Bearer ${masterToken}`);
    const updateResponse = await request(app)
      .put(`/services/catalog/${serviceB.id}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ name: 'Tentativa cruzada' });

    expect(readResponse.status).toBe(404);
    expect(updateResponse.status).toBe(404);
    await expect(
      prisma.serviceOption.findUniqueOrThrow({ where: { id: serviceB.id } })
    ).resolves.toMatchObject({ name: 'Serviço tenant_b', contractId: contractB });
  });

  it('returns the standard 400 response for invalid payloads', async () => {
    const response = await request(app)
      .post('/services/catalog')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ name: 'x', code: '', category: 'unknown' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Dados inválidos');
  });

  it('rejects duplicate, incomplete and cross-tenant reorder batches without partial writes', async () => {
    const foreignOption = await createOption(contractB, serviceB.id, 'foreign', 0);
    const before = await prisma.serviceCommercialOption.findMany({
      where: { serviceId: serviceA.id },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, displayOrder: true },
    });

    for (const ids of [
      [optionsA[0].id, optionsA[0].id, optionsA[2].id],
      [optionsA[0].id, optionsA[1].id],
      [optionsA[0].id, optionsA[1].id, foreignOption.id],
    ]) {
      const response = await request(app)
        .put(`/services/catalog/${serviceA.id}/options/reorder`)
        .set('Authorization', `Bearer ${masterToken}`)
        .send({ ids });
      expect([400, 404]).toContain(response.status);
    }

    await expect(
      prisma.serviceCommercialOption.findMany({
        where: { serviceId: serviceA.id },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, displayOrder: true },
      })
    ).resolves.toEqual(before);
  });

  it('keeps positions contiguous after competing real reorder requests', async () => {
    const firstOrder = [optionsA[2].id, optionsA[0].id, optionsA[1].id];
    const secondOrder = [optionsA[1].id, optionsA[2].id, optionsA[0].id];

    const responses = await Promise.all([
      request(app)
        .put(`/services/catalog/${serviceA.id}/options/reorder`)
        .set('Authorization', `Bearer ${masterToken}`)
        .send({ ids: firstOrder }),
      request(app)
        .put(`/services/catalog/${serviceA.id}/options/reorder`)
        .set('Authorization', `Bearer ${masterToken}`)
        .send({ ids: secondOrder }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);

    const persisted = await prisma.serviceCommercialOption.findMany({
      where: { serviceId: serviceA.id },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, displayOrder: true },
    });

    expect(persisted.map((item) => item.displayOrder)).toEqual([0, 1, 2]);
    expect(new Set(persisted.map((item) => item.id))).toEqual(
      new Set(optionsA.map((item) => item.id))
    );
  });

  it('calculates distinct active impact and rejects a stale inactivation confirmation', async () => {
    const planOne = await createService(contractA, 'plan_one', 'combined_plan');
    const planTwo = await createService(contractA, 'plan_two', 'combined_plan');
    await createComponent({
      contractId: contractA,
      planServiceId: planOne.id,
      targetServiceId: serviceA.id,
      displayOrder: 0,
    });
    await createComponent({
      contractId: contractA,
      planServiceId: planOne.id,
      targetServiceId: serviceA.id,
      displayOrder: 1,
    });
    await createComponent({
      contractId: contractA,
      planServiceId: planTwo.id,
      targetServiceId: serviceA.id,
      displayOrder: 0,
    });
    await createComponent({
      contractId: contractA,
      planServiceId: planTwo.id,
      targetServiceId: serviceA.id,
      isActive: false,
      displayOrder: 1,
    });

    const impactResponse = await request(app)
      .get(`/services/catalog/${serviceA.id}/impact`)
      .set('Authorization', `Bearer ${masterToken}`);

    expect(impactResponse.status).toBe(200);
    expect(impactResponse.body.data.affectedPlans).toBe(2);

    await prisma.serviceOption.update({
      where: { id: serviceA.id },
      data: { summary: 'Catálogo alterado após a consulta' },
    });

    const staleResponse = await request(app)
      .put(`/services/catalog/${serviceA.id}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        isActive: false,
        impactConfirmation: {
          resourceUpdatedAt: impactResponse.body.data.resourceUpdatedAt,
          affectedPlans: 2,
        },
      });

    expect(staleResponse.status).toBe(409);
    await expect(
      prisma.serviceOption.findUniqueOrThrow({ where: { id: serviceA.id } })
    ).resolves.toMatchObject({ isActive: true });
  });
});
