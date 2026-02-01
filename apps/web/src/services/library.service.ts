import api from './api';

export interface Exercise {
  id: string;
  name: string;
  videoUrl?: string;
  loadType?: 'H' | 'C' | 'E' | 'A' | 'P' | 'O';
  movementType?: 'U' | 'I' | 'O';
  countingType?: 'I' | 'T' | 'R';
  category?: string;
  muscleGroup?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseFilters {
  search?: string;
  category?: string;
  loadType?: string;
  movementType?: string;
  countingType?: string;
}

export interface CreateExerciseDTO {
  name: string;
  videoUrl?: string;
  loadType?: 'H' | 'C' | 'E' | 'A' | 'P' | 'O';
  movementType?: 'U' | 'I' | 'O';
  countingType?: 'I' | 'T' | 'R';
  category?: string;
  muscleGroup?: string;
  notes?: string;
}

export const libraryService = {
  async listExercises(filters?: ExerciseFilters): Promise<Exercise[]> {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.loadType) params.append('loadType', filters.loadType);
    if (filters?.movementType) params.append('movementType', filters.movementType);
    if (filters?.countingType) params.append('countingType', filters.countingType);

    const response = await api.get(`/library/exercises?${params.toString()}`);
    return response.data;
  },

  async getExercise(id: string): Promise<Exercise> {
    const response = await api.get(`/library/exercises/${id}`);
    return response.data;
  },

  async createExercise(data: CreateExerciseDTO): Promise<Exercise> {
    const response = await api.post('/library/exercises', data);
    return response.data;
  },

  async updateExercise(id: string, data: Partial<CreateExerciseDTO>): Promise<Exercise> {
    const response = await api.put(`/library/exercises/${id}`, data);
    return response.data;
  },

  async deleteExercise(id: string): Promise<void> {
    await api.delete(`/library/exercises/${id}`);
  },
};
