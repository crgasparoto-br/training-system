export * from './common.js';
export * from './validations.js';
export * from './brazilian-cpf.js';

// Explicit exports override the historical star exports for the writable aluno
// contracts. These schemas no longer expose `intakeForm.parqResponses`.
export {
  CreateAlunoSchema,
  UpdateAlunoSchema,
  type CreateAlunoInput,
  type UpdateAlunoInput,
} from './aluno-validations.js';
