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
    $executeRaw: jest.fn().mockResolvedValue(0),
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

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowIndex: 0,
          available: false,
          code: 'STUDENT_FIXED_SLOT_CONFLICT',
          stage: 'student',
        }),
        expect.objectContaining({
          rowIndex: 1,
          available: false,
          code: 'STUDENT_FIXED_SLOT_CONFLICT',
          stage: 'student',
        }),
      ])
    );
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

  it('uses maximum concurrent occupancy instead of counting disjoint overlaps', async () => {
    const db = databaseMock();
    db.trainingSpace.findFirst.mockResolvedValue({ id: 'space-1', capacity: 2, isActive: true });
    db.fixedScheduleSlot.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { startTime: '08:00', endTime: '08:30' },
        { startTime: '08:30', endTime: '09:00' },
      ]);

    const [result] = await checkFixedScheduleAvailability(
      db as never,
      'contract-1',
      'aluno-1',
      [slot()]
    );

    expect(result).toMatchObject({ available: true, code: 'AVAILABLE' });
  });

  it('accepts contiguous availability blocks that cover the complete interval', async () => {
    const db = databaseMock();
    db.professorAvailability.findMany.mockResolvedValue([
      { startTime: '08:00', endTime: '08:30' },
      { startTime: '08:30', endTime: '09:00' },
    ]);

    const [result] = await checkFixedScheduleAvailability(
      db as never,
      'contract-1',
      'aluno-1',
      [slot()]
    );

    expect(result).toMatchObject({ available: true, code: 'AVAILABLE' });
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

  it('does not write plan or slots when the final validation fails', async () => {
    const db = databaseMock();
    db.trainingSpace.findFirst.mockResolvedValue({ id: 'space-1', capacity: 1, isActive: true });
    db.fixedScheduleSlot.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ startTime: '08:30', endTime: '09:30' }]);

    await expect(
      syncStudentFixedSchedule(db as never, 'contract-1', 'aluno-1', 'fixed', [slot()])
    ).rejects.toMatchObject({ code: 'SPACE_CAPACITY_FULL' });

    expect(db.fixedScheduleSlot.create).not.toHaveBeenCalled();
    expect(db.fixedScheduleSlot.update).not.toHaveBeenCalled();
    expect(db.fixedScheduleSlot.updateMany).not.toHaveBeenCalled();
    expect(db.aluno.update).not.toHaveBeenCalled();
  });

  it('distinguishes a save-time availability change from its original reason', async () => {
    const db = databaseMock();
    db.trainingSpace.findFirst.mockResolvedValue({ id: 'space-1', capacity: 1, isActive: true });
    db.fixedScheduleSlot.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ startTime: '08:30', endTime: '09:30' }]);

    await expect(
      syncStudentFixedSchedule(db as never, 'contract-1', 'aluno-1', 'fixed', [
        slot({ availabilityConfirmed: true }),
      ])
    ).rejects.toMatchObject({
      code: 'FIXED_SCHEDULE_CHANGED',
      reasonCode: 'SPACE_CAPACITY_FULL',
    });
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

    expect(db.$executeRaw).toHaveBeenCalled();
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
