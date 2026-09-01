import express from 'express';
import workoutRouter from '../src/routes/workout.routes';

const request = require('supertest');

const mockPrisma = {
  workoutTemplate: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

describe('WorkoutBuilder2 first template creation regression', () => {
  const app = express();

  app.use(express.json());
  app.use('/workout', workoutRouter);

  beforeEach(() => {
    jest.clearAllMocks();
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

    const response = await request(app).post('/workout/templates/get-or-create').send(payload);

    expect(response.status).toBe(200);
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
});
