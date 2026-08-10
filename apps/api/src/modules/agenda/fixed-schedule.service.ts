import { Prisma, PrismaClient, type AgendaBookingStatus } from '@prisma/client';

type FixedScheduleDb = Prisma.TransactionClient | PrismaClient;

export type FixedScheduleErrorCode =
  | 'FIXED_SCHEDULE_REQUIRED'
  | 'INVALID_DAY_OF_WEEK'
  | 'INVALID_TIME_RANGE'
  | 'SPACE_NOT_FOUND'
  | 'SPACE_INACTIVE'
  | 'SPACE_CAPACITY_FULL'
  | 'PROFESSOR_NOT_FOUND'
  | 'PROFESSOR_INACTIVE'
  | 'PROFESSOR_OUTSIDE_AVAILABILITY'
  | 'PROFESSOR_FIXED_SLOT_CONFLICT'
  | 'PROFESSOR_BOOKING_CONFLICT'
  | 'STUDENT_FIXED_SLOT_CONFLICT'
  | 'FIXED_SLOT_NOT_FOUND'
  | 'FIXED_SLOT_INACTIVE'
  | 'FIXED_SLOT_ID_DUPLICATE'
  | 'FIXED_TO_FREE_CONFIRMATION_REQUIRED'
  | 'FUTURE_BOOKINGS_CONFIRMATION_REQUIRED'
  | 'FIXED_SCHEDULE_CHANGED';

export type FixedScheduleValidationStage = 'schedule' | 'student' | 'space' | 'professor';

export interface FixedScheduleSlotInput {
  id?: string;
  clientKey?: string;
  professorId: string;
  spaceId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  notes?: string | null;
  availabilityConfirmed?: boolean;
}

export interface FixedScheduleAvailabilityResult {
  rowIndex: number;
  slotId?: string;
  clientKey?: string;
  available: boolean;
  code: FixedScheduleErrorCode | 'AVAILABLE';
  message: string;
  stage: FixedScheduleValidationStage;
}

export class FixedScheduleError extends Error {
  readonly code: FixedScheduleErrorCode;
  readonly stage: FixedScheduleValidationStage;
  readonly rowIndex?: number;
  readonly statusCode: number;
  readonly reasonCode?: FixedScheduleErrorCode;

  constructor(
    code: FixedScheduleErrorCode,
    message: string,
    options: {
      stage: FixedScheduleValidationStage;
      rowIndex?: number;
      statusCode?: number;
      reasonCode?: FixedScheduleErrorCode;
    }
  ) {
    super(message);
    this.name = 'FixedScheduleError';
    this.code = code;
    this.stage = options.stage;
    this.rowIndex = options.rowIndex;
    this.statusCode = options.statusCode ?? 409;
    this.reasonCode = options.reasonCode;
  }
}

const ACTIVE_BOOKING_STATUSES: AgendaBookingStatus[] = ['scheduled'];

