import { z } from 'zod';

export const assessmentPlanItemInputSchema = z.object({
  assessmentTypeId: z.string().min(1, 'assessmentTypeId é obrigatório'),
  isActive: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  cadenceMonths: z.number().int().min(1).max(36).nullable().optional(),
  startDate: z.string().trim().nullable().optional(),
  nextDueDate: z.string().trim().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const upsertAlunoAssessmentPlanSchema = z
  .object({
    items: z.array(assessmentPlanItemInputSchema).min(1, 'Informe ao menos um item do plano'),
  })
  .refine(
    (payload) => {
      const keys = payload.items.map((item) => item.assessmentTypeId);
      return new Set(keys).size === keys.length;
    },
    {
      message: 'Não é permitido duplicar assessmentTypeId na mesma requisição',
      path: ['items'],
    }
  );

export type AssessmentPlanItemInput = z.infer<typeof assessmentPlanItemInputSchema>;
export type UpsertAlunoAssessmentPlanInput = z.infer<typeof upsertAlunoAssessmentPlanSchema>;
