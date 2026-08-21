import type { AssessmentScheduleType } from '@prisma/client';

export interface ProductTrainingParameterDefault {
  category: string;
  code: string;
  description: string;
  order: number;
  active: boolean;
}

export const PRODUCT_TRAINING_PARAMETERS: ProductTrainingParameterDefault[] = [
  { category: 'carga_microciclo', code: 'ADP', description: 'Adaptação', order: 1, active: true },
  { category: 'carga_microciclo', code: 'ORD', description: 'Ordenado', order: 2, active: true },
  { category: 'carga_microciclo', code: 'CHO', description: 'Choque', order: 3, active: true },
  { category: 'carga_microciclo', code: 'REG', description: 'Regenerativo', order: 4, active: true },
  { category: 'montagem', code: 'AS', description: 'Alternado por Segmento', order: 1, active: true },
  { category: 'montagem', code: 'A/AN', description: 'Agonista/Antagonista', order: 2, active: true },
  { category: 'montagem', code: 'CA', description: 'Circuito Aeróbico', order: 3, active: true },
  { category: 'montagem', code: 'CGM', description: 'Circuito Grupo Muscular', order: 4, active: true },
  { category: 'montagem', code: 'MIS', description: 'Misto', order: 5, active: true },
  { category: 'metodo', code: 'SER', description: 'Séries', order: 1, active: true },
  { category: 'metodo', code: 'BS', description: 'Bi-Set', order: 2, active: true },
  { category: 'metodo', code: 'TS', description: 'Tri-Set', order: 3, active: true },
  { category: 'metodo', code: 'SS', description: 'Super Set', order: 4, active: true },
  { category: 'metodo', code: 'CIR', description: 'Circuito', order: 5, active: true },
  { category: 'metodo', code: 'CS', description: 'Cluster Set', order: 6, active: true },
  { category: 'metodo', code: 'PC', description: 'Pirâmide Crescente', order: 7, active: true },
  { category: 'metodo', code: 'PD', description: 'Pirâmide Decrescente', order: 8, active: true },
  { category: 'metodo', code: 'DS', description: 'Drop Set', order: 9, active: true },
  { category: 'metodo', code: 'RP', description: 'Rest-Pause', order: 10, active: true },
  { category: 'metodo', code: 'SN', description: 'Strip Set', order: 11, active: true },
  { category: 'metodo', code: 'FST-7', description: 'FST-7', order: 12, active: true },
  { category: 'divisao_treino', code: 'FB', description: 'Full Body', order: 1, active: true },
  { category: 'divisao_treino', code: 'AB', description: 'AB (2 divisões)', order: 2, active: true },
  { category: 'divisao_treino', code: 'ABC', description: 'ABC (3 divisões)', order: 3, active: true },
  { category: 'divisao_treino', code: 'ABCD', description: 'ABCD (4 divisões)', order: 4, active: true },
  { category: 'divisao_treino', code: 'ABCDE', description: 'ABCDE (5 divisões)', order: 5, active: true },
];

export interface ProductAssessmentTypeDefault {
  name: string;
  code: string;
  scheduleType: AssessmentScheduleType;
  intervalMonths: number | null;
  isActive: boolean;
}

export const PRODUCT_ASSESSMENT_TYPES: ProductAssessmentTypeDefault[] = [
  {
    name: 'Avaliação Intermediária',
    code: 'intermediate',
    scheduleType: 'fixed_interval',
    intervalMonths: 2,
    isActive: true,
  },
  {
    name: 'Avaliação Completa',
    code: 'complete',
    scheduleType: 'fixed_interval',
    intervalMonths: 2,
    isActive: true,
  },
];
