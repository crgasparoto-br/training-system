import api from './api';

export interface Exercise {
  id: string;
  name: string;
  videoUrl?: string;
  loadType?: 'H' | 'C' | 'E' | 'A' | 'P' | 'O';
  movementType?: 'U' | 'A' | 'I' | 'O';
  countingType?: 'I' | 'T' | 'R';
  category?: string;
  muscleGroup?: string;
  notes?: string;
  aliases: string[];
  capacity?: string | null;
  equipment: string[];
  primaryMuscleGroups: string[];
  secondaryMuscleGroups: string[];
  movementPattern?: string | null;
  joints: string[];
  laterality?: string | null;
  difficulty?: string | null;
  instructions: string[];
  commonErrors: string[];
  regressions: string[];
  progressions: string[];
  alternatives: string[];
  restrictions: string[];
  alerts: string[];
  mediaOrigin?: string | null;
  mediaLicense?: string | null;
  mediaAuthor?: string | null;
  curationStatus: ExerciseCurationStatus;
  version: number;
  createdByUserId?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  legacyGrandfathered: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ExerciseCurationStatus = 'draft' | 'in_review' | 'approved' | 'inactive';
export type ExerciseCurationAction = 'submit' | 'approve' | 'request_changes' | 'deactivate' | 'reopen';
export interface ExerciseRevision {
  id: string;
  exerciseId: string;
  contractId: string;
  version: number;
  actorUserId?: string | null;
  action: string;
  snapshot: Exercise;
  createdAt: string;
}
export interface ExerciseFilters {
  search?: string;
  category?: string;
  muscleGroup?: string;
  loadType?: string;
  movementType?: string;
  countingType?: string;
  equipment?: string;
  movementPattern?: string;
  difficulty?: string;
  curationStatus?: ExerciseCurationStatus;
  scope?: 'official' | 'all';
}

export interface CreateExerciseDTO {
  name: string;
  videoUrl?: string;
  loadType?: 'H' | 'C' | 'E' | 'A' | 'P' | 'O';
  movementType?: 'U' | 'A' | 'I' | 'O';
  countingType?: 'I' | 'T' | 'R';
  category?: string;
  muscleGroup?: string;
  notes?: string;
  aliases?: string[];
  capacity?: string;
  equipment?: string[];
  primaryMuscleGroups?: string[];
  secondaryMuscleGroups?: string[];
  movementPattern?: string;
  joints?: string[];
  laterality?: string;
  difficulty?: string;
  instructions?: string[];
  commonErrors?: string[];
  regressions?: string[];
  progressions?: string[];
  alternatives?: string[];
  restrictions?: string[];
  alerts?: string[];
  mediaOrigin?: string;
  mediaLicense?: string;
  mediaAuthor?: string;
}

export interface AlunoExerciseProgress {
  alunoId: string;
  exerciseId: string;
  lastLoad?: number | null;
  maxLoad?: number | null;
  lastUpdated?: string | null;
  exercise?: Exercise;
}

export const libraryService = {
  async listExercises(filters?: ExerciseFilters): Promise<Exercise[]> {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.muscleGroup) params.append('muscleGroup', filters.muscleGroup);
    if (filters?.loadType) params.append('loadType', filters.loadType);
    if (filters?.movementType) params.append('movementType', filters.movementType);
    if (filters?.countingType) params.append('countingType', filters.countingType);
    if (filters?.scope) params.append('scope', filters.scope);
    if (filters?.curationStatus) params.append('curationStatus', filters.curationStatus);
    if (filters?.equipment) params.append('equipment', filters.equipment);
    if (filters?.movementPattern) params.append('movementPattern', filters.movementPattern);
    if (filters?.difficulty) params.append('difficulty', filters.difficulty);

    const response = await api.get(`/library/exercises?${params.toString()}`);
    return response.data;
  },

  async getExercise(id: string): Promise<Exercise> {
    const response = await api.get(`/library/exercises/${id}`);
    return response.data;
  },

  async getExercises(filters?: ExerciseFilters): Promise<Exercise[]> {
    return this.listExercises(filters);
  },

  async createExercise(data: CreateExerciseDTO): Promise<Exercise> {
    const response = await api.post('/library/exercises', data);
    return response.data;
  },

  async updateExercise(id: string, data: Partial<CreateExerciseDTO>, expectedVersion: number): Promise<Exercise> {
    const response = await api.put(`/library/exercises/${id}`, { ...data, expectedVersion });
    return response.data;
  },

  async deleteExercise(id: string, expectedVersion: number): Promise<void> {
    await api.delete(`/library/exercises/${id}`, { params: { expectedVersion } });
  },

  async reviewExercise(id: string, action: ExerciseCurationAction, expectedVersion: number): Promise<Exercise> {
    const response = await api.post(`/library/exercises/${id}/curation`, { action, expectedVersion });
    return response.data;
  },

  async listExerciseRevisions(id: string): Promise<ExerciseRevision[]> {
    const response = await api.get(`/library/exercises/${id}/revisions`);
    return response.data;
  },

  async getAlunoProgress(alunoId: string, exerciseId: string): Promise<AlunoExerciseProgress | null> {
    const response = await api.get(`/library/progress/${alunoId}/${exerciseId}`);
    return response.data;
  },
};

