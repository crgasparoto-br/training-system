import { z } from 'zod';

// ============================================================================
// AUTENTICAÇÃO
// ============================================================================

export const LoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

export const RegisterSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  type: z.literal('educator'),
  contractType: z.enum(['academy', 'personal'], {
    errorMap: () => ({ message: 'Tipo de contrato deve ser academy ou personal' }),
  }),
  document: z.string().min(11, 'Documento inválido'),
});

export const CreateEducatorSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

// ============================================================================
// ATLETAS
// ============================================================================

export const CreateAthleteSchema = z.object({
  age: z.number().int().min(18).max(100),
  weight: z.number().positive('Peso deve ser positivo'),
  height: z.number().positive('Altura deve ser positiva'),
  vo2Max: z.number().positive('VO2 Max deve ser positivo'),
  anaerobicThreshold: z.number().positive('Limiar Anaeróbico deve ser positivo'),
  maxHeartRate: z.number().int().positive('FC Máxima deve ser positiva'),
  restingHeartRate: z.number().int().positive('FC Repouso deve ser positiva'),
  bodyFatPercentage: z.number().optional(),
});

export const UpdateAthleteSchema = CreateAthleteSchema.partial();

// ============================================================================
// TIPOS INFERIDOS
// ============================================================================

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type CreateAthleteInput = z.infer<typeof CreateAthleteSchema>;
export type UpdateAthleteInput = z.infer<typeof UpdateAthleteSchema>;
