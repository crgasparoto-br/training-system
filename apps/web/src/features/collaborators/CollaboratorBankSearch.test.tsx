import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BankOption } from '@corrida/types';
import { CollaboratorBankSearch } from './CollaboratorBankSearch';

const banks = [
  { code: '001', description: 'Banco do Brasil' },
  { code: '341', description: 'Itaú Unibanco' },
] as BankOption[];

describe('CollaboratorBankSearch', () => {
  it('pesquisa por nome e retorna apenas o código selecionado', () => {
    const onChange = vi.fn();
    render(<CollaboratorBankSearch banks={banks} value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Banco' }), {
      target: { value: 'itau' },
    });
    fireEvent.click(screen.getByRole('option', { name: /341.*itaú unibanco/i }));

    expect(onChange).toHaveBeenCalledWith('341');
  });

  it('permite navegar e selecionar uma opção pelo teclado', () => {
    const onChange = vi.fn();
    render(<CollaboratorBankSearch banks={banks} value="" onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Banco' });

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(input).toHaveAttribute('aria-activedescendant', 'collaborator-bank-option-1');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('341');
  });
});
