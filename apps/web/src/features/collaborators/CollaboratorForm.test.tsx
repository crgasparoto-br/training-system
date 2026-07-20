import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import type {
  BankOption,
  CollaboratorFunctionOption,
  HourlyRateLevel,
} from '@corrida/types';
import { CollaboratorForm } from './CollaboratorForm';
import {
  createCollaboratorFormValues,
  type CollaboratorFormValues,
} from './collaborator-model';

function Fixture() {
  const form = useForm<CollaboratorFormValues>({
    defaultValues: {
      ...createCollaboratorFormValues(),
      collaboratorFunctionId: 'function-1',
      hourlyRates: { personal: '120,00', consulting: '', evaluation: '' },
    },
  });

  return (
    <CollaboratorForm
      mode="edit"
      register={form.register}
      watch={form.watch}
      setValue={form.setValue}
      errors={form.formState.errors}
      collaboratorFunctions={[
        { id: 'function-1', name: 'Professor', code: 'professor', isActive: true },
      ] as CollaboratorFunctionOption[]}
      managers={[]}
      banks={[
        { code: '001', description: 'Banco do Brasil' },
      ] as BankOption[]}
      hourlyRateLevels={[
        { id: 'ouro', label: 'Ouro', order: 1, minValue: 100, maxValue: 200, isActive: true },
      ] as HourlyRateLevel[]}
      showCollaboratorBlock
      showManagerBlock
      administrativeFieldsEnabled
      signedContractUploadEnabled
      uploadingAvatar={false}
      uploadingContract={false}
      onAvatarFile={vi.fn()}
      onContractFile={vi.fn()}
      onCancel={vi.fn()}
      submitting={false}
    />
  );
}

describe('CollaboratorForm', () => {
  it('mantém os blocos cadastrais e remove a edição concorrente do contrato legado', () => {
    const { container } = render(<Fixture />);

    expect(screen.getByText('CEP')).toBeInTheDocument();
    expect(container.querySelector('input[name="addressZipCode"]')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Banco' })).toBeInTheDocument();
    expect(screen.getByLabelText('Valor/hora personal')).toHaveValue('120,00');
    expect(screen.getByText('Ouro')).toBeInTheDocument();
    expect(screen.queryByText('Contrato legado')).not.toBeInTheDocument();
    expect(screen.queryByText('Enviar contrato')).not.toBeInTheDocument();
    expect(screen.getByText('Enviar foto')).toBeInTheDocument();
  });
});
