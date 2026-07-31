import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { ConfirmProvider, Sheet, useConfirm } from './Sheet';

function StackedDialogs() {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');
  const confirm = useConfirm();

  return (
    <>
      <p>{open ? 'Editor offen' : 'Editor geschlossen'}</p>
      <Sheet open={open} onClose={() => setOpen(false)} title="Wurf bearbeiten">
        <label>
          Notizen
          <input value={draft} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <Button
          onClick={() =>
            void confirm({
              title: 'Wurf löschen?',
              danger: true,
              confirmLabel: 'Löschen',
            })
          }
        >
          Wurf löschen
        </Button>
      </Sheet>
    </>
  );
}

describe('gestapelte Dialoge', () => {
  it('schließt mit Escape nur die oberste Ebene und bewahrt den Entwurf', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <StackedDialogs />
      </ConfirmProvider>,
    );

    const notes = screen.getByLabelText('Notizen');
    await user.type(notes, 'UNGESPEICHERTER ENTWURF');
    await user.click(screen.getByRole('button', { name: 'Wurf löschen' }));
    expect(screen.getByRole('alertdialog', { name: 'Wurf löschen?' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog', { name: 'Wurf löschen?' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Wurf bearbeiten' })).toBeInTheDocument();
    expect(notes).toHaveValue('UNGESPEICHERTER ENTWURF');
    expect(screen.getByText('Editor offen')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Wurf bearbeiten' })).not.toBeInTheDocument();
    expect(screen.getByText('Editor geschlossen')).toBeInTheDocument();
  });
});
