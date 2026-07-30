import { z } from 'zod';
import type {
  CapacityPrescriptionParameters,
  PhysicalCapacityType,
} from '@corrida/types';
import { PHYSICAL_CAPACITY_TYPES } from '@corrida/types';

const optionalText = z.string().trim().optional().nullable();
const optionalPse = z.number().min(0).max(10).optional().nullable();

const resistedBodySchema = z
  .object({
    muscleGroups: z.array(z.string().trim().min(1)).optional(),
    method: optionalText,
    split: optionalText,
    sets: z.number().int().positive().optional().nullable(),
    repetitions: optionalText,
    load: optionalText,
    repetitionReserve: optionalText,
    expectedPse: optionalPse,
    restrictions: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

const cyclicZoneSchema = z
  .object({
    name: z.string().trim().min(1),
    volume: optionalText,
    targetHeartRate: optionalText,
    pace: optionalText,
    minPercent: z.number().min(0).max(100).optional().nullable(),
    maxPercent: z.number().min(0).max(100).optional().nullable(),
  })
  .strict()
  .refine(
    (zone) =>
      zone.minPercent === null ||
      zone.minPercent === undefined ||
      zone.maxPercent === null ||
      zone.maxPercent === undefined ||
      zone.minPercent <= zone.maxPercent,
    { message: 'Percentual mínimo da zona não pode superar o máximo' }
  );

const cyclicBodySchema = z
  .object({
    category: optionalText,
    reversibilityPrinciple: optionalText,
    zoneBasis: z
      .enum(['max_hr', 'heart_rate_reserve', 'lan', 'vo2max', 'pse'])
      .optional()
      .nullable(),
    zones: z.array(cyclicZoneSchema).optional(),
    vo2MaxPercentage: z.number().positive().max(200).optional().nullable(),
    anaerobicThreshold: optionalText,
    time: optionalText,
    distance: optionalText,
    expectedPse: optionalPse,
  })
  .strict();

const flexibilityBodySchema = z
  .object({
    articulations: z
      .array(
        z
          .object({
            name: z.string().trim().min(1),
            angle: z.number().optional().nullable(),
            deficit: optionalText,
            priority: z.enum(['low', 'medium', 'high']).optional().nullable(),
            suggestedPrescription: optionalText,
          })
          .strict()
      )
      .optional(),
    expectedPse: optionalPse,
  })
  .strict();

const balanceBodySchema = z
  .object({
    focus: optionalText,
    supports: z.array(z.string().trim().min(1)).optional(),
    progressionNotes: optionalText,
    expectedPse: optionalPse,
  })
  .strict();

export class CapacityPlanningValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapacityPlanningValidationError';
  }
}

function normalizeOne(
  capacity: PhysicalCapacityType,
  value: unknown
): CapacityPrescriptionParameters {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  try {
    switch (capacity) {
      case 'resisted': {
        const body =
          record?.type === 'resisted'
            ? resistedBodySchema.parse(record.resisted)
            : resistedBodySchema.parse(value);
        return { type: 'resisted', resisted: body };
      }
      case 'cyclic': {
        const body =
          record?.type === 'cyclic'
            ? cyclicBodySchema.parse(record.cyclic)
            : cyclicBodySchema.parse(value);
        return { type: 'cyclic', cyclic: body };
      }
      case 'flexibility': {
        const body =
          record?.type === 'flexibility'
            ? flexibilityBodySchema.parse(record.flexibility)
            : flexibilityBodySchema.parse(value);
        return { type: 'flexibility', flexibility: body };
      }
      case 'balance': {
        const body =
          record?.type === 'balance'
            ? balanceBodySchema.parse(record.balance)
            : balanceBodySchema.parse(value);
        return { type: 'balance', balance: body };
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new CapacityPlanningValidationError(
        `Parâmetros técnicos inválidos para a capacidade ${capacity}`
      );
    }
    throw error;
  }
}

export function normalizeCapacityPlanningParameters(
  value: unknown
): Partial<Record<PhysicalCapacityType, CapacityPrescriptionParameters>> {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CapacityPlanningValidationError(
      'Parâmetros técnicos do planejamento devem ser um objeto por capacidade'
    );
  }

  const allowed = new Set<string>(PHYSICAL_CAPACITY_TYPES);
  const result: Partial<Record<PhysicalCapacityType, CapacityPrescriptionParameters>> = {};

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      throw new CapacityPlanningValidationError(
        `Capacidade técnica inválida no planejamento: ${key}`
      );
    }
    const capacity = key as PhysicalCapacityType;
    result[capacity] = normalizeOne(capacity, item);
  }

  return result;
}
