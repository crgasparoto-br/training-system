import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CyclicStagesEditor from './CyclicStagesEditor';

describe('Issue #398 - editor de etapas cíclicas', () => {
  it('não cria prescrição artificial antes da ação explícita do professor', () => {
    const onApply = vi.fn();
    render(<CyclicStagesEditor dayOfWeek={1} editable onApply={onApply} />);
    expect(screen.getByText(/detalhamento antigo continuará/i)).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar etapa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar etapas do dia' }));
    expect(screen.getByRole('alert')).toHaveTextContent('duração positiva');
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Duração ou distância'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar etapas do dia' }));
    expect(onApply).toHaveBeenCalledWith([
      expect.objectContaining({ position: 1, kind: 'work', durationUnit: 'seconds', durationValue: 90 }),
    ]);
  });

  it('configura repetição de trabalho/recuperação com durações explícitas', () => {
    const onApply = vi.fn();
    render(<CyclicStagesEditor dayOfWeek={2} editable onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar repetição' }));
    const input = screen.getAllByLabelText('Duração ou distância');
    fireEvent.change(input[0], { target: { value: '90' } });
    fireEvent.change(input[1], { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar etapas do dia' }));
    expect(onApply).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'repeat', repeatCount: 2, children: [
        expect.objectContaining({ kind: 'work', durationValue: 90 }),
        expect.objectContaining({ kind: 'recovery', durationValue: 60 }),
      ] }),
    ]);
  });

  it('bloqueia edição e limpeza em dia fora do período ou liberado', () => {
    const onApply = vi.fn();
    render(<CyclicStagesEditor dayOfWeek={3} editable={false} onApply={onApply}
      stages={[{ position: 1, kind: 'work', durationUnit: 'meters', durationValue: 1000 }]} />);
    expect(screen.getByText(/somente leitura/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar etapas do dia' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Duração ou distância' })).toHaveValue(1000);
    expect(onApply).not.toHaveBeenCalled();
  });
});
