import { describe, expect, it } from 'vitest';
import type { StudentContractLink } from './aluno.service';
import { resolveContractValidity } from './contract-validity';

const buildLink = (overrides: Partial<StudentContractLink> = {}): StudentContractLink => ({
  id: 'student-contract-1',
  alunoId: 'student-1',
  contractId: 'contract-1',
  status: 'active',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-12-31T23:59:59.999Z',
  signedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  contract: {
    id: 'contract-1',
    title: 'Contrato anual',
    status: 'SIGNED',
    createdAt: '2026-01-01T00:00:00.000Z',
    signedAt: '2026-01-01T00:00:00.000Z',
    companyContractId: 'company-contract-1',
  },
  ...overrides,
});

const referenceDate = new Date('2026-07-13T12:00:00.000Z');

describe('contract validity', () => {
  it('identifies an active signed contract as current', () => {
    expect(resolveContractValidity('SIGNED', buildLink(), referenceDate)).toEqual({
      status: 'current',
      label: 'Vigente',
    });
  });

  it('identifies a signed contract with a past end date as expired', () => {
    expect(
      resolveContractValidity(
        'SIGNED',
        buildLink({ endDate: '2026-07-12T23:59:59.999Z' }),
        referenceDate
      )
    ).toEqual({ status: 'expired', label: 'Vencido' });
  });

  it('identifies a signed contract with a future start date', () => {
    expect(
      resolveContractValidity(
        'SIGNED',
        buildLink({ status: 'pending_signature', startDate: '2026-08-01T00:00:00.000Z' }),
        referenceDate
      )
    ).toEqual({ status: 'future', label: 'Vigência futura' });
  });

  it('identifies canceled and terminated signed contracts as ended', () => {
    expect(
      resolveContractValidity('SIGNED', buildLink({ status: 'terminated' }), referenceDate)
    ).toEqual({ status: 'ended', label: 'Encerrado' });
  });

  it('shows when a signed document has no linked validity', () => {
    expect(resolveContractValidity('SIGNED', null, referenceDate)).toEqual({
      status: 'undefined',
      label: 'Sem vigência definida',
    });
  });

  it('does not add validity to documents that are not signed', () => {
    expect(resolveContractValidity('SENT', buildLink(), referenceDate)).toBeNull();
  });
});
