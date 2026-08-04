import type {
  AdipometryInputField,
  CreateAdipometryDraftInput,
  UpdateAdipometryDraftInput,
} from './adipometry.js';

export interface AdipometryResponsibleProfessor {
  id: string;
  name: string;
}

export type AdipometryDraftMeasurementsPatch = Partial<
  Record<AdipometryInputField, number | null>
>;

export type UpdateAdipometryDraftWithClearInput = Omit<
  UpdateAdipometryDraftInput,
  'measurements'
> & {
  measurements?: AdipometryDraftMeasurementsPatch;
};

export interface CreateAdipometryDraftWithResponsibleInput
  extends CreateAdipometryDraftInput {
  responsibleProfessorId: string;
}
