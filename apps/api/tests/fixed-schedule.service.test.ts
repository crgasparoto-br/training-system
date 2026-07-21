import {
  checkFixedScheduleAvailability,
  fixedScheduleOverlaps,
  syncStudentFixedSchedule,
  type FixedScheduleSlotInput,
} from '../src/modules/agenda/fixed-schedule.service';

const slot = (overrides: Partial<FixedScheduleSlotInput> = {}): FixedScheduleSlotInput => ({
  clientKey: 'row-1',
  professorId: 'professor-1',
  spaceId: 'space-1',
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '09:00',
  ...overrides,
});

function databaseMock() {
  return {
    aluno: {
      findFirst: jest.fn().mockResolvedValue({ id: 'aluno-1', schedulePlan: 'fixed' }),
      update: jest.fn().mockResolvedValue({ id: 'aluno-1' }),
    },
    trainingSpace: {
      findFirst: jest.fn().mockResolvedValue({ id: 'space-1', capacity: 2, isActive: true }),
    },
    professor: {
      findFirst: jest.fn().mockResolvedValue({ id: 'professor-1', user: { isActive: true } }),
    },
    professorAvailability: {
      findMany: jest.fn().mockResolvedValue([{ startTime: '07:00', endTime: '12:00' }]),
    },
    fixedScheduleSlot: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'created-slot' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    agendaBooking: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

describe('fixed schedule canonical validation', () => {
  it('accepts adjacent intervals and rejects only real overlap', () => {
    expect(fixedScheduleOverlaps('08:00', '09:00', '09:00', '10:00')).toBe(false);
    expect(fixedScheduleOverlaps('08:00', '09:01', '09:00', '10:00')).toBe(true);
  });

  it('stops at the academy step and does not classify the professor when the space is missing', async () => {
    const db = databaseMock();
    db.trainingSpace.findFirst.mockResolvedValue(null);

    const [result] = await checkFixedScheduleAvailability(
      db as never,
      'contract-1',
      'aluno-1',
      [slot()]
    );

    expect(result).toMatchObject({
      available: false,
      code: 'SPACE_NOT_FOUND',
      stage: 'space',
    });
    expect(db.professor.findFirst).not.toHaveBeenCalled();
  });

  it('reports capacity before consulting the professor', async () => {
    const db = databaseMock();
    db.trainingSpace.findFirst.mockResolvedValue({ id: 'space-1', capacity: 1, isActive: true });
    db.fixedScheduleSlot.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ startTime: '08:30', endTime: '09:30' }]);

    const [result] = await checkFixedScheduleAvailability(
      db as never,
      'contract-1',
      'aluno-1',
      [slot()]
    );

    expect(result.code).toBe('SPACE_CAPACITY_FULL');
    expect(db.professor.findFirst).not.toHaveBeenCalled();
  });

  it('rejects overlapping desired rows for the same student even with different resources', async () => {
    const db = databaseMock();

    const results = await checkFixedScheduleAvailability(
      db as never,
      'contract-1',
      'aluno-1',
      [
        slot(),
        slot({
          clientKey: 'row-2',
          professorId: 'professor-2',
          spaceId: 'space-2',
          startTime: '08:30',
          endTime: '09:30',
        }),
      ]
    );

    expect(results[1]).toMatchObject({
      available: false,
      code: 'STUDENT_FIXED_SLOT_CONFLICT',
      stage: 'student',
    });
  });

  it('returns available only after space and professor validations pass', async () => {
    const db = databaseMock();

    const [result] = await checkFixedScheduleAvailability(
      db as never,
      'contract-1',
      'aluno-1',
      [slot()]
    );

    expect(result).toMatchObject({ available: true, code: 'AVAILABLE' });
    expect(db.trainingSpace.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'space-1', contractId: 'contract-1' } })
    );
    expect(db.professor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'professor-1', contractId: 'contract-1' } })
    );
  });

  it('requires explicit confirmation before changing fixed to free with future bookings', async () => {
    const db = databaseMock();
    db.fixedScheduleSlot.findMany.mockResolvedValue([
      {
        id: 'slot-1',
        alunoId: 'aluno-1',
        professorId: 'professor-1',
        spaceId: 'space-1',
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
        notes: null,
        isActive: true,
      },
    ]);
    db.agendaBooking.count.mockResolvedValue(1);

    await expect(
      syncStudentFixedSchedule(db as never, 'contract-1', 'aluno-1', 'free', [])
    ).rejects.toMatchObject({ code: 'FUTURE_BOOKINGS_CONFIRMATION_REQUIRED' });
    expect(db.fixedScheduleSlot.updateMany).not.toHaveBeenCalled();
  });

  it('locks competing resources before the final validation and persists the complete set', async () => {
    const db = databaseMock();

    await syncStudentFixedSchedule(
      db as never,
      'contract-1',
      'aluno-1',
      'fixed',
      [slot()]
    );

    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.fixedScheduleSlot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alunoId: 'aluno-1',
          professorId: 'professor-1',
          spaceId: 'space-1',
        }),
      })
    );
    expect(db.aluno.update).toHaveBeenCalledWith({
      where: { id: 'aluno-1' },
      data: { schedulePlan: 'fixed' },
    });
  });
});
