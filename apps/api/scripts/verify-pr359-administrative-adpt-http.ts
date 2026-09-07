import express from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import adipometryGovernanceRoutes from '../src/modules/adipometry/adipometry-governance.routes.js';
import { getDefaultCollaboratorFunctionByCode } from '../src/modules/collaborator-functions/collaborator-function.service.js';

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const app = express();
app.use(express.json());
app.use('/contracts', adipometryGovernanceRoutes);

function fail(message: string, details?: unknown): never {
  throw new Error(details === undefined ? message : `${message}: ${JSON.stringify(details)}`);
}

async function main() {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `pr359-admin-${suffix}`,
      name: `PR 359 administrative lifecycle ${suffix}`,
    },
  });

  const administrativeFunction = await getDefaultCollaboratorFunctionByCode(
    contract.id,
    'administrative',
  );
  const professorFunction = await getDefaultCollaboratorFunctionByCode(contract.id, 'professor');

  if (!administrativeFunction || !professorFunction) {
    fail('PR359_DEFAULT_FUNCTIONS_NOT_CREATED');
  }

  const administrativePermissions = await prisma.accessPermission.findMany({
    where: {
      collaboratorFunctionId: administrativeFunction.id,
      screenKey: 'settings.contract',
      blockKey: {
        in: [
          '',
          'settings.contract.actions.manageClinicalTechnicalResponsibility',
          'settings.contract.adipometryProtocolApproval',
        ],
      },
    },
    select: { blockKey: true, canView: true },
  });

  const screenGrant = administrativePermissions.find((item) => item.blockKey === '');
  const manageGrant = administrativePermissions.find(
    (item) =>
      item.blockKey === 'settings.contract.actions.manageClinicalTechnicalResponsibility',
  );
  const approvalGrant = administrativePermissions.find(
    (item) => item.blockKey === 'settings.contract.adipometryProtocolApproval',
  );

  if (!screenGrant?.canView || !manageGrant?.canView || approvalGrant?.canView !== false) {
    fail('PR359_ADMINISTRATIVE_PERMISSION_SEED_MISMATCH', administrativePermissions);
  }

  const actorUser = await prisma.user.create({
    data: {
      email: `pr359-admin-actor-${suffix}@example.invalid`,
      passwordHash: 'not-a-password',
      type: 'professor',
      isActive: true,
    },
  });
  const targetUser = await prisma.user.create({
    data: {
      email: `pr359-admin-target-${suffix}@example.invalid`,
      passwordHash: 'not-a-password',
      type: 'professor',
      isActive: true,
    },
  });

  const actorProfessor = await prisma.professor.create({
    data: {
      userId: actorUser.id,
      contractId: contract.id,
      collaboratorFunctionId: administrativeFunction.id,
      role: 'professor',
      currentStatus: 'active',
    },
  });
  const targetProfessor = await prisma.professor.create({
    data: {
      userId: targetUser.id,
      contractId: contract.id,
      collaboratorFunctionId: professorFunction.id,
      role: 'professor',
      currentStatus: 'active',
    },
  });

  await prisma.profile.createMany({
    data: [
      {
        userId: actorUser.id,
        name: `Administrative actor ${suffix}`,
        cref: `CREF-A-${suffix}`,
      },
      {
        userId: targetUser.id,
        name: `Clinical target ${suffix}`,
        cref: `CREF-T-${suffix}`,
      },
    ],
  });

  await prisma.accessPermission.updateMany({
    where: {
      collaboratorFunctionId: professorFunction.id,
      screenKey: 'settings.contract',
      blockKey: 'settings.contract.adipometryProtocolApproval',
    },
    data: { canView: true },
  });

  const authToken = jwt.sign(
    {
      userId: actorUser.id,
      email: actorUser.email,
      type: 'professor',
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' },
  );

  const designation = await request(app)
    .put('/contracts/adipometry-governance/responsible')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ professorId: targetProfessor.id });

  if (designation.status !== 200 || designation.body?.success !== true) {
    fail('PR359_ADMINISTRATIVE_PUT_MUST_SUCCEED', {
      status: designation.status,
      body: designation.body,
    });
  }

  const activeResponsibility = await prisma.adipometryClinicalResponsibility.findFirst({
    where: {
      contractId: contract.id,
      effectiveTo: null,
    },
    select: { professorId: true, designatedByUserId: true },
  });

  if (
    activeResponsibility?.professorId !== targetProfessor.id ||
    activeResponsibility.designatedByUserId !== actorUser.id
  ) {
    fail('PR359_ADMINISTRATIVE_PUT_PERSISTENCE_MISMATCH', activeResponsibility);
  }

  const deniedApproval = await request(app)
    .post('/contracts/adipometry-governance/protocols/GUEDES_1991_ADULT_YOUNG/1/approve')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      approvalStatement: 'This request must be rejected before clinical approval is evaluated.',
      approvedSpecificationHash: '0'.repeat(64),
    });

  if (
    deniedApproval.status !== 403 ||
    deniedApproval.body?.error !== 'Ação sensível sem concessão explícita'
  ) {
    fail('PR359_ADMINISTRATIVE_APPROVAL_MUST_REMAIN_DENIED', {
      status: deniedApproval.status,
      body: deniedApproval.body,
    });
  }

  console.log(
    JSON.stringify({
      control: 'PR359-ADMIN-POST-DEPLOY-HTTP-001',
      status: 'passed',
      actorRole: actorProfessor.role,
      actorFunctionCode: administrativeFunction.code,
      designationStatus: designation.status,
      approvalStatus: deniedApproval.status,
      responsibilityProfessorId: activeResponsibility.professorId,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
