// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LeadForm } from './LeadForm';

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
    render(
      <MemoryRouter>
        <LeadForm
          title="Novo lead"
          description="Teste"
          responsibleProfessors={[]}
          submitLabel="Salvar"
          submitting={false}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Telefone adicional')).toBeInTheDocument();
    expect(screen.getByText('E-mail adicional')).toBeInTheDocument();
  });
});
