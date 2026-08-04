import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkinfoldHelpDialog } from './AdipometryDialogs';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Abrir ajuda</button>
      {open ? (
        <SkinfoldHelpDialog
          item={{
            field: 'tricepsMm',
            label: 'Dobra tricipital',
            description: 'Descrição técnica.',
            videoUrl: 'https://youtube.com/shorts/example',
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

describe('SkinfoldHelpDialog', () => {
  it('fecha por Escape e devolve o foco ao acionador', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Abrir ajuda' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Dobra tricipital' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('abre video externamente sem autoplay nem acesso ao opener', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ajuda' }));
    const link = screen.getByRole('link', { name: /abrir vídeo/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
