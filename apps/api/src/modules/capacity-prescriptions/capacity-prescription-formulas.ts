export const ADIPOMETRY_FORMULA_VERSION = 'guedes-three-fold-siri-v1';

export type AdipometrySex = 'male' | 'female';

export interface AdipometrySkinfoldsMm {
  triceps?: number | null;
  subscapular?: number | null;
  suprailiac?: number | null;
  abdominal?: number | null;
  thigh?: number | null;
}

export interface AdipometryCompositionInput {
  sex: AdipometrySex;
  weightKg: number;
  skinfoldsMm: AdipometrySkinfoldsMm;
}

export interface AdipometryCompositionResult {
  formulaVersion: typeof ADIPOMETRY_FORMULA_VERSION;
  densitySkinfoldSumMm: number;
  totalSkinfoldsMm: number;
  bodyDensity: number;
  bodyFatPercentage: number;
  fatMassKg: number;
  leanMassKg: number;
}

function assertPositiveFinite(value: number | null | undefined, field: string): number {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} deve ser maior que zero`);
  }
  return value;
}

function sumProvidedSkinfolds(skinfolds: AdipometrySkinfoldsMm) {
  const provided = Object.values(skinfolds).filter(
    (value): value is number => value !== null && value !== undefined
  );
  if (provided.length < 3) {
    throw new Error('Ao menos três dobras cutâneas devem ser informadas');
  }
  return provided.reduce((total, value) => total + assertPositiveFinite(value, 'Dobra cutânea'), 0);
}

/**
 * Reproduz a regra da planilha `Modelo Avaliação Física v.4.10.12`, aba
 * `Avaliação`, linha `% Gordura`, identificada pelo conjunto de coeficientes
 * como protocolo de Guedes com conversão da densidade corporal por Siri:
 *
 * - feminino: Subescapular + Suprailíaca + Coxa;
 * - masculino: Tricipital + Suprailíaca + Abdominal.
 */
export function calculateAdipometryComposition(
  input: AdipometryCompositionInput
): AdipometryCompositionResult {
  const weightKg = assertPositiveFinite(input.weightKg, 'Peso');
  const totalSkinfoldsMm = sumProvidedSkinfolds(input.skinfoldsMm);

  const densitySkinfoldSumMm =
    input.sex === 'female'
      ? assertPositiveFinite(input.skinfoldsMm.subscapular, 'Dobra subescapular') +
        assertPositiveFinite(input.skinfoldsMm.suprailiac, 'Dobra suprailíaca') +
        assertPositiveFinite(input.skinfoldsMm.thigh, 'Dobra da coxa')
      : assertPositiveFinite(input.skinfoldsMm.triceps, 'Dobra tricipital') +
        assertPositiveFinite(input.skinfoldsMm.suprailiac, 'Dobra suprailíaca') +
        assertPositiveFinite(input.skinfoldsMm.abdominal, 'Dobra abdominal');

  const bodyDensity =
    input.sex === 'female'
      ? 1.1665 - 0.07063 * Math.log10(densitySkinfoldSumMm)
      : 1.17136 - 0.06706 * Math.log10(densitySkinfoldSumMm);

  if (!Number.isFinite(bodyDensity) || bodyDensity <= 0) {
    throw new Error('Densidade corporal calculada é inválida');
  }

  const bodyFatPercentage = (4.95 / bodyDensity - 4.5) * 100;
  const fatMassKg = (bodyFatPercentage * weightKg) / 100;
  const leanMassKg = weightKg - fatMassKg;

  return {
    formulaVersion: ADIPOMETRY_FORMULA_VERSION,
    densitySkinfoldSumMm,
    totalSkinfoldsMm,
    bodyDensity,
    bodyFatPercentage,
    fatMassKg,
    leanMassKg,
  };
}
