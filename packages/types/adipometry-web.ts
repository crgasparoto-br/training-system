import type {
  AdipometryInputField,
  CreateAdipometryDraftInput,
  UpdateAdipometryDraftInput,
} from './adipometry.js';

declare module './adipometry.js' {
  interface AdipometryProtocolSummary {
    population?: import('./adipometry.js').AdipometryProtocolPopulation;
    selectionReason?: string;
    displayPrecision?: {
      measurementScale: number;
      resultScale: number;
      skinfoldTotalScale: number;
    };
  }
}

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
