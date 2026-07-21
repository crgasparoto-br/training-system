import { PrismaClient, type AgendaBookingStatus, type AgendaBookingType } from '@prisma/client';
import {
  checkFixedScheduleAvailability,
  FixedScheduleError,
  fixedScheduleMessages,
  syncStudentFixedSchedule,
  type FixedScheduleSlotInput,
} from './fixed-schedule.service.js';

const prisma = new PrismaClient();

const ACTIVE_BOOKING_STATUSES: AgendaBookingStatus[] = ['scheduled'];

function normalizeTime(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    throw new Error('Horario invalido. Use HH:mm');
  }
  const [hour, minute] = trimmed.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Horario invalido. Use HH:mm');
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function ensureTimeRange(startTime: string, endTime: string) {
  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    throw new Error('Horario final deve ser maior que horario inicial');
  }
}

function overlaps(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);
  return aStart < bEnd && bStart < aEnd;
}

function toDateOnly(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getDayOfWeekIso(value: Date): number {
  const day = value.getDay();
  return day === 0 ? 7 : day;
}

export const agendaService = {
  async getMetadata(contractId: string) {
    const [professores, alunos, spaces] = await Promise.all([
      prisma.professor.findMany({
        where: { contractId, user: { isActive: true } },
        include: { user: { include: { profile: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.aluno.findMany({
        where: { professor: { contractId }, user: { isActive: true } },
        include: {
          user: { include: { profile: true } },
          professor: { include: { user: { include: { profile: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.trainingSpace.findMany({
        where: { contractId, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return { professores, alunos, spaces };
  },

  async listSpaces(contractId: string) {
    return prisma.trainingSpace.findMany({
      where: { contractId },
      orderBy: { name: 'asc' },
    });
  },

  async createSpace(contractId: string, data: { name: string; capacity: number }) {
    return prisma.trainingSpace.create({
      data: {
        contractId,
        name: data.name.trim(),
        capacity: data.capacity,
      },
    });
  },

  async updateSpace(contractId: string, id: string, data: { name?: string; capacity?: number; isActive?: boolean }) {
    const existing = await prisma.trainingSpace.findFirst({ where: { id, contractId } });
    if (!existing) throw new Error('Espaco nao encontrado');

    return prisma.trainingSpace.update({
      where: { id },
      data: {
        ...(typeof data.name === 'string' ? { name: data.name.trim() } : {}),
        ...(typeof data.capacity === 'number' ? { capacity: data.capacity } : {}),
        ...(typeof data.isActive === 'boolean' ? { isActive: data.isActive } : {}),
      },
    });
  },

  async listAvailabilities(contractId: string, professorId?: string) {
    const where: any = { professor: { contractId } };
    if (professorId) where.professorId = professorId;

    return prisma.professorAvailability.findMany({
      where,
      include: {
        professor: { include: { user: { include: { profile: true } } } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  },

  async createAvailability(contractId: string, data: { professorId: string; dayOfWeek: number; startTime: string; endTime: string }) {
    const professor = await prisma.professor.findFirst({
      where: { id: data.professorId, contractId },
      select: { id: true },
    });
    if (!professor) throw new Error('Professor não encontrado');

    const startTime = normalizeTime(data.startTime);
    const endTime = normalizeTime(data.endTime);
    ensureTimeRange(startTime, endTime);

    return prisma.professorAvailability.create({
      data: {
        professorId: data.professorId,
        dayOfWeek: data.dayOfWeek,
        startTime,
        endTime,
      },
    });
  },

  async deleteAvailability(contractId: string, id: string) {
    const existing = await prisma.professorAvailability.findFirst({
      where: { id, professor: { contractId } },
      select: { id: true },
    });
    if (!existing) throw new Error('Disponibilidade nao encontrada');
    await prisma.professorAvailability.delete({ where: { id } });
  },

  async listFixedSlots(contractId: string, filters: { professorId?: string; alunoId?: string }) {
    const where: any = { professor: { contractId }, isActive: true };
    if (filters.professorId) where.professorId = filters.professorId;
    if (filters.alunoId) where.alunoId = filters.alunoId;

    return prisma.fixedScheduleSlot.findMany({
      where,
      include: {
        aluno: { include: { user: { include: { profile: true } } } },
        professor: { include: { user: { include: { profile: true } } } },
        space: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  },

  async checkFixedSchedule(
    contractId: string,
    data: { alunoId?: string; slots: FixedScheduleSlotInput[] }
  ) {
    return checkFixedScheduleAvailability(prisma, contractId, data.alunoId, data.slots);
  },

  async createFixedSlot(
    contractId: string,
    data: FixedScheduleSlotInput & { alunoId: string }
  ) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.fixedScheduleSlot.findMany({
        where: { alunoId: data.alunoId, isActive: true, professor: { contractId } },
        select: {
          id: true,
          professorId: true,
          spaceId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          notes: true,
        },
      });
      const result = await syncStudentFixedSchedule(tx, contractId, data.alunoId, 'fixed', [
        ...current.map((slot) => ({ ...slot, spaceId: slot.spaceId || '' })),
        data,
      ]);
      return result.slots.find(
        (slot) =>
          slot.professorId === data.professorId &&
          slot.spaceId === data.spaceId &&
          slot.dayOfWeek === data.dayOfWeek &&
          slot.startTime === data.startTime &&
          slot.endTime === data.endTime
      );
    });
  },

  async updateFixedSlot(
    contractId: string,
    id: string,
    data: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      professorId?: string;
      spaceId?: string | null;
      notes?: string | null;
      isActive?: boolean;
    },
    options: { confirmKeepFutureBookings?: boolean } = {}
  ) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.fixedScheduleSlot.findFirst({
        where: { id, professor: { contractId } },
        select: { alunoId: true, isActive: true },
      });
      if (!current) throw new Error('Horario fixo nao encontrado');
      if (!current.isActive) {
        throw new FixedScheduleError(
          'FIXED_SLOT_INACTIVE',
          fixedScheduleMessages.FIXED_SLOT_INACTIVE,
          { stage: 'student' }
        );
      }

      const active = await tx.fixedScheduleSlot.findMany({
        where: { alunoId: current.alunoId, isActive: true, professor: { contractId } },
        select: {
          id: true,
          professorId: true,
          spaceId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          notes: true,
        },
      });
      const desired = active
        .filter((slot) => slot.id !== id || data.isActive !== false)
        .map((slot) =>
          slot.id === id
            ? {
                ...slot,
                ...data,
                spaceId: data.spaceId ?? slot.spaceId ?? '',
                professorId: data.professorId ?? slot.professorId,
              }
            : { ...slot, spaceId: slot.spaceId || '' }
        );

      const result = await syncStudentFixedSchedule(
        tx,
        contractId,
        current.alunoId,
        desired.length > 0 ? 'fixed' : 'free',
        desired,
        { confirmKeepFutureBookings: options.confirmKeepFutureBookings }
      );
      return (
        result.slots.find((slot) => slot.id === id) ??
        tx.fixedScheduleSlot.findUnique({ where: { id } })
      );
    });
  },

  async deactivateFixedSlot(
    contractId: string,
    id: string,
    options: { confirmKeepFutureBookings?: boolean } = {}
  ) {
    return agendaService.updateFixedSlot(contractId, id, { isActive: false }, options);
  },

  async listBookings(
    contractId: string,
    filters: {
      dateFrom?: Date;
      dateTo?: Date;
      professorId?: string;
      alunoId?: string;
      status?: AgendaBookingStatus;
    }
  ) {
    const where: any = { contractId };
    if (filters.professorId) where.professorId = filters.professorId;
    if (filters.alunoId) where.alunoId = filters.alunoId;
    if (filters.status) where.status = filters.status;
    if (filters.dateFrom || filters.dateTo) {
      where.bookingDate = {};
      if (filters.dateFrom) where.bookingDate.gte = toDateOnly(filters.dateFrom);
      if (filters.dateTo) where.bookingDate.lte = toDateOnly(filters.dateTo);
    }

    return prisma.agendaBooking.findMany({
      where,
      include: {
        aluno: { include: { user: { include: { profile: true } } } },
        professor: { include: { user: { include: { profile: true } } } },
        space: true,
        fixedSlot: true,
      },
      orderBy: [{ bookingDate: 'asc' }, { startTime: 'asc' }],
    });
  },

  async createBooking(
    contractId: string,
    data: {
      alunoId: string;
      professorId: string;
      bookingDate: Date;
      startTime: string;
      endTime: string;
      spaceId?: string;
      bookingType: AgendaBookingType;
      fixedSlotId?: string;
      notes?: string;
    }
  ) {
    const bookingDate = toDateOnly(data.bookingDate);
    const startTime = normalizeTime(data.startTime);
    const endTime = normalizeTime(data.endTime);
    ensureTimeRange(startTime, endTime);
    const dayOfWeek = getDayOfWeekIso(bookingDate);

    const [aluno, professor] = await Promise.all([
      prisma.aluno.findFirst({
        where: { id: data.alunoId, professor: { contractId } },
        select: { id: true, professorId: true, schedulePlan: true },
      }),
      prisma.professor.findFirst({
        where: { id: data.professorId, contractId },
        select: { id: true },
      }),
    ]);
    if (!aluno) throw new Error('Aluno não encontrado');
    if (!professor) throw new Error('Professor não encontrado');
    if (aluno.professorId !== data.professorId) {
      throw new Error('Aluno não pertence ao professor informado');
    }

    if (data.bookingType === 'fixed_makeup' && aluno.schedulePlan !== 'fixed') {
      throw new Error('Reposicao permitida apenas para aluno com plano fixo');
    }

    const availability = await prisma.professorAvailability.findMany({
      where: { professorId: data.professorId, dayOfWeek, isActive: true },
      select: { startTime: true, endTime: true },
    });
    const coversWindow = availability.some((slot) =>
      timeToMinutes(slot.startTime) <= timeToMinutes(startTime) &&
      timeToMinutes(slot.endTime) >= timeToMinutes(endTime)
    );
    if (!coversWindow) {
      throw new Error('Horario fora da disponibilidade do professor');
    }

    if (data.spaceId) {
      const space = await prisma.trainingSpace.findFirst({
        where: { id: data.spaceId, contractId, isActive: true },
        select: { id: true, capacity: true },
      });
      if (!space) throw new Error('Espaco nao encontrado');

      const overlappingBookings = await prisma.agendaBooking.findMany({
        where: {
          spaceId: data.spaceId,
          bookingDate,
          status: { in: ACTIVE_BOOKING_STATUSES },
        },
        select: { startTime: true, endTime: true },
      });
      const concurrent = overlappingBookings.filter((item) =>
        overlaps(startTime, endTime, item.startTime, item.endTime)
      ).length;
      if (concurrent >= space.capacity) {
        throw new Error('Capacidade do espaco excedida para este horario');
      }
    }

    const [professorBookings, alunoBookings] = await Promise.all([
      prisma.agendaBooking.findMany({
        where: {
          professorId: data.professorId,
          bookingDate,
          status: { in: ACTIVE_BOOKING_STATUSES },
        },
        select: { startTime: true, endTime: true },
      }),
      prisma.agendaBooking.findMany({
        where: {
          alunoId: data.alunoId,
          bookingDate,
          status: { in: ACTIVE_BOOKING_STATUSES },
        },
        select: { startTime: true, endTime: true },
      }),
    ]);

    if (professorBookings.some((item) => overlaps(startTime, endTime, item.startTime, item.endTime))) {
      throw new Error('Professor com conflito de horario');
    }
    if (alunoBookings.some((item) => overlaps(startTime, endTime, item.startTime, item.endTime))) {
      throw new Error('Aluno ja possui agendamento nesse horario');
    }

    if (data.fixedSlotId) {
      const slot = await prisma.fixedScheduleSlot.findFirst({
        where: {
          id: data.fixedSlotId,
          alunoId: data.alunoId,
          professorId: data.professorId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!slot) throw new Error('Horario fixo de origem nao encontrado');
    }

    return prisma.agendaBooking.create({
      data: {
        contractId,
        alunoId: data.alunoId,
        professorId: data.professorId,
        bookingDate,
        startTime,
        endTime,
        spaceId: data.spaceId,
        type: data.bookingType,
        fixedSlotId: data.fixedSlotId,
        notes: data.notes,
      },
      include: {
        aluno: { include: { user: { include: { profile: true } } } },
        professor: { include: { user: { include: { profile: true } } } },
        space: true,
        fixedSlot: true,
      },
    });
  },

  async updateBookingStatus(
    contractId: string,
    id: string,
    data: { status: AgendaBookingStatus; canceledReason?: string | null }
  ) {
    const existing = await prisma.agendaBooking.findFirst({
      where: { id, contractId },
      select: { id: true },
    });
    if (!existing) throw new Error('Agendamento nao encontrado');

    return prisma.agendaBooking.update({
      where: { id },
      data: {
        status: data.status,
      },
    });
  },
};


