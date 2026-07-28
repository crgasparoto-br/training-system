import api from "./api";
import type {
  CapacityCatalogCategory,
  CapacityPlanningCyclePayload,
  CapacityPlanningCycleView,
  CapacityPrescriptionParameterSetView,
  CapacityPrescriptionSourceRef,
  CapacityPrescriptionView,
  CapacityTechnicalCatalogItemView,
  PhysicalCapacityType,
  ProntuarioGoalCapacityClassificationPayload,
  ProntuarioGoalCapacityClassificationView,
  SaveCapacityPrescriptionPayload,
} from "@corrida/types";

export interface CapacityAssessmentSourceDetail {
  label: string;
  value: string | number | boolean | null;
  unit?: string | null;
}

export interface CapacityAssessmentSourceOption {
  ref: CapacityPrescriptionSourceRef;
  category: string;
  status: string;
  details: CapacityAssessmentSourceDetail[];
}

const unwrap = <T>(response: { data: { data: T } }) => response.data.data;

export const capacityPrescriptionService = {
  async listByAluno(alunoId: string): Promise<CapacityPrescriptionView[]> {
    return unwrap(await api.get(`/capacity-prescriptions/alunos/${alunoId}`));
  },

  async save(
    alunoId: string,
    payload: SaveCapacityPrescriptionPayload,
  ): Promise<CapacityPrescriptionView> {
    return unwrap(
      await api.post(`/capacity-prescriptions/alunos/${alunoId}`, payload),
    );
  },

  async listParameterSets(
    capacity?: PhysicalCapacityType,
    includeHistory = false,
  ): Promise<CapacityPrescriptionParameterSetView[]> {
    return unwrap(
      await api.get("/capacity-prescriptions/parameters", {
        params: {
          ...(capacity ? { capacity } : {}),
          ...(includeHistory ? { includeHistory: "true" } : {}),
        },
      }),
    );
  },

  async listCatalog(
    category?: CapacityCatalogCategory,
  ): Promise<CapacityTechnicalCatalogItemView[]> {
    return unwrap(
      await api.get("/capacity-prescriptions/catalog", {
        params: category ? { category } : undefined,
      }),
    );
  },

  async listPlanning(alunoId: string): Promise<CapacityPlanningCycleView[]> {
    return unwrap(
      await api.get(`/capacity-prescriptions/alunos/${alunoId}/planning`),
    );
  },

  async savePlanning(
    alunoId: string,
    payload: CapacityPlanningCyclePayload,
  ): Promise<CapacityPlanningCycleView> {
    return unwrap(
      await api.post(
        `/capacity-prescriptions/alunos/${alunoId}/planning`,
        payload,
      ),
    );
  },

  async listGoalClassifications(
    alunoId: string,
  ): Promise<ProntuarioGoalCapacityClassificationView[]> {
    try {
      return unwrap(
        await api.get(
          `/capacity-prescriptions/alunos/${alunoId}/goal-classifications`,
        ),
      );
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 403) return [];
      throw error;
    }
  },

  async saveGoalClassification(
    alunoId: string,
    goalId: string,
    payload: ProntuarioGoalCapacityClassificationPayload,
  ): Promise<ProntuarioGoalCapacityClassificationView> {
    return unwrap(
      await api.put(
        `/capacity-prescriptions/alunos/${alunoId}/goals/${goalId}/classification`,
        payload,
      ),
    );
  },

  async listAssessmentSources(
    alunoId: string,
  ): Promise<CapacityAssessmentSourceOption[]> {
    return unwrap(
      await api.get(
        `/capacity-prescriptions/alunos/${alunoId}/assessment-sources`,
      ),
    );
  },
};
