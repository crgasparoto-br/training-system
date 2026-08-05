import express from 'express';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import authRoutes from '../auth/auth.routes.js';
import { adipometryRoutes } from './index.js';

const request = require('supertest');
const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/adipometry', adipometryRoutes);
const token = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function bearer(userId: string) {
  return jwt.sign(
    { userId, email: `${userId}@example.invalid`, type: 'professor' },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

describe('AUTH-ACTOR-RESP-001 professional actor without Professor profile', () => {
  const ids: Record<string, string> = {};
  const password = 'S3gura-123!';

  beforeAll(async () => {
    const suffix = token();
    const [contract, otherContract] = await Promise.all([
      prisma.companyContract.create({
        data: { type: 'academy', document: `actor-a-${suffix}`, name: `Actor A ${suffix}` },
      }),
      prisma.companyContract.create({
        data: { type: 'academy', document: `actor-b-${suffix}`, name: `Actor B ${suffix}` },
      }),
    ]);
    ids.contract = contract.id;
    ids.otherContract = otherContract.id;

    const [actorFunction, responsibleFunction, otherFunction] = await Promise.all([
      prisma.collaboratorFunctionOption.create({
        data: { contractId: contract.id, name: 'Operação ADPT', code: `actor-${suffix}` },
      }),
      prisma.collaboratorFunctionOption.create({
        data: { contractId: contract.id, name: 'Professor ADPT', code: `responsible-${suffix}` },
      }),
      prisma.collaboratorFunctionOption.create({
        data: { contractId: otherContract.id, name: 'Outro ADPT', code: `other-${suffix}` },
      }),
    ]);
    ids.actorFunction = actorFunction.id;

    for (const collaboratorFunctionId of [actorFunction.id, responsibleFunction.id]) {
      await prisma.accessPermission.createMany({
        data: [
          {
            collaboratorFunctionId,
            screenKey: 'physicalAssessment.protocol',
            blockKey: '',
            canView: true,
          },
          {
            collaboratorFunctionId,
            screenKey: 'physicalAssessment.protocol',
            blockKey: 'physicalAssessment.adpt.view',
            canView: true,
          },
          {
            collaboratorFunctionId,
            screenKey: 'physicalAssessment.protocol',
            blockKey: 'physicalAssessment.adpt.actions.manage',
            canView: true,
          },
        ],
      });
    }

    const passwordHash = await bcryptjs.hash(password, 4);
    const [actorUser, noMembershipUser, responsibleUser, otherResponsibleUser] = await Promise.all([
      prisma.user.create({
        data: {
          email: `actor-${suffix}@example.invalid`,
          passwordHash,
          type: 'professor',
          profile: { create: { name: 'Operador sem perfil de professor' } },
        },
      }),
      prisma.user.create({
        data: {
          email: `no-membership-${suffix}@example.invalid`,
          passwordHash,
          type: 'professor',
        },
      }),
      prisma.user.create({
        data: {
          email: `responsible-${suffix}@example.invalid`,
          passwordHash,
          type: 'professor',
          profile: { create: { name: 'Professora Responsável' } },
        },
      }),
      prisma.user.create({
        data: {
          email: `other-responsible-${suffix}@example.invalid`,
          passwordHash,
          type: 'professor',
          profile: { create: { name: 'Professor Outro Contrato' } },
        },
      }),
    ]);
    ids.actorUser = actorUser.id;
    ids.actorEmail = actorUser.email;
    ids.noMembershipUser = noMembershipUser.id;
    ids.responsibleUser = responsibleUser.id;
    ids.otherResponsibleUser = otherResponsibleUser.id;

    const [responsible, otherResponsible] = await Promise.all([
      prisma.professor.create({
        data: {
          userId: responsibleUser.id,
          contractId: contract.id,
          collaboratorFunctionId: responsibleFunction.id,
          role: 'professor',
          currentStatus: 'active',
        },
      }),
      prisma.professor.create({
        data: {
          userId: otherResponsibleUser.id,
          contractId: otherContract.id,
          collaboratorFunctionId: otherFunction.id,
          role: 'master',
          currentStatus: 'active',
        },
      }),
    ]);
    ids.responsible = responsible.id;
    ids.otherResponsible = otherResponsible.id;

    const studentUser = await prisma.user.create({
      data: {
        email: `student-${suffix}@example.invalid`,
        passwordHash,
        type: 'aluno',
        profile: { create: { name: 'Aluno do contrato' } },
      },
    });
    const student = await prisma.aluno.create({
      data: {
        userId: studentUser.id,
        professorId: responsible.id,
        contractId: contract.id,
        status: 'ACTIVE_STUDENT',
      },
    });
    ids.student = student.id;
    ids.studentUser = studentUser.id;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "ProfessionalActorMembership"
       ("id", "userId", "contractId", "collaboratorFunctionId", "isActive")
       VALUES ($1, $2, $3, $4, TRUE)`,
      `membership-${suffix}`,
      actorUser.id,
      contract.id,
      actorFunction.id
    );
  });

  afterAll(async () => {
    await prisma.adipometryAuditEvent.deleteMany({ where: { contractId: ids.contract } });
    await prisma.adipometryAssessment.deleteMany({ where: { contractId: ids.contract } });
    await prisma.adipometrySequence.deleteMany({ where: { contractId: ids.contract } });
    await prisma.$executeRawUnsafe(
      'DELETE FROM "ProfessionalActorMembership" WHERE "contractId" IN ($1, $2)',
      ids.contract,
      ids.otherContract
    );
    await prisma.aluno.deleteMany({ where: { contractId: { in: [ids.contract, ids.otherContract] } } });
    await prisma.professor.deleteMany({ where: { contractId: { in: [ids.contract, ids.otherContract] } } });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            ids.actorUser,
            ids.noMembershipUser,
            ids.responsibleUser,
            ids.otherResponsibleUser,
            ids.studentUser,
          ],
        },
      },
    });
    await prisma.collaboratorFunctionOption.deleteMany({
      where: { contractId: { in: [ids.contract, ids.otherContract] } },
    });
    await prisma.companyContract.deleteMany({
      where: { id: { in: [ids.contract, ids.otherContract] } },
    });
    await prisma.$disconnect();
  });

  it('autoriza o ator pelo vínculo próprio e exige responsável elegível separado', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ email: ids.actorEmail, password })
      .expect(200);
    expect(login.body.data.user.professor).toBeNull();
    expect(login.body.data.user.accessControl.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockKey: 'physicalAssessment.adpt.actions.manage',
          canView: true,
        }),
      ])
    );

    const authorization = `Bearer ${bearer(ids.actorUser)}`;
    const responsibles = await request(app)
      .get('/adipometry/responsible-professors')
      .set('Authorization', authorization)
      .expect(200);
    expect(responsibles.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ids.responsible })])
    );

    const students = await request(app)
      .get('/adipometry/accessible-students')
      .set('Authorization', authorization)
      .expect(200);
    expect(students.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ids.student })])
    );

    const created = await request(app)
      .post(`/adipometry/alunos/${ids.student}/assessments/with-responsible`)
      .set('Authorization', authorization)
      .send({
        responsibleProfessorId: ids.responsible,
        assessmentDate: '2026-08-05',
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      alunoId: ids.student,
      professorId: ids.responsible,
      contractId: ids.contract,
    });
  });

  it('não usa o responsável selecionado para autorizar ator sem vínculo', async () => {
    await request(app)
      .post(`/adipometry/alunos/${ids.student}/assessments/with-responsible`)
      .set('Authorization', `Bearer ${bearer(ids.noMembershipUser)}`)
      .send({
        responsibleProfessorId: ids.responsible,
        assessmentDate: '2026-08-05',
      })
      .expect(404);
  });

  it('nega vínculo inativo e responsável de outro contrato sem efeitos', async () => {
    await prisma.$executeRawUnsafe(
      'UPDATE "ProfessionalActorMembership" SET "isActive" = FALSE WHERE "userId" = $1',
      ids.actorUser
    );
    await request(app)
      .get('/adipometry/responsible-professors')
      .set('Authorization', `Bearer ${bearer(ids.actorUser)}`)
      .expect(404);
    await prisma.$executeRawUnsafe(
      'UPDATE "ProfessionalActorMembership" SET "isActive" = TRUE WHERE "userId" = $1',
      ids.actorUser
    );

    const before = await prisma.adipometryAssessment.count({ where: { contractId: ids.contract } });
    await request(app)
      .post(`/adipometry/alunos/${ids.student}/assessments/with-responsible`)
      .set('Authorization', `Bearer ${bearer(ids.actorUser)}`)
      .send({
        responsibleProfessorId: ids.otherResponsible,
        assessmentDate: '2026-08-05',
      })
      .expect(404);
    const after = await prisma.adipometryAssessment.count({ where: { contractId: ids.contract } });
    expect(after).toBe(before);
  });
});
