import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional()
);

const nullableText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().nullable().optional()
);

const optionalDate = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return value === null ? null : undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed;
    }
    return value;
  },
  z.date().nullable().optional()
);

const category = z.enum(['assessment', 'individual_service', 'combined_plan']);
const priceType = z.enum(['fixed', 'free', 'on_request']);
const order = z.number().int().min(0, 'A ordem deve ser maior ou igual a zero');

export const ServiceCatalogImpactConfirmationSchema = z.object({
  resourceUpdatedAt: z.string().datetime({ offset: true }),
  affectedPlans: z.number().int().min(0),
});

export const CreateCatalogServiceSchema = z.object({
  name: z.string().trim().min(2, 'Informe um nome com pelo menos 2 caracteres'),
  code: z.string().trim().min(2, 'Informe um código estável'),
  category,
  summary: optionalText,
  whatIs: optionalText,
  targetAudience: optionalText,
  displayOrder: order.optional(),
  isActive: z.boolean().optional(),
});

export const UpdateCatalogServiceSchema = z.object({
  name: z.string().trim().min(2, 'Informe um nome com pelo menos 2 caracteres').optional(),
  code: z.string().trim().min(2, 'Informe um código estável').optional(),
  category: category.optional(),
  summary: nullableText,
  whatIs: nullableText,
  targetAudience: nullableText,
  displayOrder: order.optional(),
  isActive: z.boolean().optional(),
  impactConfirmation: ServiceCatalogImpactConfirmationSchema.optional(),
});

export const CreateCommercialOptionSchema = z.object({
  code: z.string().trim().min(2, 'Informe um código estável para a opção'),
  name: z.string().trim().min(2, 'Informe um nome para a opção'),
  frequency: optionalText,
  quantity: z.number().positive('A quantidade deve ser maior que zero').optional(),
  unit: optionalText,
  priceType,
  priceAmount: z.number().positive('O valor deve ser maior que zero').optional(),
  validFrom: optionalDate,
  validUntil: optionalDate,
  isActive: z.boolean().optional(),
  displayOrder: order.optional(),
});

export const UpdateCommercialOptionSchema = z.object({
  code: z.string().trim().min(2).optional(),
  name: z.string().trim().min(2).optional(),
  frequency: nullableText,
  quantity: z.number().positive().nullable().optional(),
  unit: nullableText,
  priceType: priceType.optional(),
  priceAmount: z.number().positive().nullable().optional(),
  validFrom: optionalDate,
  validUntil: optionalDate,
  isActive: z.boolean().optional(),
  displayOrder: order.optional(),
  impactConfirmation: ServiceCatalogImpactConfirmationSchema.optional(),
});

export const CreatePresentationItemSchema = z.object({
  text: z.string().trim().min(1, 'Informe o conteúdo do item'),
  isActive: z.boolean().optional(),
  displayOrder: order.optional(),
});

export const UpdatePresentationItemSchema = z.object({
  text: z.string().trim().min(1, 'Informe o conteúdo do item').optional(),
  isActive: z.boolean().optional(),
  displayOrder: order.optional(),
});

export const CreatePlanComponentSchema = z.object({
  targetServiceId: optionalText,
  targetOptionId: optionalText,
  quantity: z.number().positive('A quantidade deve ser maior que zero').optional(),
  unit: optionalText,
  notes: optionalText,
  isActive: z.boolean().optional(),
  displayOrder: order.optional(),
});

export const UpdatePlanComponentSchema = z.object({
  targetServiceId: nullableText,
  targetOptionId: nullableText,
  quantity: z.number().positive().nullable().optional(),
  unit: nullableText,
  notes: nullableText,
  isActive: z.boolean().optional(),
  displayOrder: order.optional(),
});

export const ReorderCatalogItemsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1, 'Informe ao menos um item'),
});
