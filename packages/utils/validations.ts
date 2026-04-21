import { z } from 'zod';

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length === 0 ? undefined : trimmedValue;
};

const emptyStringOrNaNToUndefined = (value: unknown) => {
  if (typeof value === 'number' && Number.isNaN(value)) {
    return undefined;
  }

  return emptyStringToUndefined(value);
};

const stringToDateOrUndefined = (value: unknown) => {
  const normalized = emptyStringToUndefined(value);
  if (normalized === undefined) {
    return undefined;
  }

  if (normalized instanceof Date) {
    return normalized;
  }

  if (typeof normalized === 'string') {
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  return normalized;
};

const optionalTextSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().optional()
);

const optionalDateSchema = z.preprocess(
  stringToDateOrUndefined,
  z.date().optional()
);

const optionalNumberSchema = (schema: z.ZodNumber) =>
  z.preprocess(emptyStringOrNaNToUndefined, schema.optional());

// ============================================================================
// AUTENTICACAO
// ============================================================================

export const LoginSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(6, 'Senha deve ter no minimo 6 caracteres'),
});

export const RegisterSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(8, 'Senha deve ter no minimo 8 caracteres'),
  name: z.string().min(3, 'Nome deve ter no minimo 3 caracteres'),
  type: z.literal('professor'),
  contractType: z.enum(['academy', 'personal'], {
    errorMap: () => ({ message: 'Tipo de contrato deve ser academy ou personal' }),
  }),
  document: z.string().min(11, 'Documento invalido'),
});

export const CreateProfessorSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter no minimo 3 caracteres'),
  email: z.string().trim().toLowerCase().email('Email invalido'),
  password: z.string().min(8, 'Senha deve ter no minimo 8 caracteres'),
  collaboratorFunctionId: z.string().trim().min(1, 'Funcao do colaborador invalida'),
  responsibleManagerId: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1, 'Gestor responsavel invalido').optional()
  ),
});

export const UpdateProfessorSchema = z.object({
  name: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(3, 'Nome deve ter no minimo 3 caracteres').optional()
  ),
  email: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().toLowerCase().email('Email invalido').optional()
  ),
  password: z.preprocess(
    emptyStringToUndefined,
    z.string().min(8, 'Senha deve ter no minimo 8 caracteres').optional()
  ),
  collaboratorFunctionId: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1, 'Funcao do colaborador invalida').optional()
  ),
  responsibleManagerId: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1, 'Gestor responsavel invalido').optional()
  ),
});

export const CreateCollaboratorFunctionSchema = z.object({
  name: z.string().trim().min(2, 'Nome da funcao deve ter no minimo 2 caracteres'),
  isActive: z.boolean().optional(),
});

export const UpdateCollaboratorFunctionSchema = z.object({
  name: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(2, 'Nome da funcao deve ter no minimo 2 caracteres').optional()
  ),
  isActive: z.boolean().optional(),
});

// ============================================================================
// ALUNOS
// ============================================================================

