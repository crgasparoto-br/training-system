import {
  hasCanonicalHealthIntakeMutation,
  upsertCanonicalStudentHealthIntake,
} from '../src/modules/alunos/student-health-intake-write.service';

describe('canonical student health-intake writer', () => {
  it('detects explicit clears as mutations but ignores PAR-Q-only payloads', () => {
    expect(hasCanonicalHealthIntakeMutation({ observations: null })).toBe(true);
    expect(hasCanonicalHealthIntakeMutation({})).toBe(false);
    expect(
      hasCanonicalHealthIntakeMutation({ parqResponses: { q1: true } } as never)
    ).toBe(false);
  });

  it('writes only StudentHealthIntake and advances onboarding metadata', async () => {
    const tx = {
      studentHealthIntake: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: 'intake-1',
          status: 'IN_PROGRESS',
          completedAt: null,
        }),
      },
      studentOnboardingProcess: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      alunoIntakeForm: {
        upsert: jest.fn(),
      },
    } as never;

    await upsertCanonicalStudentHealthIntake(tx, {
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      sourceType: 'professional',
      sourceReference: 'test',
      health: {
        mainGoal: '  Melhorar condicionamento  ',
        medicalHistory: null,
      },
    });

    expect((tx as any).studentHealthIntake.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { alunoId: 'aluno-1' },
        create: expect.objectContaining({
          alunoId: 'aluno-1',
          contractId: 'contract-1',
          clinicalHistoryData: expect.objectContaining({
            mainGoal: 'Melhorar condicionamento',
            medicalHistory: null,
          }),
        }),
      })
    );
    expect((tx as any).studentOnboardingProcess.updateMany).toHaveBeenCalled();
    expect((tx as any).alunoIntakeForm.upsert).not.toHaveBeenCalled();
  });
});
