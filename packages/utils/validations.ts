import { z } from 'zod';

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length === 0 ? undefined : trimmedValue;
};

const emptyStringToNull = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length === 0 ? null : trimmedValue;
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

const stringToDateOrNullish = (value: unknown) => {
  if (value === null) {
    return null;
  }

  const normalized = emptyStringToNull(value);
  if (normalized === null || normalized === undefined) {
    return normalized;
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

const optionalNullableTextSchema = z.preprocess(
  emptyStringToNull,
  z.string().trim().nullable().optional()
);

const optionalUrlSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().url('URL invalida').optional()
);

const optionalDateSchema = z.preprocess(
  stringToDateOrUndefined,
  z.date().optional()
);

const optionalNullableDateSchema = z.preprocess(
  stringToDateOrNullish,
  z.date().nullable().optional()
);

const optionalNullableUrlSchema = z.preprocess(
  emptyStringToNull,
  z.string().trim().url('URL invalida').nullable().optional()
);

const optionalNumberSchema = (schema: z.ZodNumber) =>
  z.preprocess(emptyStringOrNaNToUndefined, schema.optional());

const optionalNonNegativeNumberSchema = z.preprocess(
  emptyStringOrNaNToUndefined,
  z.number().min(0, 'Valor deve ser maior ou igual a zero').optional()
);

const optionalNullableNonNegativeNumberSchema = z.preprocess(
  (value) => {
    if (value === null) {
      return null;
    }

    return emptyStringOrNaNToUndefined(value);
  },
  z.number().min(0, 'Valor deve ser maior ou igual a zero').nullable().optional()
);

const normalizeDigits = (value: unknown) => {
  const normalized = emptyStringToUndefined(value);
  if (typeof normalized !== 'string') {
    return normalized;
  }

  const digits = normalized.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
};

const normalizeNullableDigits = (value: unknown) => {
  const normalized = emptyStringToNull(value);
  if (normalized === null) {
    return null;
  }

  if (typeof normalized !== 'string') {
    return normalized;
  }

  const digits = normalized.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
};

const optionalCpfSchema = z.preprocess(
  normalizeDigits,
  z.string().length(11, 'CPF invalido').optional()
);

const optionalCnpjSchema = z.preprocess(
  normalizeDigits,
  z.string().length(14, 'CNPJ invalido').optional()
);

const optionalNullableCpfSchema = z.preprocess(
  normalizeNullableDigits,
  z.string().length(11, 'CPF invalido').nullable().optional()
);

const optionalNullableCnpjSchema = z.preprocess(
  normalizeNullableDigits,
  z.string().length(14, 'CNPJ invalido').nullable().optional()
);

const optionalZipCodeSchema = z.preprocess(
  normalizeDigits,
  z.string().length(8, 'CEP invalido').optional()
);

const optionalNullableZipCodeSchema = z.preprocess(
  normalizeNullableDigits,
  z.string().length(8, 'CEP invalido').nullable().optional()
);

const maritalStatusSchema = z.enum([
  'single',
  'married',
  'stable_union',
  'divorced',
  'separated',
  'widowed',
  'other',
]);

const professorHourlyRatesSchema = z.object({
  personal: optionalNonNegativeNumberSchema,
  consulting: optionalNonNegativeNumberSchema,
  evaluation: optionalNonNegativeNumberSchema,
});

const professorHourlyRatesNullableSchema = z.object({
  personal: optionalNullableNonNegativeNumberSchema,
  consulting: optionalNullableNonNegativeNumberSchema,
  evaluation: optionalNullableNonNegativeNumberSchema,
});

const accessPermissionSelectionSchema = z.object({
  screens: z.array(z.string().trim().min(1, 'Tela invalida')),
  blocks: z.array(z.string().trim().min(1, 'Bloco invalido')),
});

// ============================================================================
// AUTENTICACAO
// ============================================================================

export const LoginSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(6, 'Senha deve ter no minimo 6 caracteres'),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email invalido'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Token invalido'),
  password: z.string().min(8, 'Senha deve ter no minimo 8 caracteres'),
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
  phone: optionalTextSchema,
  birthDate: optionalDateSchema,
  cpf: optionalCpfSchema,
  rg: optionalTextSchema,
  maritalStatus: maritalStatusSchema.optional(),
  addressStreet: optionalTextSchema,
  addressNumber: optionalTextSchema,
  addressComplement: optionalTextSchema,
  addressZipCode: optionalZipCodeSchema,
  instagramHandle: optionalTextSchema,
  cref: optionalTextSchema,
  professionalSummary: optionalTextSchema,
  lattesUrl: optionalUrlSchema,
  companyDocument: optionalCnpjSchema,
  bankCode: optionalTextSchema,
  bankName: optionalTextSchema,
  bankBranch: optionalTextSchema,
  bankAccount: optionalTextSchema,
  pixKey: optionalTextSchema,
  avatar: optionalUrlSchema,
  admissionDate: optionalDateSchema,
  currentStatus: optionalTextSchema,
  operationalRoleIds: z.array(z.string().trim().min(1, 'Cargo invalido')).optional(),
  hourlyRates: professorHourlyRatesSchema.optional(),
  hasSignedContract: z.boolean().optional(),
  signedContractDocumentUrl: optionalUrlSchema,
  collaboratorFunctionId: z.string().trim().min(1, 'Funcao do colaborador invalida'),
  responsibleManagerId: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1, 'Gestor responsavel invalido').optional()
  ),
}).superRefine((data, ctx) => {
  if (data.hasSignedContract && !data.signedContractDocumentUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['signedContractDocumentUrl'],
      message: 'Envie o PDF do contrato assinado',
    });
  }
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
  phone: optionalNullableTextSchema,
  birthDate: optionalNullableDateSchema,
  cpf: optionalNullableCpfSchema,
  rg: optionalNullableTextSchema,
  maritalStatus: maritalStatusSchema.nullable().optional(),
  addressStreet: optionalNullableTextSchema,
  addressNumber: optionalNullableTextSchema,
  addressComplement: optionalNullableTextSchema,
  addressZipCode: optionalNullableZipCodeSchema,
  instagramHandle: optionalNullableTextSchema,
  cref: optionalNullableTextSchema,
  professionalSummary: optionalNullableTextSchema,
  lattesUrl: optionalNullableUrlSchema,
  companyDocument: optionalNullableCnpjSchema,
  bankCode: optionalNullableTextSchema,
  bankName: optionalNullableTextSchema,
  bankBranch: optionalNullableTextSchema,
  bankAccount: optionalNullableTextSchema,
  pixKey: optionalNullableTextSchema,
  avatar: optionalNullableUrlSchema,
  admissionDate: optionalNullableDateSchema,
  currentStatus: optionalNullableTextSchema,
  operationalRoleIds: z.array(z.string().trim().min(1, 'Cargo invalido')).optional(),
  hourlyRates: professorHourlyRatesNullableSchema.optional(),
  hasSignedContract: z.boolean().optional(),
  signedContractDocumentUrl: optionalNullableUrlSchema,
  collaboratorFunctionId: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1, 'Funcao do colaborador invalida').optional()
  ),
  responsibleManagerId: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1, 'Gestor responsavel invalido').optional()
  ),
}).superRefine((data, ctx) => {
  if (data.hasSignedContract && !data.signedContractDocumentUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['signedContractDocumentUrl'],
      message: 'Envie o PDF do contrato assinado',
    });
  }
});

export const CreateCollaboratorFunctionSchema = z.object({
  name: z.string().trim().min(2, 'Nome da funcao deve ter no minimo 2 caracteres'),
  isActive: z.boolean().optional(),
  permissions: accessPermissionSelectionSchema.optional(),
});

export const UpdateCollaboratorFunctionSchema = z.object({
  name: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(2, 'Nome da funcao deve ter no minimo 2 caracteres').optional()
  ),
  isActive: z.boolean().optional(),
  permissions: accessPermissionSelectionSchema.optional(),
});

export const CreateServiceSchema = z.object({
  name: z.string().trim().min(2, 'Nome do servico deve ter no minimo 2 caracteres'),
  isActive: z.boolean().optional(),
});

export const UpdateServiceSchema = z.object({
  name: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(2, 'Nome do servico deve ter no minimo 2 caracteres').optional()
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
  serviceId: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
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
          q8: z.boolean(),
        })
        .optional(),
      formResponses: z.record(z.unknown()).optional(),
    })
    .optional(),
});

export const UpdateAlunoSchema = z.object({
  serviceId: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
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
          q8: z.boolean(),
        })
        .optional(),
      formResponses: z.record(z.unknown()).optional(),
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
