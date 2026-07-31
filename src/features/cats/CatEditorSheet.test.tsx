import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { db, insert, wipeDatabase } from '../../db/db';
import { CatEditorSheet } from './CatEditorSheet';

function renderSheet(props: Partial<Parameters<typeof CatEditorSheet>[0]> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <ConfirmProvider>
        <CatEditorSheet open onClose={onClose} onSaved={onSaved} {...props} />
      </ConfirmProvider>
    </ToastProvider>,
  );
  return { onClose, onSaved };
}

describe('CatEditorSheet', () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it('legt ein Tier allein mit dem Rufnamen an', async () => {
    const { onClose, onSaved } = renderSheet();

    fireEvent.change(await screen.findByLabelText(/Rufname/), { target: { value: '  Mascha  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const cats = await db.cats.toArray();
    expect(cats).toHaveLength(1);
    expect(cats[0]).toMatchObject({
      callName: 'Mascha',
      sex: 'female',
      status: 'active',
      isOwn: true,
      breed: 'Russisch Blau',
      emsCode: 'RUS a',
    });
    // Alles Übrige bleibt leer — genau ein Pflichtfeld.
    expect(cats[0].chipNo).toBeUndefined();
    expect(cats[0].notes).toBeUndefined();
    expect(onSaved).toHaveBeenCalledWith(cats[0].id);
  });

  it('verlangt einen Rufnamen und legt sonst nichts an', async () => {
    const { onClose } = renderSheet();

    fireEvent.click(await screen.findByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Bitte einen Rufnamen eingeben.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(await db.cats.count()).toBe(0);
  });

  it('übernimmt vorhandene Stammdaten zum Bearbeiten', async () => {
    const cat = await insert(db.cats, {
      callName: 'Nadja',
      catteryName: 'Nadja von den Blauen',
      sex: 'female',
      breed: 'Russisch Blau',
      status: 'paused',
      isOwn: true,
      chipNo: '276098100000000',
    });

    const { onClose } = renderSheet({ catId: cat.id });

    await waitFor(() => expect(screen.getByLabelText(/Rufname/)).toHaveValue('Nadja'));
    expect(screen.getByLabelText(/Chipnummer/)).toHaveValue('276098100000000');

    fireEvent.change(screen.getByLabelText(/Rufname/), { target: { value: 'Nadjenka' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const stored = await db.cats.get(cat.id);
    expect(stored?.callName).toBe('Nadjenka');
    expect(stored?.chipNo).toBe('276098100000000');
    expect(await db.cats.count()).toBe(1);
  });

  it('lässt einen Ahnenverlust außerhalb von 0 bis 100 nicht durch', async () => {
    const { onClose } = renderSheet();

    fireEvent.change(await screen.findByLabelText(/Rufname/), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText(/Ahnenverlust/), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    // Ein Vertipper darf weder stillschweigend verschluckt werden noch den
    // alten Wert löschen: Meldung am Feld, Blatt bleibt offen, nichts gespeichert.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bitte einen Wert zwischen 0 und 100 eintragen.',
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(await db.cats.count()).toBe(0);
  });

  it('speichert einen gültigen Ahnenverlust', async () => {
    const { onClose } = renderSheet();

    fireEvent.change(await screen.findByLabelText(/Rufname/), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText(/Ahnenverlust/), { target: { value: '6,25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const cats = await db.cats.toArray();
    expect(cats[0].inbreedingPercent).toBeCloseTo(6.25, 5);
  });
});
