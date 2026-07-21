import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import {
  syncStudentFixedSchedule,
  type FixedScheduleSlotInput,
} from '../src/modules/agenda/fixed-schedule.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractId = 'issue-265-fixed-schedule-contract';
const emailPrefix = 'issue-265-fixed-schedule-';

async function cleanupFixture() {
  await prisma.companyContract.deleteMany({ where: { id: contractId } });
  await prisma.user.deleteMany({
    where: { email: { startsWith: emailPrefix } },
  });
}

async function seedFixture(capacity = 1) {
  await prisma.companyContract.create({
    data: {
      id: contractId,
      type: ContractType.academy,
      document: '26500000000199',
      name: 'Academia Issue 265',
    },
  });
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Professor',
      code: 'issue-265-professor',
      isActive: true,
    },
  });
  const space = await prisma.trainingSpace.create({
    data: {
      contractId,
      name: 'Sala principal',
      capacity,
    },
  });

  const createProfessorAndStudent = async (index: number) => {
    const professorUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}professor-${index}@example.com`,
        passwordHash: 'test-hash',
        type: UserType.professor,
        profile: { create: { name: `Professor ${index}` } },
      },
    });
    const professor = await prisma.professor.create({
      data: {
        userId: professorUser.id,
        contractId,
        collaboratorFunctionId: collaboratorFunction.id,
        role: ProfessorRole.professor,
      },
    });
    await prisma.professorAvailability.createMany({
      data: [1, 2, 3].map((dayOfWeek) => ({
        professorId: professor.id,
        dayOfWeek,
        startTime: '07:00',
        endTime: '12:00',
      })),
    });

    const studentUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}student-${index}@example.com`,
        passwordHash: 'test-hash',
        type: UserType.aluno,
        profile: { create: { name: `Aluno ${index}` } },
      },
    });
    const aluno = await prisma.aluno.create({
      data: {
        userId: studentUser.id,
        professorId: professor.id,
        schedulePlan: 'free',
        age: 30 + index,
      },
    });
    return { professor, aluno };
  };

  const first = await createProfessorAndStudent(1);
  const second = await createProfessorAndStudent(2);
  return { space, first, second };
}

function fixedSlot(
  professorId: string,
  spaceId: string,
  overrides: Partial<FixedScheduleSlotInput> = {}
): FixedScheduleSlotInput {
  return {
    clientKey: 'row-1',
    professorId,
    spaceId,
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '09:00',
    ...overrides,
  };
}