const MESSAGES: Record<FixedScheduleErrorCode, string> = {
  FIXED_SCHEDULE_REQUIRED: 'Informe ao menos um horário recorrente para o plano de agenda fixa.',
  INVALID_DAY_OF_WEEK: 'Selecione um dia da semana válido.',
  INVALID_TIME_RANGE: 'O horário final deve ser maior que o horário inicial.',
  SPACE_NOT_FOUND: 'O espaço selecionado não pertence a esta academia.',
  SPACE_INACTIVE: 'O espaço selecionado está inativo.',
  SPACE_CAPACITY_FULL: 'A academia não possui vaga disponível nesse espaço durante todo o período.',
  PROFESSOR_NOT_FOUND: 'O professor selecionado não pertence a esta academia.',
  PROFESSOR_INACTIVE: 'O professor selecionado está inativo.',
  PROFESSOR_OUTSIDE_AVAILABILITY: 'O período não está integralmente coberto pela disponibilidade do professor.',
  PROFESSOR_FIXED_SLOT_CONFLICT: 'O professor já possui outro horário fixo nesse período.',
  PROFESSOR_BOOKING_CONFLICT: 'O professor já possui agendamento ativo nesse período.',
  STUDENT_FIXED_SLOT_CONFLICT: 'O aluno possui horários fixos sobrepostos no mesmo dia.',
  FIXED_SLOT_NOT_FOUND: 'O horário fixo informado não pertence a este aluno.',
  FIXED_SLOT_INACTIVE:
    'O horário fixo informado está inativo e não pode ser reutilizado. Crie uma nova recorrência.',
  FIXED_SLOT_ID_DUPLICATE:
    'Cada horário fixo existente pode aparecer apenas uma vez no conjunto enviado.',
  FIXED_TO_FREE_CONFIRMATION_REQUIRED:
    'Confirme a mudança do plano de agenda fixa para agenda livre.',
  FUTURE_BOOKINGS_CONFIRMATION_REQUIRED:
    'Existem agendamentos futuros vinculados aos horários fixos. Confirme que eles serão mantidos antes de mudar para agenda livre.',
  FIXED_SCHEDULE_CHANGED:
    'A disponibilidade mudou desde a última verificação. Revise os horários e tente salvar novamente.',
};

export function normalizeFixedScheduleTime(value: string): string {
  const normalized = value.trim();
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new FixedScheduleError('INVALID_TIME_RANGE', MESSAGES.INVALID_TIME_RANGE, {
      stage: 'schedule',
      statusCode: 400,
    });
  }
  const [hour, minute] = normalized.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new FixedScheduleError('INVALID_TIME_RANGE', MESSAGES.INVALID_TIME_RANGE, {
      stage: 'schedule',
      statusCode: 400,
    });
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function fixedScheduleTimeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function fixedScheduleOverlaps(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return (
    fixedScheduleTimeToMinutes(startA) < fixedScheduleTimeToMinutes(endB) &&
    fixedScheduleTimeToMinutes(startB) < fixedScheduleTimeToMinutes(endA)
  );
}

function hasCapacityForInterval(
  startTime: string,
  endTime: string,
  capacity: number,
  intervals: Array<{ startTime: string; endTime: string }>
): boolean {
  const candidateStart = fixedScheduleTimeToMinutes(startTime);
  const candidateEnd = fixedScheduleTimeToMinutes(endTime);
  const events: Array<{ minute: number; delta: number }> = [];

  intervals.forEach((interval) => {
    const intervalStart = Math.max(candidateStart, fixedScheduleTimeToMinutes(interval.startTime));
    const intervalEnd = Math.min(candidateEnd, fixedScheduleTimeToMinutes(interval.endTime));
    if (intervalStart < intervalEnd) {
      events.push({ minute: intervalStart, delta: 1 });
      events.push({ minute: intervalEnd, delta: -1 });
    }
  });

  events.sort((left, right) => left.minute - right.minute || left.delta - right.delta);
  let occupancy = 0;
  for (const event of events) {
    occupancy += event.delta;
    if (occupancy >= capacity) return false;
  }
  return true;
}

