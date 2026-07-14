import { describe, expect, it, vi } from 'vitest';
import {
  alunoService,
  type StudentContractLink,
} from './aluno.service';
import {
  appendContractEndDate,
  installStudentContractEndDateAdapter,
  STUDENT_CONTRACTS_CHANGED_EVENT,
  type StudentContractsChangedDetail,
} from './student-contract-end-date-adapter';

const buildLink = (overrides: Partial<StudentContractLink> = {}): StudentContractLink => ({
  id: 'student-contract-1',
  alunoId: 'student-1',
  contractId: 'contract-1',
  status: 'active',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  contract: {
    id: 'contract-1',
    title: 'Contrato anual',
    status: 'SIGNED',
    createdAt: '2026-01-01T00:00:00.000Z',
    companyContractId: 'company-contract-1',
  },
  ...overrides,
});

describe('student contract end date adapter', () => {
  it('adds the calculated due date to the contract-link payload', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<input name="intakeForm.financialInfo.contractDueDate" value="2026-12-31" />';

    expect(appendContractEndDate({ startDate: '2026-01-01' }, root)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
  });

  it('sends null when the due date field is intentionally cleared', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<input name="intakeForm.financialInfo.contractDueDate" value="" />';

    expect(appendContractEndDate({ startDate: '2026-01-01' }, root)).toEqual({
      startDate: '2026-01-01',
      endDate: null,
    });
  });

  it('persists endDate and emits a refresh event after a successful update', async () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<input name="intakeForm.financialInfo.contractDueDate" value="2026-10-15" />';

    const originalLink = vi.fn(async () => buildLink());
    const originalUpdate = vi.fn(async () => buildLink());
    const originalActivate = vi.fn(async () => buildLink());
    const service = {
      linkStudentContract: originalLink,
      updateStudentContract: originalUpdate,
      activateStudentContract: originalActivate,
    } as Pick<
      typeof alunoService,
      'linkStudentContract' | 'updateStudentContract' | 'activateStudentContract'
    >;
    const target = new EventTarget();
    const changedAlunoIds: string[] = [];
    target.addEventListener(STUDENT_CONTRACTS_CHANGED_EVENT, (event) => {
      changedAlunoIds.push(
        (event as CustomEvent<StudentContractsChangedDetail>).detail.alunoId
      );
    });

    const uninstall = installStudentContractEndDateAdapter(service, root, target);

    await service.updateStudentContract('student-1', 'student-contract-1', {
      startDate: '2026-01-01',
    });

    expect(originalUpdate).toHaveBeenCalledWith(
      'student-1',
      'student-contract-1',
      {
        startDate: '2026-01-01',
        endDate: '2026-10-15',
      }
    );
    expect(changedAlunoIds).toEqual(['student-1']);

    uninstall();
    expect(service.updateStudentContract).not.toBe(originalUpdate);
  });
});