describeDatabase('fixed schedule transactional behavior', () => {
  beforeEach(cleanupFixture);
  afterEach(cleanupFixture);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows only one concurrent reservation for the last space capacity', async () => {
    const fixture = await seedFixture(1);

    const reserve = (alunoId: string, professorId: string) =>
      prisma.$transaction((tx) =>
        syncStudentFixedSchedule(tx, contractId, alunoId, 'fixed', [
          fixedSlot(professorId, fixture.space.id),
        ])
      );

    const outcomes = await Promise.allSettled([
      reserve(fixture.first.aluno.id, fixture.first.professor.id),
      reserve(fixture.second.aluno.id, fixture.second.professor.id),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected'
    );
    expect(rejected?.reason).toEqual(
      expect.objectContaining({ code: 'SPACE_CAPACITY_FULL' })
    );
    await expect(
      prisma.fixedScheduleSlot.count({
        where: { spaceId: fixture.space.id, dayOfWeek: 1, isActive: true },
      })
    ).resolves.toBe(1);
  });

  it('allows editing the own slot at capacity one without treating it as a competitor', async () => {
    const fixture = await seedFixture(1);
    const initial = await prisma.$transaction((tx) =>
      syncStudentFixedSchedule(tx, contractId, fixture.first.aluno.id, 'fixed', [
        fixedSlot(fixture.first.professor.id, fixture.space.id),
      ])
    );

    await expect(
      prisma.$transaction((tx) =>
        syncStudentFixedSchedule(tx, contractId, fixture.first.aluno.id, 'fixed', [
          fixedSlot(fixture.first.professor.id, fixture.space.id, {
            id: initial.slots[0].id,
            clientKey: initial.slots[0].id,
            startTime: '08:15',
            endTime: '09:15',
          }),
        ])
      )
    ).resolves.toMatchObject({ schedulePlan: 'fixed' });

    await expect(
      prisma.fixedScheduleSlot.count({
        where: { alunoId: fixture.first.aluno.id, isActive: true },
      })
    ).resolves.toBe(1);
  });

  it('rolls back the complete set when one desired row becomes invalid', async () => {
    const fixture = await seedFixture(2);

    await expect(
      prisma.$transaction((tx) =>
        syncStudentFixedSchedule(tx, contractId, fixture.first.aluno.id, 'fixed', [
          fixedSlot(fixture.first.professor.id, fixture.space.id),
          fixedSlot(fixture.first.professor.id, 'missing-space', {
            clientKey: 'row-2',
            dayOfWeek: 2,
          }),
        ])
      )
    ).rejects.toEqual(expect.objectContaining({ code: 'SPACE_NOT_FOUND' }));

    const [aluno, slotCount] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: fixture.first.aluno.id } }),
      prisma.fixedScheduleSlot.count({ where: { alunoId: fixture.first.aluno.id } }),
    ]);
    expect(aluno.schedulePlan).toBe('free');
    expect(slotCount).toBe(0);
  });

  it('updates, creates and inactivates the complete set without deleting history', async () => {
    const fixture = await seedFixture(3);
    const initial = await prisma.$transaction((tx) =>
      syncStudentFixedSchedule(tx, contractId, fixture.first.aluno.id, 'fixed', [
        fixedSlot(fixture.first.professor.id, fixture.space.id),
        fixedSlot(fixture.first.professor.id, fixture.space.id, {
          clientKey: 'row-2',
          dayOfWeek: 2,
        }),
      ])
    );
    const [retained, removed] = initial.slots;

    await prisma.$transaction((tx) =>
      syncStudentFixedSchedule(tx, contractId, fixture.first.aluno.id, 'fixed', [
        fixedSlot(fixture.first.professor.id, fixture.space.id, {
          id: retained.id,
          clientKey: retained.id,
          startTime: '09:00',
          endTime: '10:00',
        }),
        fixedSlot(fixture.first.professor.id, fixture.space.id, {
          clientKey: 'row-3',
          dayOfWeek: 3,
        }),
      ])
    );

    const allSlots = await prisma.fixedScheduleSlot.findMany({
      where: { alunoId: fixture.first.aluno.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(allSlots).toHaveLength(3);
    expect(allSlots.find((item) => item.id === retained.id)).toMatchObject({
      startTime: '09:00',
      endTime: '10:00',
      isActive: true,
    });
    expect(allSlots.find((item) => item.id === removed.id)?.isActive).toBe(false);
    expect(allSlots.filter((item) => item.isActive)).toHaveLength(2);
  });

  it('rejects duplicate ids and preserves the persisted active recurrence unchanged', async () => {
    const fixture = await seedFixture(2);
    const initial = await prisma.$transaction((tx) =>
      syncStudentFixedSchedule(tx, contractId, fixture.first.aluno.id, 'fixed', [
        fixedSlot(fixture.first.professor.id, fixture.space.id),
      ])
    );
    const original = initial.slots[0];

    await expect(
      prisma.$transaction((tx) =>
        syncStudentFixedSchedule(tx, contractId, fixture.first.aluno.id, 'fixed', [
          fixedSlot(fixture.first.professor.id, fixture.space.id, {
            id: original.id,
            clientKey: 'duplicate-row-1',
            startTime: '09:00',
            endTime: '10:00',
          }),
          fixedSlot(fixture.first.professor.id, fixture.space.id, {
            id: original.id,
            clientKey: 'duplicate-row-2',
            dayOfWeek: 2,
          }),
        ])
      )
    ).rejects.toEqual(expect.objectContaining({ code: 'FIXED_SLOT_ID_DUPLICATE' }));

    const [persisted, activeCount, aluno] = await Promise.all([
      prisma.fixedScheduleSlot.findUniqueOrThrow({ where: { id: original.id } }),
      prisma.fixedScheduleSlot.count({
        where: { alunoId: fixture.first.aluno.id, isActive: true },
      }),
      prisma.aluno.findUniqueOrThrow({ where: { id: fixture.first.aluno.id } }),
    ]);
    expect(persisted).toMatchObject({
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '09:00',
      isActive: true,
    });
    expect(activeCount).toBe(1);
    expect(aluno.schedulePlan).toBe('fixed');
  });

  it('rejects reuse of an inactive historical id and creates a new id when the recurrence returns', async () => {
    const fixture = await seedFixture(2);
    const initial = await prisma.$transaction((tx) =>
      syncStudentFixedSchedule(tx, contractId, fixture.first.aluno.id, 'fixed', [
        fixedSlot(fixture.first.professor.id, fixture.space.id),
      ])
    );
    const historical = initial.slots[0];

    await prisma.$transaction((tx) =>
      syncStudentFixedSchedule(tx, contractId, fixture.first.aluno.id, 'free', [], {
        confirmKeepFutureBookings: true,
      })
    );

    await expect(
      prisma.$transaction((tx) =>
        syncStudentFixedSchedule(tx, contractId, fixture.first.aluno.id, 'fixed', [
          fixedSlot(fixture.first.professor.id, fixture.space.id, {
            id: historical.id,
            clientKey: historical.id,
            startTime: '09:00',
            endTime: '10:00',
          }),
        ])
      )
    ).rejects.toEqual(expect.objectContaining({ code: 'FIXED_SLOT_INACTIVE' }));

    const [afterRejectedReuse, alunoAfterRejectedReuse, activeAfterRejectedReuse] =
      await Promise.all([
        prisma.fixedScheduleSlot.findUniqueOrThrow({ where: { id: historical.id } }),
        prisma.aluno.findUniqueOrThrow({ where: { id: fixture.first.aluno.id } }),
        prisma.fixedScheduleSlot.count({
          where: { alunoId: fixture.first.aluno.id, isActive: true },
        }),
      ]);
    expect(afterRejectedReuse).toMatchObject({
      startTime: '08:00',
      endTime: '09:00',
      isActive: false,
    });
    expect(alunoAfterRejectedReuse.schedulePlan).toBe('free');
    expect(activeAfterRejectedReuse).toBe(0);

    const recreated = await prisma.$transaction((tx) =>
      syncStudentFixedSchedule(tx, contractId, fixture.first.aluno.id, 'fixed', [
        fixedSlot(fixture.first.professor.id, fixture.space.id, {
          clientKey: 'new-recurrence',
          startTime: '09:00',
          endTime: '10:00',
        }),
      ])
    );

    expect(recreated.slots).toHaveLength(1);
    expect(recreated.slots[0].id).not.toBe(historical.id);
    const allSlots = await prisma.fixedScheduleSlot.findMany({
      where: { alunoId: fixture.first.aluno.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(allSlots).toHaveLength(2);
    expect(allSlots.find((item) => item.id === historical.id)?.isActive).toBe(false);
    expect(allSlots.find((item) => item.id === recreated.slots[0].id)?.isActive).toBe(true);
  });

});
