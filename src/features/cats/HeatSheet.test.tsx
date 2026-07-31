import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { db, wipeDatabase } from '../../db/db';
import { todayISO } from '../../lib/date';
import { HeatSheet } from './HeatSheet';

function renderSheet() {
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <ConfirmProvider>
        <HeatSheet open catId="cat1" onClose={onClose} />
      </ConfirmProvider>
    </ToastProvider>,
  );
  return { onClose };
}

describe('HeatSheet', () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it('schlägt heute als Beginn vor und speichert ohne weitere Eingabe', async () => {
    const { onClose } = renderSheet();

    expect(await screen.findByLabelText(/Beginn/)).toHaveValue(todayISO());
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const stored = await db.heatCycles.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ catId: 'cat1', startDate: todayISO() });
    expect(stored[0].endDate).toBeUndefined();
  });

  it('weist ein Ende vor dem Beginn zurück', async () => {
    const { onClose } = renderSheet();

    fireEvent.change(await screen.findByLabelText(/Beginn/), { target: { value: '2026-03-10' } });
    fireEvent.change(screen.getByLabelText(/Ende/), { target: { value: '2026-03-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Das Ende liegt vor dem Beginn.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(await db.heatCycles.count()).toBe(0);
  });

  it('zeigt die Dauer, sobald ein Ende eingetragen ist', async () => {
    renderSheet();

    fireEvent.change(await screen.findByLabelText(/Beginn/), { target: { value: '2026-03-03' } });
    fireEvent.change(screen.getByLabelText(/Ende/), { target: { value: '2026-03-07' } });

    expect(await screen.findByText('Dauer: 5 Tage')).toBeInTheDocument();
  });

  it('verlangt einen Beginn', async () => {
    const { onClose } = renderSheet();

    fireEvent.change(await screen.findByLabelText(/Beginn/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Bitte den Beginn eintragen.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
