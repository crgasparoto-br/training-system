import { CreateAlunoSchema, UpdateAlunoSchema } from '@corrida/utils';

const legacyParq = {
  q1: false,
  q2: false,
  q3: false,
  q4: false,
  q5: false,
  q6: false,
  q7: false,
  q8: true,
};

describe('aluno writable contract after PAR-Q cutover', () => {
  it('does not export direct legacy PAR-Q input in the create contract', () => {
    const result = CreateAlunoSchema.safeParse({
      name: 'Aluno Contrato',
      email: 'aluno@example.com',
      age: 30,
      schedulePlan: 'free',
      intakeForm: { parqResponses: legacyParq },
    });

    expect(result.success).toBe(false);
  });

  it('does not export direct legacy PAR-Q input in the update contract', () => {
    const result = UpdateAlunoSchema.safeParse({
      intakeForm: { parqResponses: legacyParq },
    });

    expect(result.success).toBe(false);
  });

  it('preserves unrelated intake fields', () => {
    expect(
      UpdateAlunoSchema.parse({
        intakeForm: { mainGoal: 'Melhorar condicionamento' },
      })
    ).toEqual({
      intakeForm: { mainGoal: 'Melhorar condicionamento' },
    });
  });
});
