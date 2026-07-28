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

describe("capacityPrescriptionService permission-aware optional data", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("returns an empty goal classification list when the PRNT goal block is denied", async () => {
    getMock.mockRejectedValueOnce({ response: { status: 403 } });

    await expect(
      capacityPrescriptionService.listGoalClassifications("aluno-1"),
    ).resolves.toEqual([]);
    expect(getMock).toHaveBeenCalledWith(
      "/capacity-prescriptions/alunos/aluno-1/goal-classifications",
    );
  });

  it("does not hide non-permission failures", async () => {
    const error = { response: { status: 500 } };
    getMock.mockRejectedValueOnce(error);

    await expect(
      capacityPrescriptionService.listGoalClassifications("aluno-1"),
    ).rejects.toBe(error);
  });
});
