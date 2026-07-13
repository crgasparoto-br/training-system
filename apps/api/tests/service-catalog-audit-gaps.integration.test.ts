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

const contractId = 'service-audit-gaps-contract';
const emailPrefix = 'service-audit-gaps-';

function tokenFor(user: { id: string; email: string; type: UserType }) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

async function createProfessor(input: {
  suffix: string;
  role: ProfessorRole;
  canAccessServices: boolean;
}) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: `Função ${input.suffix}`,
      code: `service-audit-${input.suffix}`,
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

  await prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      role: input.role,
      collaboratorFunctionId: collaboratorFunction.id,
    },
  });

  return tokenFor(user);
}

async function createService(
  suffix: string,
  category: 'individual_service' | 'combined_plan' = 'individual_service'
) {
  return prisma.serviceOption.create({
    data: {
      contractId,
      name: `Serviço ${suffix}`,
      code: `service_audit_${suffix}`,
      category,
      displayOrder: 0,
      origin: 'manual',
      isActive: true,
    },
  });
}

async function createOption(serviceId: string, suffix: string) {
  return prisma.serviceCommercialOption.create({
    data: {
      contractId,
      serviceId,
      code: `option_audit_${suffix}`,
      name: `Opção ${suffix}`,
      priceType: 'fixed',
      priceAmount: 100,
      displayOrder: 0,
      origin: 'manual',
      isActive: true,
    },
  });
}

async function createComponent(input: {
  planServiceId: string;
  targetServiceId?: string;
  targetOptionId?: string;
  isActive?: boolean;
  displayOrder?: number;
}) {
  return prisma.servicePlanComponent.create({
    data: {
      id: crypto.randomUUID(),
      contractId,
      planServiceId: input.planServiceId,
      targetServiceId: input.targetServiceId,
      targetOptionId: input.targetOptionId,
      isActive: input.isActive ?? true,
      displayOrder: input.displayOrder ?? 0,
      origin: 'manual',
    },
  });
}

