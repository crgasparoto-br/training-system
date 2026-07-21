import api from './api';

export type AgendaBookingType = 'free' | 'fixed_makeup';
export type AgendaBookingStatus = 'scheduled' | 'completed' | 'canceled' | 'no_show';

export interface AgendaProfessor {
  id: string;
  user: {
    profile: {
      name: string;
    };
  };
}

export interface AgendaAluno {
  id: string;
  schedulePlan: 'free' | 'fixed';
  user: {
    profile: {
      name: string;
    };
  };
  professor: AgendaProfessor;
}

export interface TrainingSpace {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
}

export interface AgendaAvailability {
  id: string;
  professorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  professor: AgendaProfessor;
}

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
  | 'FUTURE_BOOKINGS_CONFIRMATION_REQUIRED'
  | 'FIXED_SCHEDULE_CHANGED';

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
  stage: 'schedule' | 'student' | 'space' | 'professor';
}

export interface FixedScheduleSlot {
  id: string;
  alunoId: string;
  professorId: string;
  spaceId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  notes?: string | null;
  aluno: AgendaAluno;
  professor: AgendaProfessor;
  space?: TrainingSpace | null;
}

export interface AgendaBooking {
  id: string;
  alunoId: string;
  professorId: string;
  spaceId?: string | null;
  fixedSlotId?: string | null;
  bookingType: AgendaBookingType;
  status: AgendaBookingStatus;
  bookingDate: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
  canceledReason?: string | null;
  aluno: AgendaAluno;
  professor: AgendaProfessor;
  space?: TrainingSpace | null;
  fixedSlot?: FixedScheduleSlot | null;
}

export interface AgendaMetadataResponse {
  professores: AgendaProfessor[];
  alunos: AgendaAluno[];
  spaces: TrainingSpace[];
}

export const agendaService = {
  async getMetadata(): Promise<AgendaMetadataResponse> {
    const response = await api.get<{ success: boolean; data: AgendaMetadataResponse }>('/agenda/metadata');
    return response.data.data;
  },

  async listBookings(params: {
    dateFrom?: string;
    dateTo?: string;
    professorId?: string;
    alunoId?: string;
    status?: AgendaBookingStatus;
  }): Promise<AgendaBooking[]> {
    const response = await api.get<{ success: boolean; data: AgendaBooking[] }>('/agenda/bookings', { params });
    return response.data.data;
  },

  async createBooking(data: {
    alunoId: string;
    professorId: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
    bookingType: AgendaBookingType;
    spaceId?: string;
    fixedSlotId?: string;
    notes?: string;
  }): Promise<AgendaBooking> {
    const response = await api.post<{ success: boolean; data: AgendaBooking }>('/agenda/bookings', data);
    return response.data.data;
  },

  async updateBookingStatus(id: string, data: { status: AgendaBookingStatus; canceledReason?: string }): Promise<AgendaBooking> {
    const response = await api.patch<{ success: boolean; data: AgendaBooking }>(`/agenda/bookings/${id}/status`, data);
    return response.data.data;
  },

  async listAvailabilities(professorId?: string): Promise<AgendaAvailability[]> {
    const response = await api.get<{ success: boolean; data: AgendaAvailability[] }>('/agenda/availabilities', {
      params: professorId ? { professorId } : undefined,
    });
    return response.data.data;
  },

  async createAvailability(data: {
    professorId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }): Promise<AgendaAvailability> {
    const response = await api.post<{ success: boolean; data: AgendaAvailability }>('/agenda/availabilities', data);
    return response.data.data;
  },

  async deleteAvailability(id: string): Promise<void> {
    await api.delete(`/agenda/availabilities/${id}`);
  },

  async listFixedSlots(params?: { professorId?: string; alunoId?: string }): Promise<FixedScheduleSlot[]> {
    const response = await api.get<{ success: boolean; data: FixedScheduleSlot[] }>('/agenda/fixed-slots', { params });
    return response.data.data;
  },

  async checkFixedScheduleAvailability(data: {
    alunoId?: string;
    slots: FixedScheduleSlotInput[];
  }): Promise<FixedScheduleAvailabilityResult[]> {
    const response = await api.post<{ success: boolean; data: FixedScheduleAvailabilityResult[] }>(
      '/agenda/fixed-slots/check',
      data
    );
    return response.data.data;
  },

  async createFixedSlot(data: {
    alunoId: string;
    professorId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    spaceId: string;
    notes?: string;
  }): Promise<FixedScheduleSlot> {
    const response = await api.post<{ success: boolean; data: FixedScheduleSlot }>('/agenda/fixed-slots', data);
    return response.data.data;
  },

  async deactivateFixedSlot(
    id: string,
    confirmKeepFutureBookings = false
  ): Promise<FixedScheduleSlot> {
    const response = await api.delete<{ success: boolean; data: FixedScheduleSlot }>(
      `/agenda/fixed-slots/${id}`,
      { data: { confirmKeepFutureBookings } }
    );
    return response.data.data;
  },

  async listSpaces(): Promise<TrainingSpace[]> {
    const response = await api.get<{ success: boolean; data: TrainingSpace[] }>('/agenda/spaces');
    return response.data.data;
  },

  async createSpace(data: { name: string; capacity: number }): Promise<TrainingSpace> {
    const response = await api.post<{ success: boolean; data: TrainingSpace }>('/agenda/spaces', data);
    return response.data.data;
  },
};


