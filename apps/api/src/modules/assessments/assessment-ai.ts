import { assessmentVariableLabels, ParsedAssessmentData } from './assessment-parser.js';
import { fetch, FormData, File } from 'undici';

type AiAssessmentResult = {
  metrics: Record<string, number | null>;
  variables: Record<string, number | string | null>;
  ai?: {
    used: boolean;
    model?: string;
    filledCount?: number;
    missingCount?: number;
    error?: string;
  };
};

const DEFAULT_MODEL = process.env.OPENAI_ASSESSMENT_MODEL || 'gpt-4o-mini';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const AI_ENABLED = process.env.ASSESSMENT_AI_ENABLED !== 'false';
const MIN_MISSING = Number.parseInt(process.env.ASSESSMENT_AI_MIN_MISSING || '1', 10);

const metricKeys = [
  'peso',
  'percent_gordura',
  'vo2max_ml',
  'vo2max_met',
  'fc_rep',
  'fc_max',
  'massa_magra',
  'gordura_absoluta',
  'limiar_anaerobio_kmh',
  'limiar_anaerobio_fc',
  'tmb_dia',
  'cit_med_ant',
] as const;

type MetricKey = (typeof metricKeys)[number];

const createFile = async (buffer: Buffer, filename: string) => {
  const form = new FormData();
  form.append('purpose', 'user_data');
  form.append('file', new File([buffer], filename, { type: 'application/pdf' }));

  const response = await fetch(`${OPENAI_BASE_URL}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI file upload failed: ${response.status} ${errorText}`);
  }

  return response.json();
};

const extractResponseText = (responseJson: any) => {
  if (typeof responseJson?.output_text === 'string') {
    return responseJson.output_text;
  }

  const output = responseJson?.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (typeof part?.text === 'string') {
          return part.text;
        }
      }
    }
  }

  return null;
};

const parseAiJson = (raw: string | null) => {
  if (!raw) return null;
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const candidate = raw.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

const filterVariables = (variables: Record<string, any>) => {
  const filtered: Record<string, number | null> = {};
  assessmentVariableLabels.forEach((label) => {
    const value = variables?.[label];
    filtered[label] = typeof value === 'number' ? value : value == null ? null : Number(value);
    if (!Number.isFinite(filtered[label] as number)) {
      filtered[label] = null;
    }
  });
  return filtered;
};

const filterMetrics = (metrics: Record<string, any>) => {
  const filtered: Record<string, number | null> = {};
  metricKeys.forEach((key) => {
    const value = metrics?.[key];
    filtered[key] = typeof value === 'number' ? value : value == null ? null : Number(value);
    if (!Number.isFinite(filtered[key] as number)) {
      filtered[key] = null;
    }
  });
  return filtered;
};

const buildPrompt = (missingMetrics: MetricKey[], missingVariables: string[]) => {
  return [
    'Você é um assistente que extrai dados de avaliação física esportiva a partir de um PDF.',
    'Extraia apenas números (sem unidades).',
    'Retorne JSON no formato:',
    '{ "metrics": { ... }, "variables": { ... } }',
    'Chaves esperadas em metrics:',
    metricKeys.join(', '),
    'Chaves esperadas em variables:',
    assessmentVariableLabels.join(', '),
    'Se não encontrar um valor, use null.',
    missingMetrics.length || missingVariables.length
      ? `Priorize preencher primeiro os campos ausentes. Faltando metrics: ${missingMetrics.join(
          ', '
        ) || 'nenhum'}. Faltando variables: ${missingVariables.join(', ') || 'nenhuma'}.`
      : 'Preencha todos os campos possíveis.',
  ].join('\n');
};

const requestAiExtraction = async (buffer: Buffer, filename: string, missingMetrics: MetricKey[], missingVariables: string[]) => {
  const file = await createFile(buffer, filename) as { id?: string };
  const fileId = file?.id;
  if (!fileId) {
    throw new Error('OpenAI file upload missing file id');
  }

  const payload = {
    model: DEFAULT_MODEL,
    temperature: 0,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: buildPrompt(missingMetrics, missingVariables) },
          { type: 'input_file', file_id: fileId },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'assessment_extract',
        schema: {
          type: 'object',
          properties: {
            metrics: {
              type: 'object',
              additionalProperties: { type: ['number', 'null'] },
            },
            variables: {
              type: 'object',
              additionalProperties: { type: ['number', 'null'] },
            },
          },
          required: ['metrics', 'variables'],
          additionalProperties: false,
        },
      },
    },
  };

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI response failed: ${response.status} ${errorText}`);
  }

  const responseJson = await response.json();
  const rawText = extractResponseText(responseJson);
  const parsed = parseAiJson(rawText);
  if (!parsed) {
    throw new Error('OpenAI response missing JSON payload');
  }

  return {
    metrics: filterMetrics(parsed.metrics || {}),
    variables: filterVariables(parsed.variables || {}),
  };
};

const countMissing = (data: ParsedAssessmentData) => {
  const missingMetrics = metricKeys.filter((key) => data.metrics[key] == null);
  const missingVariables = assessmentVariableLabels.filter(
    (label) => data.variables[label] == null
  );
  return { missingMetrics, missingVariables };
};

export const fillAssessmentWithAi = async (
  data: ParsedAssessmentData,
  buffer: Buffer,
  filename: string
): Promise<AiAssessmentResult> => {
  const { missingMetrics, missingVariables } = countMissing(data);
  const missingCount = missingMetrics.length + missingVariables.length;

  if (!AI_ENABLED || !OPENAI_API_KEY || missingCount < MIN_MISSING) {
    return {
      metrics: data.metrics,
      variables: data.variables,
      ai: {
        used: false,
        missingCount,
      },
    };
  }

  try {
    const aiResult = await requestAiExtraction(buffer, filename, missingMetrics, missingVariables);
    const mergedMetrics = { ...data.metrics };
    const mergedVariables = { ...data.variables };

    let filledCount = 0;
    metricKeys.forEach((key) => {
      if (mergedMetrics[key] == null && aiResult.metrics[key] != null) {
        mergedMetrics[key] = aiResult.metrics[key];
        filledCount += 1;
      }
    });
    assessmentVariableLabels.forEach((label) => {
      if (mergedVariables[label] == null && aiResult.variables[label] != null) {
        mergedVariables[label] = aiResult.variables[label];
        filledCount += 1;
      }
    });

    return {
      metrics: mergedMetrics,
      variables: mergedVariables,
      ai: {
        used: true,
        model: DEFAULT_MODEL,
        missingCount,
        filledCount,
      },
    };
  } catch (error) {
    return {
      metrics: data.metrics,
      variables: data.variables,
      ai: {
        used: true,
        model: DEFAULT_MODEL,
        missingCount,
        error: (error as Error)?.message || 'AI error',
      },
    };
  }
};
