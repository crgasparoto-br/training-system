import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import type { HourlyRateLevel } from '@corrida/types';
import { CollaboratorHourlyRates } from './CollaboratorHourlyRates';
import {
  createCollaboratorFormValues,
  type CollaboratorFormValues,
} from './collaborator-model';

const levels = [
  { id: 'ouro', label: 'Ouro', order: 1, minValue: 100, maxValue: 200, isActive: true },
] as HourlyRateLevel[];

function Fixture() {
  const form = useForm<CollaboratorFormValues>({
    defaultValues: {
      ...createCollaboratorFormValues(),
      hourlyRates: { personal: '150,00', consulting: '', evaluation: '' },
    },
  });
  return (
    <CollaboratorHourlyRates
      register={form.register}
      watch={form.watch}
      setValue={form.setValue}
      errors={form.formState.errors}
      levels={levels}
      disabled={false}
    />
  );
}

describe('CollaboratorHourlyRates', () => {
  it('exibe o nível calculado ao lado do valor', () => {
    render(<Fixture />);
    expect(screen.getByLabelText('Valor/hora personal')).toHaveValue('150,00');
    expect(screen.getByText('Ouro')).toBeInTheDocument();
  });
});
