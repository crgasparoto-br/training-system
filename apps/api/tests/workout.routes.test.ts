import express from 'express';
import workoutRouter from '../src/routes/workout.routes';
import { workoutService } from '../src/modules/workout/workout.service';

const request = require('supertest');

jest.mock('../src/modules/workout/workout.service', () => ({
  workoutService: {
    getOrCreateTemplate: jest.fn(),
    copyTemplate: jest.fn(),
  },
}));

describe('workout routes date normalization', () => {
  const app = express();

  app.use(express.json());
  app.use('/workout', workoutRouter);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('converts weekStartDate from ISO string to Date before get-or-create service call', async () => {
    const payload = {
      planId: 'plan-1',
      mesocycleNumber: 2,
      weekNumber: 3,
      weekStartDate: '2026-09-14T12:00:00.000Z',
      cyclicFrequency: 2,
    };
    (workoutService.getOrCreateTemplate as jest.Mock).mockResolvedValue({ id: 'template-1' });

    const response = await request(app).post('/workout/templates/get-or-create').send(payload);

    expect(response.status).toBe(200);
    expect(workoutService.getOrCreateTemplate).toHaveBeenCalledTimes(1);

    const serviceInput = (workoutService.getOrCreateTemplate as jest.Mock).mock.calls[0][0];
    expect(serviceInput).toMatchObject({
      planId: payload.planId,
      mesocycleNumber: payload.mesocycleNumber,
      weekNumber: payload.weekNumber,
      cyclicFrequency: payload.cyclicFrequency,
    });
    expect(serviceInput.weekStartDate).toBeInstanceOf(Date);
    expect(serviceInput.weekStartDate.toISOString()).toBe(payload.weekStartDate);
  });

  it('rejects invalid weekStartDate before calling get-or-create service', async () => {
    const response = await request(app).post('/workout/templates/get-or-create').send({
      planId: 'plan-1',
      mesocycleNumber: 1,
      weekNumber: 1,
      weekStartDate: 'not-a-date',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid weekStartDate' });
    expect(workoutService.getOrCreateTemplate).not.toHaveBeenCalled();
  });

  it('uses the same date normalization for template copy', async () => {
    (workoutService.copyTemplate as jest.Mock).mockResolvedValue({ id: 'template-copy' });

    const response = await request(app).post('/workout/templates/template-1/copy').send({
      targetWeekNumber: 4,
      targetWeekStartDate: '2026-09-21T12:00:00.000Z',
    });

    expect(response.status).toBe(200);
    expect(workoutService.copyTemplate).toHaveBeenCalledTimes(1);

    const [, targetWeekNumber, targetWeekStartDate] = (workoutService.copyTemplate as jest.Mock)
      .mock.calls[0];
    expect(targetWeekNumber).toBe(4);
    expect(targetWeekStartDate).toBeInstanceOf(Date);
    expect(targetWeekStartDate.toISOString()).toBe('2026-09-21T12:00:00.000Z');
  });
});
