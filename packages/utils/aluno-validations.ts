import { z } from 'zod';
import {
  CreateAlunoSchema as LegacyCreateAlunoSchema,
  UpdateAlunoSchema as LegacyUpdateAlunoSchema,
} from './validations.js';

const createAlunoIntakeFormSchema = LegacyCreateAlunoSchema.shape.intakeForm
  .unwrap()
  .omit({ parqResponses: true })
  .strict();

const updateAlunoIntakeFormSchema = LegacyUpdateAlunoSchema.shape.intakeForm
  .unwrap()
  .omit({ parqResponses: true })
  .strict();

/**
 * Contratos públicos pós-cutover do PAR-Q.
 *
 * O formato legado continua definido somente no módulo histórico para leitura e
 * migração, mas não faz parte das entradas exportadas por `@corrida/utils`.
 * Escritas escondidas em `formResponses.parqResponses` são recusadas na
 * fronteira HTTP antes da validação Zod.
 */
export const CreateAlunoSchema = LegacyCreateAlunoSchema.extend({
  intakeForm: createAlunoIntakeFormSchema.optional(),
});

export const UpdateAlunoSchema = LegacyUpdateAlunoSchema.extend({
  intakeForm: updateAlunoIntakeFormSchema.optional(),
});

export type CreateAlunoInput = z.infer<typeof CreateAlunoSchema>;
export type UpdateAlunoInput = z.infer<typeof UpdateAlunoSchema>;
