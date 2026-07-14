import { describe, expect, it, vi } from 'vitest';
import type { CreateAlunoDTO, CreateAlunoResult } from './aluno.service';
import { installStudentContractProfileCreateAdapter } from './student-contract-profile-create-adapter';

const buildRoot = () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <input name="intakeForm.financialInfo.contractStartDate" type="date" value="2026-01-31" />
    <select name="intakeForm.financialInfo.contractDurationUnit">
      <option value="months" selected>Meses</option>
    </select>
    <input name="intakeForm.financialInfo.contractDurationQuantity" value="1" />
    <button type="button" data-student-contract-due-date-action="true">Remover vencimento</button>
  `;
  return root;
};

const createPayload: CreateAlunoDTO = {
  name: 'Aluno Teste',
  email: 'aluno@example.com',
  schedulePlan: 'free',
  age: 30,
  intakeForm: {
    formResponses: {
      financial: {
        contractDueDate: '',
      },
    },
  },
};

const createResult: CreateAlunoResult = {
  aluno: {
    id: 'student-1',
    userId: 'user-1',
    professorId: 'professor-1',
    schedulePlan: 'free',
    age: 30,
    user: {
      email: 'aluno@example.com',
      profile: {
        name: 'Aluno Teste',
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  tempPassword: 'temporary-password',
};

describe('student contract profile create adapter', () => {
  it('persists the calculated due date in the new student profile', async () => {
    const root = buildRoot();
    const originalCreate = vi.fn(async () => createResult);
    const service = { create: originalCreate };
    const uninstall = installStudentContractProfileCreateAdapter(service, root);

    await service.create(createPayload);

    expect(originalCreate).toHaveBeenCalledWith({
      ...createPayload,
      intakeForm: {
        formResponses: {
          financial: {
            contractDueDate: '2026-02-28',
          },
        },
      },
    });

    uninstall();
  });

  it('keeps the profile empty when the due date is intentionally removed', async () => {
    const root = buildRoot();
    const originalCreate = vi.fn(async () => createResult);
    const service = { create: originalCreate };
    const uninstall = installStudentContractProfileCreateAdapter(service, root);

    root
      .querySelector<HTMLButtonElement>('[data-student-contract-due-date-action="true"]')!
      .click();
    await service.create({
      ...createPayload,
      intakeForm: {
        formResponses: {
          financial: {
            contractDueDate: '2026-02-28',
          },
        },
      },
    });

    expect(originalCreate).toHaveBeenCalledWith({
      ...createPayload,
      intakeForm: {
        formResponses: {
          financial: {
            contractDueDate: '',
          },
        },
      },
    });

    uninstall();
    expect(service.create).toBe(originalCreate);
  });
});
