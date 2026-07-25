import {
  CompletedHealthIntakeMutationError,
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

  it('locks onboarding before reading or writing the canonical intake', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'onboarding-1' }]);
    const findUnique = jest.fn().mockResolvedValue(null);
    const upsert = jest.fn().mockResolvedValue({
      id: 'intake-1',
      status: 'IN_PROGRESS',
      completedAt: null,
    });
    const tx = {
      $queryRaw: queryRaw,
      studentHealthIntake: { findUnique, upsert },
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

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      findUnique.mock.invocationCallOrder[0]
    );
    expect(findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      upsert.mock.invocationCallOrder[0]
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { alunoId: 'aluno-1' },
        create: expect.objectContaining({
          alunoId: 'aluno-1',
          contractId: 'contract-1',
          status: 'IN_PROGRESS',
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

  it('rejects generic mutation of a completed intake after acquiring the shared lock', async () => {
    const completedAt = new Date('2026-07-25T10:00:00.000Z');
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'onboarding-1' }]);
    const findUnique = jest.fn().mockResolvedValue({
      id: 'intake-completed',
      status: 'COMPLETED',
      completedAt,
      clinicalHistoryData: { mainGoal: 'Objetivo original' },
      medicationData: {},
      injuryData: {},
      observations: null,
    });
    const tx = {
      $queryRaw: queryRaw,
      studentHealthIntake: {
        findUnique,
        upsert: jest.fn(),
      },
      studentOnboardingProcess: {
        updateMany: jest.fn(),
      },
    } as never;

    await expect(
      upsertCanonicalStudentHealthIntake(tx, {
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        sourceType: 'professional',
        sourceReference: 'legacy_admin_update',
        health: { mainGoal: 'Alteração indevida' },
      })
    ).rejects.toEqual(expect.any(CompletedHealthIntakeMutationError));

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      findUnique.mock.invocationCallOrder[0]
    );
    expect((tx as any).studentHealthIntake.upsert).not.toHaveBeenCalled();
    expect((tx as any).studentOnboardingProcess.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed when no onboarding row can be locked', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      studentHealthIntake: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      studentOnboardingProcess: {
        updateMany: jest.fn(),
      },
    } as never;

    await expect(
      upsertCanonicalStudentHealthIntake(tx, {
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        sourceType: 'professional',
        sourceReference: 'legacy_admin_update',
        health: { mainGoal: 'Alteração indevida' },
      })
    ).rejects.toThrow('StudentOnboardingProcess não encontrado');

    expect((tx as any).studentHealthIntake.findUnique).not.toHaveBeenCalled();
    expect((tx as any).studentHealthIntake.upsert).not.toHaveBeenCalled();
  });
});
