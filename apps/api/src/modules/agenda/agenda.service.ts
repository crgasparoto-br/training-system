import { PrismaClient, type AgendaBookingStatus, type AgendaBookingType } from '@prisma/client';

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
    const [educators, athletes, spaces] = await Promise.all([
      prisma.educator.findMany({
        where: { contractId },
        include: { user: { include: { profile: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.athlete.findMany({
        where: { educator: { contractId }, user: { isActive: true } },
        include: {
          user: { include: { profile: true } },
          educator: { include: { user: { include: { profile: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.trainingSpace.findMany({
        where: { contractId, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return { educators, athletes, spaces };
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

  async listAvailabilities(contractId: string, educatorId?: string) {
    const where: any = { educator: { contractId } };
    if (educatorId) where.educatorId = educatorId;

    return prisma.educatorAvailability.findMany({
      where,
      include: {
        educator: { include: { user: { include: { profile: true } } } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  },

  async createAvailability(contractId: string, data: { educatorId: string; dayOfWeek: number; startTime: string; endTime: string }) {
    const educator = await prisma.educator.findFirst({
      where: { id: data.educatorId, contractId },
      select: { id: true },
    });
    if (!educator) throw new Error('Educador nao encontrado');

    const startTime = normalizeTime(data.startTime);
    const endTime = normalizeTime(data.endTime);
    ensureTimeRange(startTime, endTime);

    return prisma.educatorAvailability.create({
      data: {
        educatorId: data.educatorId,
        dayOfWeek: data.dayOfWeek,
        startTime,
        endTime,
      },
    });
  },

  async deleteAvailability(contractId: string, id: string) {
    const existing = await prisma.educatorAvailability.findFirst({
      where: { id, educator: { contractId } },
      select: { id: true },
    });
    if (!existing) throw new Error('Disponibilidade nao encontrada');
    await prisma.educatorAvailability.delete({ where: { id } });
  },

  async listFixedSlots(contractId: string, filters: { educatorId?: string; athleteId?: string }) {
    const where: any = { educator: { contractId } };
    if (filters.educatorId) where.educatorId = filters.educatorId;
    if (filters.athleteId) where.athleteId = filters.athleteId;

    return prisma.fixedScheduleSlot.findMany({
      where,
      include: {
        athlete: { include: { user: { include: { profile: true } } } },
        educator: { include: { user: { include: { profile: true } } } },
        space: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  },

  async createFixedSlot(
    contractId: string,
    data: {
      athleteId: string;
      educatorId: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      spaceId?: string;
      notes?: string;
    }
  ) {
    const startTime = normalizeTime(data.startTime);
    const endTime = normalizeTime(data.endTime);
    ensureTimeRange(startTime, endTime);

    const [athlete, educator] = await Promise.all([
      prisma.athlete.findFirst({
        where: { id: data.athleteId, educator: { contractId } },
        select: { id: true, educatorId: true },
      }),
      prisma.educator.findFirst({
        where: { id: data.educatorId, contractId },
        select: { id: true },
      }),
    ]);
    if (!athlete) throw new Error('Aluno nao encontrado');
    if (!educator) throw new Error('Educador nao encontrado');
    if (athlete.educatorId !== data.educatorId) {
      throw new Error('Aluno nao pertence ao educador informado');
    }

    if (data.spaceId) {
      const space = await prisma.trainingSpace.findFirst({
        where: { id: data.spaceId, contractId, isActive: true },
        select: { id: true },
      });
      if (!space) throw new Error('Espaco nao encontrado');
    }

    const conflicts = await prisma.fixedScheduleSlot.findMany({
      where: {
        isActive: true,
        dayOfWeek: data.dayOfWeek,
        OR: [{ athleteId: data.athleteId }, { educatorId: data.educatorId }],
      },
      select: { startTime: true, endTime: true },
    });
    if (conflicts.some((slot) => overlaps(startTime, endTime, slot.startTime, slot.endTime))) {
      throw new Error('Conflito com horario fixo existente');
    }

    return prisma.$transaction(async (tx) => {
      await tx.athlete.update({
        where: { id: data.athleteId },
        data: { schedulePlan: 'fixed' },
      });

      return tx.fixedScheduleSlot.create({
        data: {
          athleteId: data.athleteId,
          educatorId: data.educatorId,
          dayOfWeek: data.dayOfWeek,
          startTime,
          endTime,
          spaceId: data.spaceId,
          notes: data.notes,
        },
      });
    });
  },

  async updateFixedSlot(
    contractId: string,
    id: string,
    data: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      spaceId?: string | null;
      notes?: string | null;
      isActive?: boolean;
    }
  ) {
    const existing = await prisma.fixedScheduleSlot.findFirst({
      where: { id, educator: { contractId } },
      select: { id: true },
    });
    if (!existing) throw new Error('Horario fixo nao encontrado');

    const payload: any = {};
    if (typeof data.dayOfWeek === 'number') payload.dayOfWeek = data.dayOfWeek;
    if (typeof data.startTime === 'string') payload.startTime = normalizeTime(data.startTime);
    if (typeof data.endTime === 'string') payload.endTime = normalizeTime(data.endTime);
    if (payload.startTime || payload.endTime) {
      const current = await prisma.fixedScheduleSlot.findUnique({
        where: { id },
        select: { startTime: true, endTime: true },
      });
      const startTime = payload.startTime ?? current?.startTime;
      const endTime = payload.endTime ?? current?.endTime;
      if (!startTime || !endTime) throw new Error('Horario invalido');
      ensureTimeRange(startTime, endTime);
    }
    if (data.spaceId !== undefined) payload.spaceId = data.spaceId;
    if (data.notes !== undefined) payload.notes = data.notes;
    if (typeof data.isActive === 'boolean') payload.isActive = data.isActive;

    return prisma.fixedScheduleSlot.update({
      where: { id },
      data: payload,
    });
  },

  async deactivateFixedSlot(contractId: string, id: string) {
    const existing = await prisma.fixedScheduleSlot.findFirst({
      where: { id, educator: { contractId } },
      select: { id: true },
    });
    if (!existing) throw new Error('Horario fixo nao encontrado');
    return prisma.fixedScheduleSlot.update({
      where: { id },
      data: { isActive: false },
    });
  },

  async listBookings(
    contractId: string,
    filters: {
      dateFrom?: Date;
      dateTo?: Date;
      educatorId?: string;
      athleteId?: string;
      status?: AgendaBookingStatus;
    }
  ) {
    const where: any = { contractId };
    if (filters.educatorId) where.educatorId = filters.educatorId;
    if (filters.athleteId) where.athleteId = filters.athleteId;
    if (filters.status) where.status = filters.status;
    if (filters.dateFrom || filters.dateTo) {
      where.bookingDate = {};
      if (filters.dateFrom) where.bookingDate.gte = toDateOnly(filters.dateFrom);
      if (filters.dateTo) where.bookingDate.lte = toDateOnly(filters.dateTo);
    }

    return prisma.agendaBooking.findMany({
      where,
      include: {
        athlete: { include: { user: { include: { profile: true } } } },
        educator: { include: { user: { include: { profile: true } } } },
        space: true,
        fixedSlot: true,
      },
      orderBy: [{ bookingDate: 'asc' }, { startTime: 'asc' }],
    });
  },

  async createBooking(
    contractId: string,
    data: {
      athleteId: string;
      educatorId: string;
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

    const [athlete, educator] = await Promise.all([
      prisma.athlete.findFirst({
        where: { id: data.athleteId, educator: { contractId } },
        select: { id: true, educatorId: true, schedulePlan: true },
      }),
      prisma.educator.findFirst({
        where: { id: data.educatorId, contractId },
        select: { id: true },
      }),
    ]);
    if (!athlete) throw new Error('Aluno nao encontrado');
    if (!educator) throw new Error('Educador nao encontrado');
    if (athlete.educatorId !== data.educatorId) {
      throw new Error('Aluno nao pertence ao educador informado');
    }

    if (data.bookingType === 'fixed_makeup' && athlete.schedulePlan !== 'fixed') {
      throw new Error('Reposicao permitida apenas para aluno com plano fixo');
    }

    const availability = await prisma.educatorAvailability.findMany({
      where: { educatorId: data.educatorId, dayOfWeek, isActive: true },
      select: { startTime: true, endTime: true },
    });
    const coversWindow = availability.some((slot) =>
      timeToMinutes(slot.startTime) <= timeToMinutes(startTime) &&
      timeToMinutes(slot.endTime) >= timeToMinutes(endTime)
    );
    if (!coversWindow) {
      throw new Error('Horario fora da disponibilidade do educador');
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

    const [educatorBookings, athleteBookings] = await Promise.all([
      prisma.agendaBooking.findMany({
        where: {
          educatorId: data.educatorId,
          bookingDate,
          status: { in: ACTIVE_BOOKING_STATUSES },
        },
        select: { startTime: true, endTime: true },
      }),
      prisma.agendaBooking.findMany({
        where: {
          athleteId: data.athleteId,
          bookingDate,
          status: { in: ACTIVE_BOOKING_STATUSES },
        },
        select: { startTime: true, endTime: true },
      }),
    ]);

    if (educatorBookings.some((item) => overlaps(startTime, endTime, item.startTime, item.endTime))) {
      throw new Error('Educador com conflito de horario');
    }
    if (athleteBookings.some((item) => overlaps(startTime, endTime, item.startTime, item.endTime))) {
      throw new Error('Aluno ja possui agendamento nesse horario');
    }

    if (data.fixedSlotId) {
      const slot = await prisma.fixedScheduleSlot.findFirst({
        where: {
          id: data.fixedSlotId,
          athleteId: data.athleteId,
          educatorId: data.educatorId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!slot) throw new Error('Horario fixo de origem nao encontrado');
    }

    return prisma.agendaBooking.create({
      data: {
        contractId,
        athleteId: data.athleteId,
        educatorId: data.educatorId,
        bookingDate,
        startTime,
        endTime,
        spaceId: data.spaceId,
        bookingType: data.bookingType,
        fixedSlotId: data.fixedSlotId,
        notes: data.notes,
      },
      include: {
        athlete: { include: { user: { include: { profile: true } } } },
        educator: { include: { user: { include: { profile: true } } } },
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
        canceledReason: data.status === 'canceled' ? data.canceledReason ?? null : null,
      },
    });
  },
};

