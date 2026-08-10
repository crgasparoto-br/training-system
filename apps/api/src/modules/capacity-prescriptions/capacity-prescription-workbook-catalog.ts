import type { CapacityTechnicalCatalogItemPayload } from '@corrida/types';

const workbookSource = {
  sourceWorkbook: 'ModeloTreinamento Combinado v. 3.12.8',
  sourceSheet: 'Siglas e ambiente',
};

const muscleGroups = [
  ['PT', 'Peitoral'],
  ['TB', 'Tríceps Braquial'],
  ['DR', 'Dorsais'],
  ['BB', 'Bíceps Braquial'],
  ['DA', 'Deltoide anterior'],
  ['DM', 'Deltoide Medial'],
  ['DP', 'Deltoide Posterior'],
  ['TP', 'Trapézio Fibras superiores'],
  ['GM', 'Glúteo Máximo'],
  ['AQ', 'Abdutores de quadril'],
  ['AD', 'Adutores de quadril'],
  ['QD', 'Quadríceps'],
  ['PC', 'Posterior de Coxa'],
  ['ABS', 'Abdomen'],
  ['AO', 'Oblíquos'],
  ['LEC', 'Lombar e eretores da coluna'],
  ['TS', 'Triceps Sural'],
  ['MR', 'Manguito Rotador'],
  ['FP', 'Flexores de punho'],
  ['EP', 'Extensores de punho'],
  ['TA', 'Tibial anterior'],
  ['G1', 'Grupo Muscular 1'],
  ['G2', 'Grupo Muscular 2'],
] as const;

const cyclicStimuli = [
  ['CEXT', 'Contínuo Extensivo'],
  ['CINT', 'Contínuo Intensivo'],
  ['IEXT', 'Intervalado Extensivo'],
  ['IINT', 'Intervalado Intensivo'],
  ['FLEK', 'FartLek'],
] as const;

const movementAcronyms = [
  ['FLQ', 'Flexão de quadril'],
  ['EXQ', 'Extensão de quadril'],
  ['ABQ', 'Abdução de quadril'],
  ['REQ', 'Rotação Externa de quadril'],
  ['AHO', 'Abdução Horizontal de ombro'],
  ['FLC', 'Flexão de coluna'],
  ['DSF', 'Dorsiflexão'],
  ['MA1', 'Movimento articular 1'],
  ['MA2', 'Movimento articular 2'],
  ['MA3', 'Movimento articular 3'],
  ['MA4', 'Movimento articular 4'],
  ['MA5', 'Movimento articular 5'],
] as const;

const exerciseSelectors = [
  'AbQ',
  'ABS + AO',
  'AD',
  'AhO',
  'AO',
  'AQ',
  'BB',
  'BB + DM + TP',
  'CEXT',
  'CINT',
  'DA',
  'DM',
  'DR + BB + DP',
  'DR + DP',
  'DsF',
  'EP',
  'ExQ',
  'FlC',
  'FlQ',
  'FP',
  'GM',
  'GM + PC',
  'GM + QD',
  'IEXT',
  'IINT',
  'LEC',
  'MR',
  'Outros',
  'PC',
  'PT + DA',
  'PT + DP',
  'PT + TB + DA',
  'QD',
  'TA',
  'TB',
  'TB + BB + DA + DM + TP + MR',
  'TB + DA',
  'TP',
  'TS',
] as const;

function sourceMetadata(sourceSection: string, extra: Record<string, unknown> = {}) {
  return { ...workbookSource, sourceSection, ...extra };
}

function exerciseSelectorCode(label: string) {
  return `WB_EX_${label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')}`;
}

export const WORKBOOK_CAPACITY_CATALOG_ITEMS: CapacityTechnicalCatalogItemPayload[] = [
  {
    category: 'environment',
    code: 'BOSFIT',
    name: 'BOSFit',
    metadata: sourceMetadata('Ambiente'),
  },
  {
    category: 'articulation',
    code: 'DEDOS',
    name: 'Dedos',
    metadata: {
      sourceWorkbook: 'Ideias e estruturação - Professor',
      sourceSection: 'Flexibilidade por articulação',
    },
  },
  ...muscleGroups.map(([code, name]) => ({
    category: 'muscle_group' as const,
    code,
    name,
    metadata: sourceMetadata('Grupo Muscular'),
  })),
  ...cyclicStimuli.map(([code, name]) => ({
    category: 'cyclic_stimulus' as const,
    code,
    name,
    metadata: sourceMetadata('Estímulo Cíclico'),
  })),
  ...movementAcronyms.map(([code, name]) => ({
    category: 'acronym' as const,
    code,
    name,
    metadata: sourceMetadata('Movimento'),
  })),
  ...exerciseSelectors.map((name) => ({
    category: 'exercise' as const,
    code: exerciseSelectorCode(name),
    name,
    metadata: sourceMetadata('Exercícios', { selector: true }),
  })),
];
