export interface TenantPageScanInput {
  pageSize: number;
  scannedRows: number;
  tenantCandidateRows: number;
  allowedPageMultiples?: number;
}

export interface TenantPageScanResult {
  maximumAllowedRows: number;
  scanRatio: number;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} deve ser um inteiro positivo`);
  }
  return value;
}

/**
 * Validates a tenant-scoped page plan. Deliberately accepts no global row count:
 * rows from unrelated tenants must never make a degraded target-tenant plan pass.
 */
export function assertTenantPageScanIsProportional(
  input: TenantPageScanInput
): TenantPageScanResult {
  const pageSize = positiveInteger(input.pageSize, 'pageSize');
  const tenantCandidateRows = positiveInteger(
    input.tenantCandidateRows,
    'tenantCandidateRows'
  );
  const allowedPageMultiples = positiveInteger(
    input.allowedPageMultiples ?? 3,
    'allowedPageMultiples'
  );

  if (!Number.isFinite(input.scannedRows) || input.scannedRows < 0) {
    throw new Error('scannedRows deve ser um número não negativo');
  }

  if (tenantCandidateRows <= pageSize) {
    throw new Error(
      `Dataset insuficiente: ${tenantCandidateRows} candidatos não discriminam uma página de ${pageSize}`
    );
  }

  const maximumAllowedRows = pageSize * allowedPageMultiples;
  if (input.scannedRows >= tenantCandidateRows) {
    throw new Error(
      `Listagem varreu todos ou mais registros do tenant alvo: ${input.scannedRows}/${tenantCandidateRows}`
    );
  }
  if (input.scannedRows > maximumAllowedRows) {
    throw new Error(
      `Listagem leu ${input.scannedRows} linhas para uma página de ${pageSize}; máximo permitido ${maximumAllowedRows}`
    );
  }

  return {
    maximumAllowedRows,
    scanRatio: input.scannedRows / tenantCandidateRows,
  };
}
