import fs from 'node:fs';
import express from 'express';
import jwt from 'jsonwebtoken';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  StudentLifecycleStatus,
  UserType,
} from '@prisma/client';
import authRoutes from '../src/modules/auth/auth.routes.js';
import { consolidatedPrescriptionRoutes } from '../src/modules/consolidated-prescriptions/index.js';
import { authService } from '../src/modules/auth/auth.service.js';

const prisma = new PrismaClient();
const port = Number(process.env.ISSUE318_REAL_API_PORT || 4181);
const fixtureFile = process.env.ISSUE318_REAL_API_FIXTURE_FILE;
const jwtSecret = process.env.JWT_SECRET || 'issue-318-real-api-evidence-secret';
const contractId = 'issue318-real-contract';
const alunoId = 'issue318-real-aluno';
const capacities = ['resisted', 'flexibility', 'cyclic', 'balance'];

if (!fixtureFile) throw new Error('ISSUE318_REAL_API_FIXTURE_FILE is required');

async function seed() {
  const contract = await prisma.companyContract.create({
    data: {
      id: contractId,
      type: ContractType.academy,
      document: '57365610003131',
      name: 'Academia Issue 318',
      tradeName: 'Academia Issue 318',
    },
  });
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Gestor Issue 318',
      code: 'issue318-real-manager',
      isActive: true,
    },
  });
  await prisma.accessPermission.createMany({
    data: [
      { collaboratorFunctionId: collaboratorFunction.id, screenKey: 'plans', blockKey: '', canView: true, dataScope: 'contract' },
      { collaboratorFunctionId: collaboratorFunction.id, screenKey: 'plans', blockKey: 'plans.consolidatedPrescriptions.view', canView: true },
      { collaboratorFunctionId: collaboratorFunction.id, screenKey: 'plans', blockKey: 'plans.consolidatedPrescriptions.manage', canView: true },
      { collaboratorFunctionId: collaboratorFunction.id, screenKey: 'plans', blockKey: 'plans.consolidatedPrescriptions.approve', canView: true },
    ],
  });
  const user = await prisma.user.create({
    data: {
      email: 'issue318-real-manager@example.com',
      passwordHash: 'not-used-by-evidence',
      type: UserType.professor,
      profile: { create: { name: 'Gestora API Real' } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      role: ProfessorRole.master,
      collaboratorFunctionId: collaboratorFunction.id,
    },
  });
  const aluno = await prisma.aluno.create({
    data: {
      id: alunoId,
      contractId,
      professorId: professor.id,
      status: StudentLifecycleStatus.ACTIVE_STUDENT,
    },
  });
  const record = await prisma.prontuarioRecord.create({
    data: {
      contractId,
      alunoId: aluno.id,
      professorId: professor.id,
      code: 'PRNT-ISSUE318-REAL',
      summary: 'Fonte estruturada para evidência browser com API real',
    },
  });
  const goal = await prisma.prontuarioGoal.create({
    data: { recordId: record.id, title: 'Objetivo Issue 318', priority: 1 },
  });

  for (const capacity of capacities) {
    const root = await prisma.capacityPrescription.create({
      data: {
        contractId,
        alunoId,
        capacity,
        status: 'active',
        currentVersion: 1,
        createdByProfessorId: professor.id,
        updatedByProfessorId: professor.id,
        publishesTodayWorkout: false,
      },
    });
    await prisma.capacityPrescriptionVersion.create({
      data: {
        prescriptionId: root.id,
        contractId,
        alunoId,
        responsibleProfessorId: professor.id,
        capacity,
        status: 'active',
        version: 1,
        technicalJustification: `Justificativa real ${capacity}.`,
        professorSummary: `Resumo real ${capacity}.`,
        studentMessage: null,
        methodologyVersion: null,
        parameterSetIds: [],
        publishesTodayWorkout: false,
        sources: {
          create: {
            sourceType: 'prontuario_goal',
            sourceId: goal.id,
            label: 'Objetivo canônico do PRNT',
            origin: 'PRNT',
            sourceVersion: '1',
            responsibleProfessorId: professor.id,
          },
        },
      },
    });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    jwtSecret,
    { expiresIn: '1h' }
  );
  const authenticatedUser = await authService.getAuthenticatedUserById(user.id);
  if (!authenticatedUser) throw new Error('Failed to build authenticated user fixture');

  fs.writeFileSync(
    fixtureFile,
    JSON.stringify({ token, alunoId, user: authenticatedUser, contractId, professorId: professor.id }, null, 2)
  );
}

async function main() {
  await seed();
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok', evidence: 'issue-318-real-api' }));
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/consolidated-prescriptions', consolidatedPrescriptionRoutes);
  app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Issue 318 real API evidence server listening on http://127.0.0.1:${port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
