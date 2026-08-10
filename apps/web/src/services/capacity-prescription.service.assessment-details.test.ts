import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "./api";
import { capacityPrescriptionService } from "./capacity-prescription.service";

vi.mock("./api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const getMock = vi.mocked(api.get);

describe("capacityPrescriptionService assessment details", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("mantém ângulos numéricos e converte métricas contextuais para texto", async () => {
    getMock.mockResolvedValueOnce({
      data: {
        data: [
          {
            ref: {
              type: "flexibility_assessment",
              id: "assessment-1",
              label: "Flexibilidade",
            },
            category: "flexibility",
            status: "completed",
            details: [
              { label: "Flexão de ombro", value: 142, unit: "graus" },
              { label: "Força do ombro", value: 80, unit: "kgf" },
              { label: "Pontuação do ombro", value: 7, unit: null },
            ],
          },
        ],
      },
    });

    const result = await capacityPrescriptionService.listAssessmentSources("aluno-1");

    expect(result[0].details).toEqual([
      { label: "Flexão de ombro", value: 142, unit: "graus" },
      { label: "Força do ombro", value: "80 kgf", unit: null },
      { label: "Pontuação do ombro", value: "7 (contexto)", unit: null },
    ]);
  });
});