describeDatabase('remaining service catalog audit gaps with PostgreSQL', () => {
  const app = express();
  app.use(express.json());
  app.use('/services', serviceRoutes);

  let masterToken = '';
  let deniedToken = '';

  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });

    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: '57365610000501',
        name: 'Contrato auditoria complementar',
      },
    });

    masterToken = await createProfessor({
      suffix: 'master',
      role: ProfessorRole.master,
      canAccessServices: true,
    });
    deniedToken = await createProfessor({
      suffix: 'denied',
      role: ProfessorRole.professor,
      canAccessServices: false,
    });
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a real catalog write without settings.services and persists nothing', async () => {
    const response = await request(app)
      .post('/services/catalog')
      .set('Authorization', `Bearer ${deniedToken}`)
      .send({
        name: 'Serviço negado',
        code: 'service_audit_denied_write',
        category: 'individual_service',
      });

    expect(response.status).toBe(403);
    await expect(
      prisma.serviceOption.count({
        where: { contractId, code: 'service_audit_denied_write' },
      })
    ).resolves.toBe(0);
  });

  it('returns the standard 400 response for a real invalid edit', async () => {
    const service = await createService('invalid_edit');

    const response = await request(app)
      .put(`/services/catalog/${service.id}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ name: 'x' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Dados inválidos');
    await expect(
      prisma.serviceOption.findUniqueOrThrow({ where: { id: service.id } })
    ).resolves.toMatchObject({ name: 'Serviço invalid_edit', isActive: true });
  });

  it('blocks legacy inactivation so impact confirmation cannot be bypassed', async () => {
    const service = await createService('legacy_bypass');

    const response = await request(app)
      .put(`/services/${service.id}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ isActive: false });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('tela de catálogo');
    await expect(
      prisma.serviceOption.findUniqueOrThrow({ where: { id: service.id } })
    ).resolves.toMatchObject({ isActive: true });
  });

  it('reports zero, one and multiple distinct active plans for service and option impact', async () => {
    const target = await createService('impact_target');
    const option = await createOption(target.id, 'impact_target');
    const planOne = await createService('impact_plan_one', 'combined_plan');
    const planTwo = await createService('impact_plan_two', 'combined_plan');
    const planThree = await createService('impact_plan_three', 'combined_plan');

    const serviceImpactZero = await request(app)
      .get(`/services/catalog/${target.id}/impact`)
      .set('Authorization', `Bearer ${masterToken}`);
    const optionImpactZero = await request(app)
      .get(`/services/catalog/options/${option.id}/impact`)
      .set('Authorization', `Bearer ${masterToken}`);

    expect(serviceImpactZero.body.data.affectedPlans).toBe(0);
    expect(optionImpactZero.body.data.affectedPlans).toBe(0);

    await createComponent({
      planServiceId: planOne.id,
      targetServiceId: target.id,
    });
    await createComponent({
      planServiceId: planOne.id,
      targetOptionId: option.id,
    });

    const serviceImpactOne = await request(app)
      .get(`/services/catalog/${target.id}/impact`)
      .set('Authorization', `Bearer ${masterToken}`);
    const optionImpactOne = await request(app)
      .get(`/services/catalog/options/${option.id}/impact`)
      .set('Authorization', `Bearer ${masterToken}`);

    expect(serviceImpactOne.body.data.affectedPlans).toBe(1);
    expect(optionImpactOne.body.data.affectedPlans).toBe(1);

    await createComponent({
      planServiceId: planOne.id,
      targetServiceId: target.id,
      displayOrder: 1,
    });
    await createComponent({
      planServiceId: planTwo.id,
      targetServiceId: target.id,
    });
    await createComponent({
      planServiceId: planTwo.id,
      targetOptionId: option.id,
    });
    await createComponent({
      planServiceId: planThree.id,
      targetServiceId: target.id,
      isActive: false,
    });
    await createComponent({
      planServiceId: planThree.id,
      targetOptionId: option.id,
      isActive: false,
    });

    const serviceImpactMany = await request(app)
      .get(`/services/catalog/${target.id}/impact`)
      .set('Authorization', `Bearer ${masterToken}`);
    const optionImpactMany = await request(app)
      .get(`/services/catalog/options/${option.id}/impact`)
      .set('Authorization', `Bearer ${masterToken}`);

    expect(serviceImpactMany.body.data.affectedPlans).toBe(2);
    expect(optionImpactMany.body.data.affectedPlans).toBe(2);
  });

  it('invalidates a confirmation when a related component changes after impact review', async () => {
    const target = await createService('stale_target');
    const plan = await createService('stale_plan', 'combined_plan');

    const impact = await request(app)
      .get(`/services/catalog/${target.id}/impact`)
      .set('Authorization', `Bearer ${masterToken}`);

    expect(impact.status).toBe(200);
    expect(impact.body.data.affectedPlans).toBe(0);

    const component = await request(app)
      .post(`/services/catalog/${plan.id}/components`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ targetServiceId: target.id });

    expect(component.status).toBe(201);

    const staleInactivation = await request(app)
      .put(`/services/catalog/${target.id}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        isActive: false,
        impactConfirmation: {
          resourceUpdatedAt: impact.body.data.resourceUpdatedAt,
          affectedPlans: impact.body.data.affectedPlans,
        },
      });

    expect(staleInactivation.status).toBe(409);
    await expect(
      prisma.serviceOption.findUniqueOrThrow({ where: { id: target.id } })
    ).resolves.toMatchObject({ isActive: true });
  });

  it('prevents a new active component from targeting an inactive item at database level', async () => {
    const target = await createService('inactive_target');
    const plan = await createService('inactive_plan', 'combined_plan');
    await prisma.serviceOption.update({
      where: { id: target.id },
      data: { isActive: false },
    });

    await expect(
      createComponent({
        planServiceId: plan.id,
        targetServiceId: target.id,
      })
    ).rejects.toThrow('O alvo da composição está inativo');

    await expect(
      prisma.servicePlanComponent.count({
        where: { contractId, planServiceId: plan.id },
      })
    ).resolves.toBe(0);
  });
});
