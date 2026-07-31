import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { db, wipeDatabase } from '../../db/db';
import { HealthTestSheet } from './HealthTestSheet';

function renderSheet() {
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <ConfirmProvider>
        <HealthTestSheet open catId="cat1" onClose={onClose} />
      </ConfirmProvider>
    </ToastProvider>,
  );
  return { onClose };
}

describe('HealthTestSheet', () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it('schreibt die nächste Fälligkeit mit, damit andere Module sie finden', async () => {
    const { onClose } = renderSheet();

    fireEvent.change(await screen.findByLabelText(/Datum/), { target: { value: '2026-08-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const stored = await db.healthTests.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      catId: 'cat1',
      kind: 'hcm',
      date: '2026-08-31',
      validMonths: 6,
      // 31.08. + 6 Monate landet auf dem letzten Februartag.
      nextDueDate: '2027-02-28',
    });
  });

  it('zeigt die gerechnete Fälligkeit schon beim Ausfüllen', async () => {
    renderSheet();
    fireEvent.change(await screen.findByLabelText(/Datum/), { target: { value: '2026-01-31' } });
    expect(await screen.findByText('31.07.2026')).toBeInTheDocument();
  });

  it('speichert ohne Gültigkeit als unbefristet', async () => {
    const { onClose } = renderSheet();

    fireEvent.change(await screen.findByLabelText(/Datum/), { target: { value: '2026-03-03' } });
    fireEvent.change(screen.getByLabelText(/Gültigkeit/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const stored = await db.healthTests.toArray();
    expect(stored[0].nextDueDate).toBeUndefined();
  });

  it('verlangt ein Datum, statt still nichts zu tun', async () => {
    const { onClose } = renderSheet();

    fireEvent.change(await screen.findByLabelText(/Datum/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Bitte das Datum des Tests eintragen.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(await db.healthTests.count()).toBe(0);
  });
});
