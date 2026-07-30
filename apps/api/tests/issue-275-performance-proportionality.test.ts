import { assertTenantPageScanIsProportional } from '../scripts/issue-275-performance-proportionality.js';

describe('Issue 275 tenant-scoped performance oracle', () => {
  it('accepts an index-backed page whose reads stay proportional to the page', () => {
    expect(
      assertTenantPageScanIsProportional({
        pageSize: 20,
        scannedRows: 20,
        tenantCandidateRows: 301,
      })
    ).toEqual({ maximumAllowedRows: 60, scanRatio: 20 / 301 });
  });

  it('rejects the escaped full-tenant scan even when other tenants contain many rows', () => {
    const unrelatedTenantRows = 1_500;
    expect(unrelatedTenantRows).toBeGreaterThan(301);

    expect(() =>
      assertTenantPageScanIsProportional({
        pageSize: 20,
        scannedRows: 301,
        tenantCandidateRows: 301,
      })
    ).toThrow('Listagem varreu todos ou mais registros do tenant alvo');
  });

  it('rejects a partial scan that is still disproportionate to the requested page', () => {
    expect(() =>
      assertTenantPageScanIsProportional({
        pageSize: 20,
        scannedRows: 80,
        tenantCandidateRows: 301,
      })
    ).toThrow('máximo permitido 60');
  });

  it('rejects a dataset too small to distinguish pagination from a full scan', () => {
    expect(() =>
      assertTenantPageScanIsProportional({
        pageSize: 20,
        scannedRows: 20,
        tenantCandidateRows: 20,
      })
    ).toThrow('Dataset insuficiente');
  });
});
