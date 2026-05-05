import { upsertAlunoAssessmentPlanSchema } from '../src/modules/alunos/aluno-assessment-plan.schemas';

describe('upsertAlunoAssessmentPlanSchema', () => {
  it('aceita payload válido com múltiplos tipos', () => {
    const parsed = upsertAlunoAssessmentPlanSchema.parse({
      items: [
        {
          assessmentTypeId: 'type-1',
          isActive: true,
          isRequired: true,
          cadenceMonths: 4,
          startDate: '2026-05-01',
        },
        {
          assessmentTypeId: 'type-2',
          isActive: false,
          isRequired: false,
          cadenceMonths: null,
          nextDueDate: null,
          notes: 'Opcional para este aluno',
        },
      ],
    });

    expect(parsed.items).toHaveLength(2);
  });

  it('rejeita payload com assessmentTypeId duplicado', () => {
    expect(() =>
      upsertAlunoAssessmentPlanSchema.parse({
        items: [
          { assessmentTypeId: 'type-1' },
          { assessmentTypeId: 'type-1' },
        ],
      })
    ).toThrow('Não é permitido duplicar assessmentTypeId na mesma requisição');
  });
});
