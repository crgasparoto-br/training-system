import { describe, expect, it } from 'vitest';
import type { StudentContractLink } from './aluno.service';
import { parseContractCivilDate, resolveContractValidity } from './contract-validity';

const buildLink = (overrides: Partial<StudentContractLink> = {}): StudentContractLink => ({
  id: 'student-contract-1',
  alunoId: 'student-1',
  contractId: 'contract-1',
  status: 'active',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-12-31T00:00:00.000Z',
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

const referenceDate = new Date('2026-07-14T12:00:00-03:00');

describe('contract validity', () => {
  it('parses contract dates as civil dates instead of UTC instants', () => {
    const parsed = parseContractCivilDate('2026-07-14T00:00:00.000Z');

    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(6);
    expect(parsed?.getDate()).toBe(14);
  });

  it('identifies an active signed contract as current', () => {
    expect(resolveContractValidity('SIGNED', buildLink(), referenceDate)).toEqual({
      status: 'current',
      label: 'Vigente',
    });
  });

  it('keeps a contract current throughout its final civil day', () => {
    expect(
      resolveContractValidity(
        'SIGNED',
        buildLink({ endDate: '2026-07-14T00:00:00.000Z' }),
        referenceDate
      )
    ).toEqual({ status: 'current', label: 'Vigente' });
  });

  it('identifies a signed contract as expired on the following civil day', () => {
    expect(
      resolveContractValidity(
        'SIGNED',
        buildLink({ endDate: '2026-07-13T00:00:00.000Z' }),
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