export const CreateAlunoSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter no minimo 3 caracteres'),
  email: z.string().trim().toLowerCase().email('Email invalido'),
  phone: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  birthDate: optionalDateSchema,
  gender: z.enum(['male', 'female', 'other']).optional(),
  schedulePlan: z.enum(['free', 'fixed'], {
    errorMap: () => ({ message: 'Plano de agenda deve ser free ou fixed' }),
  }),
  age: z.number().int().min(10, 'Idade minima: 10 anos').max(100, 'Idade maxima: 100 anos'),
  weight: z.number().positive('Peso deve ser positivo'),
  height: z.number().positive('Altura deve ser positiva'),
  vo2Max: z.number().positive('VO2 Max deve ser positivo'),
  anaerobicThreshold: z.number().positive('Limiar anaerobico deve ser positivo'),
  maxHeartRate: z
    .number()
    .int()
    .min(100, 'FC maxima minima: 100 bpm')
    .max(220, 'FC maxima maxima: 220 bpm'),
  restingHeartRate: z
    .number()
    .int()
    .min(30, 'FC repouso minima: 30 bpm')
    .max(100, 'FC repouso maxima: 100 bpm'),
  bodyFatPercentage: z.preprocess(
    emptyStringOrNaNToUndefined,
    z.number().min(0).max(100).optional()
  ),
  systolicPressure: optionalNumberSchema(
    z.number().int().min(80, 'Pressao sistolica minima: 80 mmHg').max(240, 'Pressao sistolica maxima: 240 mmHg')
  ),
  diastolicPressure: optionalNumberSchema(
    z.number().int().min(40, 'Pressao diastolica minima: 40 mmHg').max(160, 'Pressao diastolica maxima: 160 mmHg')
  ),
  macronutrients: z
    .object({
      carbohydratesPercentage: optionalNumberSchema(z.number().min(0).max(100)),
      proteinsPercentage: optionalNumberSchema(z.number().min(0).max(100)),
      lipidsPercentage: optionalNumberSchema(z.number().min(0).max(100)),
      dailyCalories: optionalNumberSchema(z.number().int().positive('Calorias devem ser positivas')),
    })
    .optional(),
  intakeForm: z
    .object({
      assessmentDate: optionalDateSchema,
      mainGoal: optionalTextSchema,
      medicalHistory: optionalTextSchema,
      currentMedications: optionalTextSchema,
      injuriesHistory: optionalTextSchema,
      trainingBackground: optionalTextSchema,
      observations: optionalTextSchema,
      parqResponses: z
        .object({
          q1: z.boolean(),
          q2: z.boolean(),
          q3: z.boolean(),
          q4: z.boolean(),
          q5: z.boolean(),
          q6: z.boolean(),
          q7: z.boolean(),
        })
        .optional(),
    })
    .optional(),
});

export const UpdateAlunoSchema = z.object({
  schedulePlan: z.enum(['free', 'fixed']).optional(),
  birthDate: optionalDateSchema,
  gender: z.enum(['male', 'female', 'other']).optional(),
  age: z.number().int().min(10, 'Idade minima: 10 anos').max(100, 'Idade maxima: 100 anos').optional(),
  weight: z.number().positive('Peso deve ser positivo').optional(),
  height: z.number().positive('Altura deve ser positiva').optional(),
  vo2Max: z.number().positive('VO2 Max deve ser positivo').optional(),
  anaerobicThreshold: z.number().positive('Limiar anaerobico deve ser positivo').optional(),
  maxHeartRate: z
    .number()
    .int()
    .min(100, 'FC maxima minima: 100 bpm')
    .max(220, 'FC maxima maxima: 220 bpm')
    .optional(),
  restingHeartRate: z
    .number()
    .int()
    .min(30, 'FC repouso minima: 30 bpm')
    .max(100, 'FC repouso maxima: 100 bpm')
    .optional(),
  bodyFatPercentage: z.preprocess(
    emptyStringOrNaNToUndefined,
    z.number().min(0).max(100).optional()
  ),
  systolicPressure: optionalNumberSchema(
    z.number().int().min(80, 'Pressao sistolica minima: 80 mmHg').max(240, 'Pressao sistolica maxima: 240 mmHg')
  ),
  diastolicPressure: optionalNumberSchema(
    z.number().int().min(40, 'Pressao diastolica minima: 40 mmHg').max(160, 'Pressao diastolica maxima: 160 mmHg')
  ),
  macronutrients: z
    .object({
      carbohydratesPercentage: optionalNumberSchema(z.number().min(0).max(100)),
      proteinsPercentage: optionalNumberSchema(z.number().min(0).max(100)),
      lipidsPercentage: optionalNumberSchema(z.number().min(0).max(100)),
      dailyCalories: optionalNumberSchema(z.number().int().positive('Calorias devem ser positivas')),
    })
    .optional(),
  intakeForm: z
    .object({
      assessmentDate: optionalDateSchema,
      mainGoal: optionalTextSchema,
      medicalHistory: optionalTextSchema,
      currentMedications: optionalTextSchema,
      injuriesHistory: optionalTextSchema,
      trainingBackground: optionalTextSchema,
      observations: optionalTextSchema,
      parqResponses: z
        .object({
          q1: z.boolean(),
          q2: z.boolean(),
          q3: z.boolean(),
          q4: z.boolean(),
          q5: z.boolean(),
          q6: z.boolean(),
          q7: z.boolean(),
        })
        .optional(),
    })
    .optional(),
});

// ============================================================================
// TIPOS INFERIDOS
// ============================================================================

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type CreateAlunoInput = z.infer<typeof CreateAlunoSchema>;
export type UpdateAlunoInput = z.infer<typeof UpdateAlunoSchema>;
