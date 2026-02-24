import api from './api';

export type AgendaBookingType = 'free' | 'fixed_makeup';
export type AgendaBookingStatus = 'scheduled' | 'completed' | 'canceled' | 'no_show';

export interface AgendaEducator {
  id: string;
  user: {
    profile: {
      name: string;
    };
  };
}

export interface AgendaAthlete {
  id: string;
  schedulePlan: 'free' | 'fixed';
  user: {
    profile: {
      name: string;
    };
  };
  educator: AgendaEducator;
}

export interface TrainingSpace {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
}

export interface AgendaAvailability {
  id: string;
  educatorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  educator: AgendaEducator;
}

export interface FixedScheduleSlot {
  id: string;
  athleteId: string;
  educatorId: string;
  spaceId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  notes?: string | null;
  athlete: AgendaAthlete;
  educator: AgendaEducator;
  space?: TrainingSpace | null;
}

export interface AgendaBooking {
  id: string;
  athleteId: string;
  educatorId: string;
  spaceId?: string | null;
  fixedSlotId?: string | null;
  bookingType: AgendaBookingType;
  status: AgendaBookingStatus;
  bookingDate: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
  canceledReason?: string | null;
  athlete: AgendaAthlete;
  educator: AgendaEducator;
  space?: TrainingSpace | null;
  fixedSlot?: FixedScheduleSlot | null;
}

export interface AgendaMetadataResponse {
  educators: AgendaEducator[];
  athletes: AgendaAthlete[];
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
    educatorId?: string;
    athleteId?: string;
    status?: AgendaBookingStatus;
  }): Promise<AgendaBooking[]> {
    const response = await api.get<{ success: boolean; data: AgendaBooking[] }>('/agenda/bookings', { params });
    return response.data.data;
  },

  async createBooking(data: {
    athleteId: string;
    educatorId: string;
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

  async listAvailabilities(educatorId?: string): Promise<AgendaAvailability[]> {
    const response = await api.get<{ success: boolean; data: AgendaAvailability[] }>('/agenda/availabilities', {
      params: educatorId ? { educatorId } : undefined,
    });
    return response.data.data;
  },

  async createAvailability(data: {
    educatorId: string;
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

  async listFixedSlots(params?: { educatorId?: string; athleteId?: string }): Promise<FixedScheduleSlot[]> {
    const response = await api.get<{ success: boolean; data: FixedScheduleSlot[] }>('/agenda/fixed-slots', { params });
    return response.data.data;
  },

  async createFixedSlot(data: {
    athleteId: string;
    educatorId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    spaceId?: string;
    notes?: string;
  }): Promise<FixedScheduleSlot> {
    const response = await api.post<{ success: boolean; data: FixedScheduleSlot }>('/agenda/fixed-slots', data);
    return response.data.data;
  },

  async deactivateFixedSlot(id: string): Promise<FixedScheduleSlot> {
    const response = await api.delete<{ success: boolean; data: FixedScheduleSlot }>(`/agenda/fixed-slots/${id}`);
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

