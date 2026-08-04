// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LeadForm } from './LeadForm';

function renderLeadForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <MemoryRouter>
      <LeadForm
        title="Novo lead"
        description="Teste"
        responsibleProfessors={[]}
        submitLabel="Salvar"
        submitting={false}
        onSubmit={onSubmit}
      />
    </MemoryRouter>
  );
  return onSubmit;
}

describe('LeadForm duplicate confirmation boundary', () => {
  it('invalidates a previous duplicate review whenever an identifier changes', () => {
    const onIdentityChange = vi.fn();
    render(
      <MemoryRouter>
        <LeadForm
          title="Novo lead"
          description="Teste"
          responsibleProfessors={[]}
          submitLabel="Salvar"
          submitting={false}
          onIdentityChange={onIdentityChange}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText('(15) 99999-9999'), {
      target: { value: '(15) 98888-7777' },
    });
    fireEvent.change(screen.getByPlaceholderText('nome@exemplo.com'), {
      target: { value: 'nova@pessoa.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('000.000.000-00'), {
      target: { value: '123.456.789-00' },
    });

    expect(onIdentityChange).toHaveBeenCalledTimes(3);
  });

  it('exposes both optional secondary contact fields', () => {
    renderLeadForm();

    expect(screen.getByText('Telefone adicional')).toBeInTheDocument();
    expect(screen.getByText('E-mail adicional')).toBeInTheDocument();
  });

  it('keeps invalid data on screen and does not submit', () => {
    const onSubmit = renderLeadForm();

    fireEvent.change(screen.getByLabelText('CPF'), {
      target: { value: '11111111111' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Informe o nome completo.')).toBeInTheDocument();
    expect(screen.getByText('Informe a origem do contato.')).toBeInTheDocument();
    expect(screen.getByText('Informe um CPF válido.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('111.111.111-11')).toBeInTheDocument();
  });

  it('formats contacts and submits normalized values', async () => {
    const onSubmit = renderLeadForm();

    fireEvent.change(screen.getByLabelText(/Nome completo/), {
      target: { value: '  Maria   da Silva  ' },
    });
    fireEvent.change(screen.getByLabelText('Telefone'), {
      target: { value: '15999999999' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: ' MARIA@EXEMPLO.COM ' },
    });
    fireEvent.change(screen.getByLabelText(/Origem/), {
      target: { value: '  Indicação   interna ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Maria da Silva',
          phone: '(15) 99999-9999',
          email: 'maria@exemplo.com',
          origin: 'Indicação interna',
        })
      );
    });
  });
});
