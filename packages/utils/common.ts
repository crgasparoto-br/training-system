import { Response } from 'express';

// ============================================================================
// RESPOSTAS HTTP
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message: string = 'Sucesso',
  statusCode: number = 200
): Response {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  });
}

export function sendError(
  res: Response,
  error: string,
  statusCode: number = 400
): Response {
  return res.status(statusCode).json({
    success: false,
    error,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// CÁLCULOS DE TREINO
// ============================================================================

/**
 * Calcular zonas de frequência cardíaca baseado em FC Máxima
 */
export function calculateHeartRateZones(maxHeartRate: number) {
  return {
    zone1: {
      name: 'Recuperação',
      min: Math.round(maxHeartRate * 0.5),
      max: Math.round(maxHeartRate * 0.6),
      percentage: '50-60%',
    },
    zone2: {
      name: 'Aeróbica Fácil',
      min: Math.round(maxHeartRate * 0.6),
      max: Math.round(maxHeartRate * 0.7),
      percentage: '60-70%',
    },
    zone3: {
      name: 'Aeróbica Moderada',
      min: Math.round(maxHeartRate * 0.7),
      max: Math.round(maxHeartRate * 0.8),
      percentage: '70-80%',
    },
    zone4: {
      name: 'Limiar Anaeróbico',
      min: Math.round(maxHeartRate * 0.8),
      max: Math.round(maxHeartRate * 0.9),
      percentage: '80-90%',
    },
    zone5: {
      name: 'VO2 Máximo',
      min: Math.round(maxHeartRate * 0.9),
      max: maxHeartRate,
      percentage: '90-100%',
    },
  };
}

/**
 * Calcular velocidades de treino baseado no Limiar Anaeróbico
 */
export function calculateTrainingPaces(anaerobicThreshold: number) {
  const lat = anaerobicThreshold;

  return {
    easyPace: {
      name: 'Ritmo Fácil',
      minSpeed: lat * 0.7,
      maxSpeed: lat * 0.8,
      percentage: '70-80% LAT',
    },
    moderatePace: {
      name: 'Ritmo Moderado',
      minSpeed: lat * 0.8,
      maxSpeed: lat * 0.9,
      percentage: '80-90% LAT',
    },
    thresholdPace: {
      name: 'Ritmo de Limiar',
      minSpeed: lat * 0.95,
      maxSpeed: lat * 1.05,
      percentage: '95-105% LAT',
    },
    vo2MaxPace: {
      name: 'Ritmo VO2 Máximo',
      minSpeed: lat * 1.05,
      maxSpeed: lat * 1.2,
      percentage: '105-120% LAT',
    },
    sprintPace: {
      name: 'Ritmo Sprint',
      minSpeed: lat * 1.2,
      maxSpeed: lat * 1.5,
      percentage: '120-150% LAT',
    },
  };
}

/**
 * Calcular IMC (Índice de Massa Corporal)
 */
export function calculateBMI(weight: number, height: number): number {
  const heightInMeters = height / 100;
  return weight / (heightInMeters * heightInMeters);
}

/**
 * Classificar IMC
 */
export function classifyBMI(bmi: number): string {
  if (bmi < 18.5) return 'Abaixo do peso';
  if (bmi < 25) return 'Peso normal';
  if (bmi < 30) return 'Sobrepeso';
  if (bmi < 35) return 'Obesidade Grau I';
  if (bmi < 40) return 'Obesidade Grau II';
  return 'Obesidade Grau III';
}

// ============================================================================
// UTILITÁRIOS DE DATA
// ============================================================================

/**
 * Obter semana do ano
 */
export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Obter início da semana
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

/**
 * Obter fim da semana
 */
export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

// ============================================================================
// UTILITÁRIOS DE STRING
// ============================================================================

/**
 * Gerar slug a partir de string
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Capitalizar primeira letra
 */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Truncar texto
 */
export function truncate(text: string, length: number): string {
  return text.length > length ? text.substring(0, length) + '...' : text;
}
