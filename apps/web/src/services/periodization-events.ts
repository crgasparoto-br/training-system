export const PERIODIZATION_MATRIX_UPDATED_EVENT = 'periodization:matrix-updated';

export type PeriodizationMatrixUpdatedDetail = {
  matrixId: string;
  planId?: string;
  source: 'matrix' | 'resisted' | 'cyclic' | 'nutrition';
};

export function notifyPeriodizationMatrixUpdated(
  detail: PeriodizationMatrixUpdatedDetail
): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<PeriodizationMatrixUpdatedDetail>(PERIODIZATION_MATRIX_UPDATED_EVENT, {
      detail,
    })
  );
}

export function shouldRefreshPeriodizationMatrix(
  planId: string,
  matrixId: string | null | undefined,
  detail: PeriodizationMatrixUpdatedDetail | null | undefined
): boolean {
  if (!detail) return false;
  if (detail.planId === planId) return true;
  return Boolean(matrixId && detail.matrixId === matrixId);
}
