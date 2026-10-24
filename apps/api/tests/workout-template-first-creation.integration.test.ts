import express from 'express';

const request = require('supertest');

const mockPrisma = {
  workoutTemplate: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const mockRuntimePrisma = {
  professor: { findUnique: jest.fn() },
  trainingPlan: { findFirst: jest.fn() },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock('../src/common/prisma-runtime-client', () => ({
  prismaRuntimeClient: mockRuntimePrisma,
}));

jest.mock('../src/modules/auth/auth.service', () => ({
  authService: {
    verifyToken: jest.fn(() => ({ type: 'professor', userId: 'professor-user-1' })),
  },
}));

const workoutRouter = require('../src/routes/workout.routes').default;

describe('WorkoutBuilder2 first template creation regression', () => {
  const app = express();

  app.use(express.json());
  app.use('/workout', workoutRouter);

  beforeEach(() => {
    jest.clearAllMocks();
    mockRuntimePrisma.professor.findUnique.mockResolvedValue({
      id: 'professor-1',
      contractId: 'contract-1',
      role: 'master',
      currentStatus: 'active',
      dismissalDate: null,
      user: { isActive: true },
      contract: { type: 'academy' },
    });
    mockRuntimePrisma.trainingPlan.findFirst.mockResolvedValue({ id: 'plan-1' });
    mockPrisma.workoutTemplate.findUnique.mockResolvedValue(null);
    mockPrisma.workoutTemplate.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        id: 'template-1',
        ...args.data,
        studentGoal: null,
        plan: { id: 'plan-1' },
        workoutDays: [],
      })
    );
  });

  it('accepts the canonical web payload and reaches Prisma create with a Date', async () => {
    const payload = {
      planId: 'plan-1',
      mesocycleNumber: 1,
      weekNumber: 1,
      weekStartDate: '2026-09-14T12:00:00.000Z',
    };

    const response = await request(app)
      .post('/workout/templates/get-or-create')
      .set('Authorization', 'Bearer professor-test-token')
      .send(payload);

    expect(response.status).toBe(200);
    expect(mockRuntimePrisma.professor.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'professor-user-1' } })
    );
    expect(mockRuntimePrisma.trainingPlan.findFirst).toHaveBeenCalledWith({
      where: { id: 'plan-1', aluno: { contractId: 'contract-1' } },
      select: { id: true },
    });
    expect(mockPrisma.workoutTemplate.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.workoutTemplate.create).toHaveBeenCalledTimes(1);

    const createArgs = mockPrisma.workoutTemplate.create.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({
      planId: payload.planId,
      mesocycleNumber: payload.mesocycleNumber,
      weekNumber: payload.weekNumber,
    });
    expect(createArgs.data.weekStartDate).toBeInstanceOf(Date);
    expect((createArgs.data.weekStartDate as Date).getTime()).toBe(Date.parse(payload.weekStartDate));
  });

  it('rejects first creation without authentication before checking plan scope', async () => {
    const response = await request(app).post('/workout/templates/get-or-create').send({
      planId: 'plan-1', mesocycleNumber: 1, weekNumber: 1,
      weekStartDate: '2026-09-14T12:00:00.000Z',
    });

    expect(response.status).toBe(401);
    expect(mockRuntimePrisma.trainingPlan.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.workoutTemplate.create).not.toHaveBeenCalled();
  });

  it('rejects first creation for an inactive professor', async () => {
    mockRuntimePrisma.professor.findUnique.mockResolvedValueOnce({
      id: 'professor-1',
      contractId: 'contract-1',
      role: 'master',
      currentStatus: 'inactive',
      dismissalDate: null,
      user: { isActive: true },
      contract: { type: 'academy' },
    });

    const response = await request(app).post('/workout/templates/get-or-create')
      .set('Authorization', 'Bearer professor-test-token')
      .send({ planId: 'plan-1', mesocycleNumber: 1, weekNumber: 1,
        weekStartDate: '2026-09-14T12:00:00.000Z' });

    expect(response.status).toBe(404);
    expect(mockRuntimePrisma.trainingPlan.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.workoutTemplate.create).not.toHaveBeenCalled();
  });

  it('rejects first creation when the plan is outside the authenticated contract', async () => {
    mockRuntimePrisma.trainingPlan.findFirst.mockResolvedValueOnce(null);

    const response = await request(app).post('/workout/templates/get-or-create')
      .set('Authorization', 'Bearer professor-test-token')
      .send({ planId: 'plan-foreign', mesocycleNumber: 1, weekNumber: 1,
        weekStartDate: '2026-09-14T12:00:00.000Z' });

    expect(response.status).toBe(404);
    expect(mockRuntimePrisma.trainingPlan.findFirst).toHaveBeenCalledWith({
      where: { id: 'plan-foreign', aluno: { contractId: 'contract-1' } },
      select: { id: true },
    });
    expect(mockPrisma.workoutTemplate.create).not.toHaveBeenCalled();
  });
});