function isIntervalFullyCovered(
  startTime: string,
  endTime: string,
  intervals: Array<{ startTime: string; endTime: string }>
): boolean {
  const targetStart = fixedScheduleTimeToMinutes(startTime);
  const targetEnd = fixedScheduleTimeToMinutes(endTime);
  let coveredUntil = targetStart;

  const ordered = intervals
    .map((interval) => ({
      start: fixedScheduleTimeToMinutes(interval.startTime),
      end: fixedScheduleTimeToMinutes(interval.endTime),
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  for (const interval of ordered) {
    if (interval.end <= coveredUntil) continue;
    if (interval.start > coveredUntil) return false;
    coveredUntil = Math.max(coveredUntil, interval.end);
    if (coveredUntil >= targetEnd) return true;
  }
  return coveredUntil >= targetEnd;
}

function isoDayOfWeek(value: Date): number {
  const day = value.getDay();
  return day === 0 ? 7 : day;
}

function normalizeSlot(slot: FixedScheduleSlotInput, rowIndex: number): FixedScheduleSlotInput {
  if (!Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 1 || slot.dayOfWeek > 7) {
    throw new FixedScheduleError('INVALID_DAY_OF_WEEK', MESSAGES.INVALID_DAY_OF_WEEK, {
      stage: 'schedule',
      rowIndex,
      statusCode: 400,
    });
  }
  const startTime = normalizeFixedScheduleTime(slot.startTime);
  const endTime = normalizeFixedScheduleTime(slot.endTime);
  if (fixedScheduleTimeToMinutes(startTime) >= fixedScheduleTimeToMinutes(endTime)) {
    throw new FixedScheduleError('INVALID_TIME_RANGE', MESSAGES.INVALID_TIME_RANGE, {
      stage: 'schedule',
      rowIndex,
      statusCode: 400,
    });
  }
  return {
    ...slot,
    professorId: slot.professorId.trim(),
    spaceId: slot.spaceId.trim(),
    startTime,
    endTime,
    notes: slot.notes?.trim() || null,
  };
}

function failure(
  error: FixedScheduleError,
  rowIndex: number,
  slot: FixedScheduleSlotInput
): FixedScheduleAvailabilityResult {
  return {
    rowIndex,
    slotId: slot.id,
    clientKey: slot.clientKey,
    available: false,
    code: error.code,
    message: error.message,
    stage: error.stage,
  };
}

async function loadStudent(db: FixedScheduleDb, contractId: string, alunoId: string) {
  const aluno = await db.aluno.findFirst({
    where: { id: alunoId, contractId },
    select: { id: true, schedulePlan: true },
  });
  if (!aluno) {
    throw new FixedScheduleError('FIXED_SLOT_NOT_FOUND', 'Aluno não encontrado nesta academia.', {
      stage: 'student',
      statusCode: 404,
    });
  }
  return aluno;
}

async function loadStudentSlots(db: FixedScheduleDb, contractId: string, alunoId: string) {
  return db.fixedScheduleSlot.findMany({
    where: { alunoId, aluno: { contractId } },
    select: {
      id: true,
      alunoId: true,
      professorId: true,
      spaceId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      notes: true,
      isActive: true,
    },
  });
}

function findStudentRowConflictIndexes(slots: FixedScheduleSlotInput[]): Set<number> {
  const conflicts = new Set<number>();
  for (let left = 0; left < slots.length; left += 1) {
    for (let right = left + 1; right < slots.length; right += 1) {
      if (
        slots[left].dayOfWeek === slots[right].dayOfWeek &&
        fixedScheduleOverlaps(
          slots[left].startTime,
          slots[left].endTime,
          slots[right].startTime,
          slots[right].endTime
        )
      ) {
        conflicts.add(left);
        conflicts.add(right);
      }
    }
  }
  return conflicts;
}

function findDuplicateSlotIdRowIndexes(slots: FixedScheduleSlotInput[]): Set<number> {
  const firstRowById = new Map<string, number>();
  const duplicates = new Set<number>();

  slots.forEach((slot, rowIndex) => {
    if (!slot.id) return;
    const firstRowIndex = firstRowById.get(slot.id);
    if (firstRowIndex === undefined) {
      firstRowById.set(slot.id, rowIndex);
      return;
    }
    duplicates.add(firstRowIndex);
    duplicates.add(rowIndex);
  });

  return duplicates;
}

function validateStudentRows(slots: FixedScheduleSlotInput[]) {
  const firstConflict = [...findStudentRowConflictIndexes(slots)].sort((a, b) => a - b)[0];
  if (firstConflict !== undefined) {
    throw new FixedScheduleError(
      'STUDENT_FIXED_SLOT_CONFLICT',
      MESSAGES.STUDENT_FIXED_SLOT_CONFLICT,
      { stage: 'student', rowIndex: firstConflict }
    );
  }
}

async function validateSingleSlot(
  db: FixedScheduleDb,
  contractId: string,
  alunoId: string | undefined,
  slot: FixedScheduleSlotInput,
  rowIndex: number,
  excludedSlotIds: string[]
) {
  // 1. Academia/espaço. Professor não é consultado quando esta etapa falha.
  const space = await db.trainingSpace.findFirst({
    where: { id: slot.spaceId, contractId },
    select: { id: true, capacity: true, isActive: true },
  });
  if (!space) {
    throw new FixedScheduleError('SPACE_NOT_FOUND', MESSAGES.SPACE_NOT_FOUND, {
      stage: 'space',
      rowIndex,
      statusCode: 404,
    });
  }
  if (!space.isActive) {
    throw new FixedScheduleError('SPACE_INACTIVE', MESSAGES.SPACE_INACTIVE, {
      stage: 'space',
      rowIndex,
    });
  }

  const competingSpaceSlots = await db.fixedScheduleSlot.findMany({
    where: {
      spaceId: slot.spaceId,
      dayOfWeek: slot.dayOfWeek,
      isActive: true,
      ...(excludedSlotIds.length ? { id: { notIn: excludedSlotIds } } : {}),
      professor: { contractId },
    },
    select: { startTime: true, endTime: true },
  });
  if (
    !hasCapacityForInterval(
      slot.startTime,
      slot.endTime,
      space.capacity,
      competingSpaceSlots
    )
  ) {
    throw new FixedScheduleError('SPACE_CAPACITY_FULL', MESSAGES.SPACE_CAPACITY_FULL, {
      stage: 'space',
      rowIndex,
    });
  }

  // 2. Professor.
  const professor = await db.professor.findFirst({
    where: { id: slot.professorId, contractId },
    select: { id: true, user: { select: { isActive: true } } },
  });
  if (!professor) {
    throw new FixedScheduleError('PROFESSOR_NOT_FOUND', MESSAGES.PROFESSOR_NOT_FOUND, {
      stage: 'professor',
      rowIndex,
      statusCode: 404,
    });
  }
  if (!professor.user.isActive) {
    throw new FixedScheduleError('PROFESSOR_INACTIVE', MESSAGES.PROFESSOR_INACTIVE, {
      stage: 'professor',
      rowIndex,
    });
  }

  const availability = await db.professorAvailability.findMany({
    where: { professorId: slot.professorId, dayOfWeek: slot.dayOfWeek, isActive: true },
    select: { startTime: true, endTime: true },
  });
  if (!isIntervalFullyCovered(slot.startTime, slot.endTime, availability)) {
    throw new FixedScheduleError(
      'PROFESSOR_OUTSIDE_AVAILABILITY',
      MESSAGES.PROFESSOR_OUTSIDE_AVAILABILITY,
      { stage: 'professor', rowIndex }
    );
  }

  const competingProfessorSlots = await db.fixedScheduleSlot.findMany({
    where: {
      professorId: slot.professorId,
      dayOfWeek: slot.dayOfWeek,
      isActive: true,
      ...(excludedSlotIds.length ? { id: { notIn: excludedSlotIds } } : {}),
      professor: { contractId },
    },
    select: { startTime: true, endTime: true },
  });
  if (
    competingProfessorSlots.some((item) =>
      fixedScheduleOverlaps(slot.startTime, slot.endTime, item.startTime, item.endTime)
    )
  ) {
    throw new FixedScheduleError(
      'PROFESSOR_FIXED_SLOT_CONFLICT',
      MESSAGES.PROFESSOR_FIXED_SLOT_CONFLICT,
      { stage: 'professor', rowIndex }
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bookings = await db.agendaBooking.findMany({
    where: {
      contractId,
      professorId: slot.professorId,
      status: { in: ACTIVE_BOOKING_STATUSES },
      bookingDate: { gte: today },
      ...(slot.id ? { OR: [{ fixedSlotId: null }, { fixedSlotId: { not: slot.id } }] } : {}),
    },
    select: { bookingDate: true, startTime: true, endTime: true },
  });
  if (
    bookings.some(
      (booking) =>
        isoDayOfWeek(booking.bookingDate) === slot.dayOfWeek &&
        fixedScheduleOverlaps(slot.startTime, slot.endTime, booking.startTime, booking.endTime)
    )
  ) {
    throw new FixedScheduleError(
      'PROFESSOR_BOOKING_CONFLICT',
      MESSAGES.PROFESSOR_BOOKING_CONFLICT,
      { stage: 'professor', rowIndex }
    );
  }

  if (alunoId) {
    const studentSlots = await db.fixedScheduleSlot.findMany({
      where: {
        alunoId,
        dayOfWeek: slot.dayOfWeek,
        isActive: true,
        ...(excludedSlotIds.length ? { id: { notIn: excludedSlotIds } } : {}),
        aluno: { contractId },
      },
      select: { startTime: true, endTime: true },
    });
    if (
      studentSlots.some((item) =>
        fixedScheduleOverlaps(slot.startTime, slot.endTime, item.startTime, item.endTime)
      )
    ) {
      throw new FixedScheduleError(
        'STUDENT_FIXED_SLOT_CONFLICT',
        MESSAGES.STUDENT_FIXED_SLOT_CONFLICT,
        { stage: 'student', rowIndex }
      );
    }
  }
}

export async function checkFixedScheduleAvailability(
  db: FixedScheduleDb,
  contractId: string,
  alunoId: string | undefined,
  rawSlots: FixedScheduleSlotInput[]
): Promise<FixedScheduleAvailabilityResult[]> {
  if (alunoId) await loadStudent(db, contractId, alunoId);

  const normalized: Array<FixedScheduleSlotInput | undefined> = [];
  const earlyErrors = new Map<number, FixedScheduleError>();
  rawSlots.forEach((slot, rowIndex) => {
    try {
      normalized[rowIndex] = normalizeSlot(slot, rowIndex);
    } catch (error) {
      if (error instanceof FixedScheduleError) earlyErrors.set(rowIndex, error);
      else throw error;
    }
  });

  const validRowsWithIndexes = normalized
    .map((slot, originalIndex) => ({ slot, originalIndex }))
    .filter(
      (item): item is { slot: FixedScheduleSlotInput; originalIndex: number } =>
        Boolean(item.slot)
    );
  const validRows = validRowsWithIndexes.map((item) => item.slot);
  findStudentRowConflictIndexes(validRows).forEach((validRowIndex) => {
    const originalIndex = validRowsWithIndexes[validRowIndex].originalIndex;
    earlyErrors.set(
      originalIndex,
      new FixedScheduleError(
        'STUDENT_FIXED_SLOT_CONFLICT',
        MESSAGES.STUDENT_FIXED_SLOT_CONFLICT,
        { stage: 'student', rowIndex: originalIndex }
      )
    );
  });
  findDuplicateSlotIdRowIndexes(validRows).forEach((validRowIndex) => {
    const originalIndex = validRowsWithIndexes[validRowIndex].originalIndex;
    earlyErrors.set(
      originalIndex,
      new FixedScheduleError('FIXED_SLOT_ID_DUPLICATE', MESSAGES.FIXED_SLOT_ID_DUPLICATE, {
        stage: 'student',
        rowIndex: originalIndex,
        statusCode: 400,
      })
    );
  });

  const existing = alunoId ? await loadStudentSlots(db, contractId, alunoId) : [];
  const existingById = new Map(existing.map((item) => [item.id, item]));
  const submittedIds = [
    ...new Set(validRows.map((slot) => slot.id).filter((id): id is string => Boolean(id))),
  ];
  normalized.forEach((slot, rowIndex) => {
    if (earlyErrors.has(rowIndex) || !slot?.id) return;
    const existingSlot = alunoId ? existingById.get(slot.id) : undefined;
    if (!existingSlot) {
      earlyErrors.set(
        rowIndex,
        new FixedScheduleError('FIXED_SLOT_NOT_FOUND', MESSAGES.FIXED_SLOT_NOT_FOUND, {
          stage: 'student',
          rowIndex,
          statusCode: 404,
        })
      );
      return;
    }
    if (!existingSlot.isActive) {
      earlyErrors.set(
        rowIndex,
        new FixedScheduleError('FIXED_SLOT_INACTIVE', MESSAGES.FIXED_SLOT_INACTIVE, {
          stage: 'student',
          rowIndex,
        })
      );
    }
  });

  const removedIds = existing
    .filter((item) => item.isActive && !submittedIds.includes(item.id))
    .map((item) => item.id);
  // Existing submitted rows are replaced by their desired versions above; they are
  // excluded from the persisted snapshot, while every desired row remains represented
  // in the complete-set conflict validation.
  const excludedSlotIds = [...submittedIds, ...removedIds];

  return Promise.all(
    rawSlots.map(async (rawSlot, rowIndex) => {
      const earlyError = earlyErrors.get(rowIndex);
      if (earlyError) return failure(earlyError, rowIndex, rawSlot);
      const slot = normalized[rowIndex]!;
      try {
        await validateSingleSlot(db, contractId, alunoId, slot, rowIndex, excludedSlotIds);
        return {
          rowIndex,
          slotId: slot.id,
          clientKey: slot.clientKey,
          available: true,
          code: 'AVAILABLE',
          message: 'Academia e professor disponíveis para todo o período.',
          stage: 'professor',
        };
      } catch (error) {
        if (error instanceof FixedScheduleError) return failure(error, rowIndex, slot);
        throw error;
      }
    })
  );
}

async function acquireScheduleLocks(
  tx: Prisma.TransactionClient,
  contractId: string,
  alunoId: string,
  slots: FixedScheduleSlotInput[]
) {
  const keys = new Set<string>([`fixed-schedule:${contractId}:student:${alunoId}`]);
  slots.forEach((slot) => {
    keys.add(`fixed-schedule:${contractId}:space:${slot.spaceId}:day:${slot.dayOfWeek}`);
    keys.add(`fixed-schedule:${contractId}:professor:${slot.professorId}:day:${slot.dayOfWeek}`);
  });
  for (const key of [...keys].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}

export async function syncStudentFixedSchedule(
  tx: Prisma.TransactionClient,
  contractId: string,
  alunoId: string,
  schedulePlan: 'free' | 'fixed',
  rawSlots: FixedScheduleSlotInput[],
  options: { confirmKeepFutureBookings?: boolean } = {}
) {
  if (schedulePlan === 'free') {
    await acquireScheduleLocks(tx, contractId, alunoId, []);
    const aluno = await loadStudent(tx, contractId, alunoId);
    const existing = await loadStudentSlots(tx, contractId, alunoId);
    if (aluno.schedulePlan === 'fixed' && !options.confirmKeepFutureBookings) {
      const activeIds = existing.filter((item) => item.isActive).map((item) => item.id);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const futureBookings = activeIds.length
        ? await tx.agendaBooking.count({
            where: {
              fixedSlotId: { in: activeIds },
              bookingDate: { gte: today },
              status: { in: ACTIVE_BOOKING_STATUSES },
            },
          })
        : 0;
      const confirmationCode =
        futureBookings > 0
          ? 'FUTURE_BOOKINGS_CONFIRMATION_REQUIRED'
          : 'FIXED_TO_FREE_CONFIRMATION_REQUIRED';
      throw new FixedScheduleError(confirmationCode, MESSAGES[confirmationCode], {
        stage: 'schedule',
      });
    }
    await tx.fixedScheduleSlot.updateMany({
      where: { alunoId, isActive: true },
      data: { isActive: false },
    });
    await tx.aluno.update({ where: { id: alunoId }, data: { schedulePlan: 'free' } });
    return { schedulePlan: 'free' as const, slots: [], preservedFutureBookings: true };
  }

  if (!rawSlots.length) {
    throw new FixedScheduleError('FIXED_SCHEDULE_REQUIRED', MESSAGES.FIXED_SCHEDULE_REQUIRED, {
      stage: 'schedule',
      statusCode: 400,
    });
  }

  const slots = rawSlots.map(normalizeSlot);
  validateStudentRows(slots);
  const duplicateRowIndex = [...findDuplicateSlotIdRowIndexes(slots)].sort((a, b) => a - b)[0];
  if (duplicateRowIndex !== undefined) {
    throw new FixedScheduleError(
      'FIXED_SLOT_ID_DUPLICATE',
      MESSAGES.FIXED_SLOT_ID_DUPLICATE,
      { stage: 'student', rowIndex: duplicateRowIndex, statusCode: 400 }
    );
  }

  await acquireScheduleLocks(tx, contractId, alunoId, slots);
  const existing = await loadStudentSlots(tx, contractId, alunoId);
  const existingById = new Map(existing.map((item) => [item.id, item]));
  slots.forEach((slot, rowIndex) => {
    if (!slot.id) return;
    const existingSlot = existingById.get(slot.id);
    if (!existingSlot) {
      throw new FixedScheduleError('FIXED_SLOT_NOT_FOUND', MESSAGES.FIXED_SLOT_NOT_FOUND, {
        stage: 'student',
        rowIndex,
        statusCode: 404,
      });
    }
    if (!existingSlot.isActive) {
      throw new FixedScheduleError('FIXED_SLOT_INACTIVE', MESSAGES.FIXED_SLOT_INACTIVE, {
        stage: 'student',
        rowIndex,
      });
    }
  });

  const results = await checkFixedScheduleAvailability(tx, contractId, alunoId, slots);
  const firstFailure = results.find((result) => !result.available);
  if (firstFailure) {
    const reasonCode = firstFailure.code as FixedScheduleErrorCode;
    const checkedRow = slots[firstFailure.rowIndex];
    if (checkedRow?.availabilityConfirmed) {
      throw new FixedScheduleError(
        'FIXED_SCHEDULE_CHANGED',
        `${MESSAGES.FIXED_SCHEDULE_CHANGED} ${firstFailure.message}`,
        {
          stage: firstFailure.stage,
          rowIndex: firstFailure.rowIndex,
          reasonCode,
        }
      );
    }
    throw new FixedScheduleError(reasonCode, firstFailure.message, {
      stage: firstFailure.stage,
      rowIndex: firstFailure.rowIndex,
    });
  }

  const retainedIds: string[] = [];
  for (const slot of slots) {
    if (slot.id) {
      const existingSlot = existingById.get(slot.id);
      if (!existingSlot) {
        throw new FixedScheduleError('FIXED_SLOT_NOT_FOUND', MESSAGES.FIXED_SLOT_NOT_FOUND, {
          stage: 'student',
          statusCode: 404,
        });
      }
      if (!existingSlot.isActive) {
        throw new FixedScheduleError('FIXED_SLOT_INACTIVE', MESSAGES.FIXED_SLOT_INACTIVE, {
          stage: 'student',
        });
      }
      await tx.fixedScheduleSlot.update({
        where: { id: slot.id },
        data: {
          professorId: slot.professorId,
          spaceId: slot.spaceId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          notes: slot.notes,
          isActive: true,
        },
      });
      retainedIds.push(slot.id);
    } else {
      const created = await tx.fixedScheduleSlot.create({
        data: {
          alunoId,
          professorId: slot.professorId,
          spaceId: slot.spaceId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          notes: slot.notes,
          isActive: true,
        },
        select: { id: true },
      });
      retainedIds.push(created.id);
    }
  }

  await tx.fixedScheduleSlot.updateMany({
    where: { alunoId, isActive: true, id: { notIn: retainedIds } },
    data: { isActive: false },
  });
  await tx.aluno.update({ where: { id: alunoId }, data: { schedulePlan: 'fixed' } });
  const savedSlots = await tx.fixedScheduleSlot.findMany({
    where: { alunoId, isActive: true },
    include: {
      aluno: { include: { user: { include: { profile: true } } } },
      professor: { include: { user: { include: { profile: true } } } },
      space: true,
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
  return { schedulePlan: 'fixed' as const, slots: savedSlots, preservedFutureBookings: true };
}

export const fixedScheduleMessages = MESSAGES;
