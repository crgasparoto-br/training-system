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

const invalidDateCases = [
  { name: 'missing', includeField: false, value: undefined },
  { name: 'null', includeField: true, value: null },
  { name: 'empty string', includeField: true, value: '' },
  { name: 'blank string', includeField: true, value: '   ' },
  { name: 'invalid string', includeField: true, value: 'not-a-date' },
  { name: 'normalized invalid ISO date', includeField: true, value: '2026-02-31' },
  { name: 'normalized invalid non-leap date', includeField: true, value: '2025-02-29' },
  { name: 'normalized invalid legacy numeric date', includeField: true, value: '02/31/2026' },
  { name: 'normalized invalid textual date', includeField: true, value: 'Feb 29, 2025' },
  { name: 'numeric-only string', includeField: true, value: '0' },
  { name: 'number', includeField: true, value: 0 },
  { name: 'object', includeField: true, value: { year: 2026, month: 9, day: 14 } },
] as const;

const validDateCases = [
  { name: 'valid leap day', value: '2024-02-29T12:00:00.000Z' },
  { name: 'valid RFC 2822 date', value: 'Mon, 14 Sep 2026 12:00:00 GMT' },
  { name: 'valid legacy numeric date', value: '09/14/2026' },
] as const;

describe('workout routes date normalization', () => {
  const app = express();

  app.use(express.json());
  app.use('/workout', workoutRouter);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('converts a valid weekStartDate string to Date without changing sibling fields or instant', async () => {
    const payload = {
      planId: 'plan-1',
      mesocycleNumber: 2,
      weekNumber: 3,
      weekStartDate: '2026-09-14T09:00:00.000-03:00',
      cyclicFrequency: 2,
      totalVolumeMin: 45,
      observation1: 'preserve this value',
    };
    (workoutService.getOrCreateTemplate as jest.Mock).mockResolvedValue({ id: 'template-1' });

    const response = await request(app).post('/workout/templates/get-or-create').send(payload);

    expect(response.status).toBe(200);
    expect(workoutService.getOrCreateTemplate).toHaveBeenCalledTimes(1);

    const serviceInput = (workoutService.getOrCreateTemplate as jest.Mock).mock.calls[0][0];
    expect(serviceInput).toEqual({
      ...payload,
      weekStartDate: expect.any(Date),
    });
    expect(serviceInput.weekStartDate.getTime()).toBe(Date.parse(payload.weekStartDate));
  });

  it.each(validDateCases)('accepts $name without narrowing the contract to ISO-only', async ({ value }) => {
    const payload = {
      planId: 'plan-1',
      mesocycleNumber: 1,
      weekNumber: 1,
      weekStartDate: value,
    };
    (workoutService.getOrCreateTemplate as jest.Mock).mockResolvedValue({ id: 'template-1' });

    const response = await request(app).post('/workout/templates/get-or-create').send(payload);

    expect(response.status).toBe(200);
    expect(workoutService.getOrCreateTemplate).toHaveBeenCalledTimes(1);
    const serviceInput = (workoutService.getOrCreateTemplate as jest.Mock).mock.calls[0][0];
    expect(serviceInput.weekStartDate).toBeInstanceOf(Date);
    expect(serviceInput.weekStartDate.getTime()).toBe(Date.parse(value));
  });

  it.each(invalidDateCases)(
    'rejects $name weekStartDate before calling get-or-create service',
    async ({ includeField, value }) => {
      const payload: Record<string, unknown> = {
        planId: 'plan-1',
        mesocycleNumber: 1,
        weekNumber: 1,
      };
      if (includeField) {
        payload.weekStartDate = value;
      }

      const response = await request(app).post('/workout/templates/get-or-create').send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid weekStartDate' });
      expect(workoutService.getOrCreateTemplate).not.toHaveBeenCalled();
    }
  );

  it('uses the same normalization for a valid template copy date and preserves its instant', async () => {
    (workoutService.copyTemplate as jest.Mock).mockResolvedValue({ id: 'template-copy' });
    const targetWeekStartDate = '2026-09-21T15:00:00.000+03:00';

    const response = await request(app).post('/workout/templates/template-1/copy').send({
      targetWeekNumber: 4,
      targetWeekStartDate,
    });

    expect(response.status).toBe(200);
    expect(workoutService.copyTemplate).toHaveBeenCalledTimes(1);

    const [, targetWeekNumber, parsedTargetWeekStartDate] = (
      workoutService.copyTemplate as jest.Mock
    ).mock.calls[0];
    expect(targetWeekNumber).toBe(4);
    expect(parsedTargetWeekStartDate).toBeInstanceOf(Date);
    expect(parsedTargetWeekStartDate.getTime()).toBe(Date.parse(targetWeekStartDate));
  });

  it.each(invalidDateCases)(
    'rejects $name targetWeekStartDate before calling copy service',
    async ({ includeField, value }) => {
      const payload: Record<string, unknown> = {
        targetWeekNumber: 4,
      };
      if (includeField) {
        payload.targetWeekStartDate = value;
      }

      const response = await request(app).post('/workout/templates/template-1/copy').send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid targetWeekStartDate' });
      expect(workoutService.copyTemplate).not.toHaveBeenCalled();
    }
  );
});
