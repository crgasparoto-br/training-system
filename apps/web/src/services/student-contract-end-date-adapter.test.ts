import { describe, expect, it, vi } from 'vitest';
import type {
  AlunoContractsResponse,
  LinkStudentContractDTO,
  StudentContractLink,
  UpdateStudentContractDTO,
} from './aluno.service';
import {
  appendContractEndDate,
  calculateContractEndDate,
  installStudentContractEndDateAdapter,
  normalizeAlunoContractsResponseDates,
  patchProfileContractDueDate,
  STUDENT_CONTRACTS_CHANGED_EVENT,
  type StudentContractsChangedDetail,
} from './student-contract-end-date-adapter';

const buildLink = (overrides: Partial<StudentContractLink> = {}): StudentContractLink => ({
  id: 'student-contract-1',
  alunoId: 'student-1',
  contractId: 'contract-1',
  status: 'active',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-12-31T00:00:00.000Z',
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

const buildRoot = () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <input name="intakeForm.financialInfo.contractStartDate" type="date" value="2026-01-31" />
    <select name="intakeForm.financialInfo.contractDurationUnit">
      <option value="months" selected>Meses</option>
    </select>
    <input name="intakeForm.financialInfo.contractDurationQuantity" value="1" />
    <div>
      <label>Vencimento do Contrato</label>
      <div><input type="date" value="" readonly disabled /></div>
    </div>
  `;
  return root;
};

const buildService = () => {
  const originalUpdate = vi.fn(async (_alunoId: string, data: Record<string, unknown>) => data);
  const originalLink = vi.fn(
    async (_alunoId: string, _data: LinkStudentContractDTO) => buildLink()
  );
  const originalContractUpdate = vi.fn(
    async (_alunoId: string, _linkId: string, data: UpdateStudentContractDTO) =>
      buildLink({ endDate: data.endDate ?? null })
  );
  const originalActivate = vi.fn(async () => buildLink());
  const originalList = vi.fn(async (): Promise<AlunoContractsResponse> => ({
    alunoId: 'student-1',
    activeContract: buildLink(),
    contracts: [buildLink()],
  }));

  return {
    service: {
      update: originalUpdate,
      linkStudentContract: originalLink,
      updateStudentContract: originalContractUpdate,
      activateStudentContract: originalActivate,
      listStudentContracts: originalList,
    },
    originalUpdate,
    originalLink,
    originalContractUpdate,
    originalActivate,
    originalList,
  };
};

describe('student contract end date adapter', () => {
  it('calculates civil dates without overflowing the original day of month', () => {
    expect(calculateContractEndDate('2026-01-31', 'months', '1')).toBe('2026-02-28');
    expect(calculateContractEndDate('2024-02-29', 'years', '1')).toBe('2025-02-28');
  });

  it('derives endDate from the real timing controls even when the display has no name', () => {
    const root = buildRoot();

    expect(
      appendContractEndDate({ startDate: '2026-01-31' }, root)
    ).toEqual({
      startDate: '2026-01-31',
      endDate: '2026-02-28',
    });
  });

  it('patches the persisted financial response together with the contract link', async () => {
    const root = buildRoot();
    const {
      service,
      originalUpdate,
      originalContractUpdate,
    } = buildService();
    const target = new EventTarget();
    const changedAlunoIds: string[] = [];
    target.addEventListener(STUDENT_CONTRACTS_CHANGED_EVENT, (event) => {
      changedAlunoIds.push(
        (event as CustomEvent<StudentContractsChangedDetail>).detail.alunoId
      );
    });

    const uninstall = installStudentContractEndDateAdapter(
      service,
      root,
      target
    );

    await service.update('student-1', {
      intakeForm: {
        formResponses: {
          financial: { contractDueDate: '' },
        },
      },
    });
    await service.updateStudentContract('student-1', 'student-contract-1', {
      startDate: '2026-01-31',
    });

    expect(originalUpdate).toHaveBeenCalledWith('student-1', {
      intakeForm: {
        formResponses: {
          financial: { contractDueDate: '2026-02-28' },
        },
      },
    });
    expect(originalContractUpdate).toHaveBeenCalledWith(
      'student-1',
      'student-contract-1',
      { startDate: '2026-01-31', endDate: '2026-02-28' }
    );
    expect(changedAlunoIds).toEqual(['student-1']);
    expect(root.querySelector<HTMLInputElement>('input[disabled]')?.value).toBe('2026-02-28');

    uninstall();
  });

  it('allows an existing due date to be removed intentionally from the form', async () => {
    const root = buildRoot();
    root.querySelector<HTMLInputElement>(
      '[name="intakeForm.financialInfo.contractDurationQuantity"]'
    )!.value = '';
    const { service, originalUpdate, originalContractUpdate } = buildService();

    const uninstall = installStudentContractEndDateAdapter(
      service,
      root,
      new EventTarget(),
      { getExistingEndDate: () => '2026-12-31T00:00:00.000Z' }
    );

    const dueDateDisplay = root.querySelector<HTMLInputElement>('input[disabled]');
    expect(dueDateDisplay?.value).toBe('2026-12-31');

    const removeButton = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent === 'Remover vencimento'
    );
    expect(removeButton).toBeTruthy();
    removeButton?.click();

    await service.update('student-1', {
      intakeForm: {
        formResponses: {
          financial: { contractDueDate: '2026-12-31' },
        },
      },
    });
    await service.updateStudentContract('student-1', 'student-contract-1', {});

    expect(dueDateDisplay?.value).toBe('');
    expect(originalUpdate).toHaveBeenCalledWith('student-1', {
      intakeForm: {
        formResponses: {
          financial: { contractDueDate: '' },
        },
      },
    });
    expect(originalContractUpdate).toHaveBeenCalledWith(
      'student-1',
      'student-contract-1',
      { endDate: null }
    );

    uninstall();
  });

  it('persists endDate after generating a contract from an active template', async () => {
    const root = buildRoot();
    const { service, originalLink, originalContractUpdate } = buildService();
    const uninstall = installStudentContractEndDateAdapter(
      service,
      root,
      new EventTarget()
    );

    await service.linkStudentContract('student-1', {
      contractId: 'active-template:template-1',
      startDate: '2026-01-31',
    });

    expect(originalLink).toHaveBeenCalledWith('student-1', {
      contractId: 'active-template:template-1',
      startDate: '2026-01-31',
      endDate: '2026-02-28',
    });
    expect(originalContractUpdate).toHaveBeenCalledWith(
      'student-1',
      'student-contract-1',
      { endDate: '2026-02-28' }
    );

    uninstall();
  });

  it('normalizes persisted date-only timestamps for local display', () => {
    const normalized = normalizeAlunoContractsResponseDates({
      alunoId: 'student-1',
      activeContract: buildLink(),
      contracts: [buildLink()],
    });

    expect(normalized.activeContract?.endDate).toBe('2026-12-31T12:00:00');
    expect(normalized.contracts[0]?.startDate).toBe('2026-01-01T12:00:00');
  });

  it('does not change unrelated profile fields while patching the due date', () => {
    expect(
      patchProfileContractDueDate(
        {
          name: 'Aluno',
          intakeForm: {
            formResponses: {
              financial: { monthlyValue: '300,00' },
            },
          },
        },
        '2026-09-30'
      )
    ).toEqual({
      name: 'Aluno',
      intakeForm: {
        formResponses: {
          financial: {
            monthlyValue: '300,00',
            contractDueDate: '2026-09-30',
          },
        },
      },
    });
  });
});
