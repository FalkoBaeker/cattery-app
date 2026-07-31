import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { db, wipeDatabase } from '../../db/db';
import { addDays, dateOf, todayISO } from '../../lib/date';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { WeightBackfillScreen } from './WeightBackfillScreen';
import { localDateTime } from './backfill';

const STAMP = { createdAt: '2026-03-03T06:00:00.000Z', updatedAt: '2026-03-03T06:00:00.000Z' };

async function seed() {
  const birthDate = addDays(todayISO(), -3);
  await wipeDatabase();
  await db.cats.put({
    id: 'c1',
    callName: 'Mira',
    sex: 'female',
    breed: 'Russisch Blau',
    status: 'active',
    isOwn: true,
    ...STAMP,
  });
  await db.litters.put({
    id: 'l1',
    motherId: 'c1',
    status: 'born',
    birthDate,
    ...STAMP,
  });
  await db.kittens.put({
    id: 'k1',
    litterId: 'l1',
    collarColor: 'red',
    sex: 'female',
    stillborn: false,
    saleStatus: 'available',
    ...STAMP,
  });
  await db.weights.put({
    id: 'w1',
    kittenId: 'k1',
    at: localDateTime(birthDate, '08:00')!,
    grams: 95,
  });
  return birthDate;
}

function renderScreen() {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <MemoryRouter initialEntries={['/zucht/kitten/k1/gewicht-nachtragen']}>
          <Routes>
            <Route
              path="/zucht/kitten/:kittenId/gewicht-nachtragen"
              element={<WeightBackfillScreen />}
            />
          </Routes>
        </MemoryRouter>
      </ConfirmProvider>
    </ToastProvider>,
  );
}

describe('WeightBackfillScreen', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
  });

  it('wählt einen Tag, zeigt vorhandene Werte und speichert eine zweite Uhrzeit', async () => {
    const birthDate = await seed();
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Geburtstag' }));
    expect(await screen.findByText('08:00 Uhr')).toBeInTheDocument();
    expect(screen.getByText('95 g')).toBeInTheDocument();
    expect(screen.getByLabelText('Uhrzeit')).toHaveValue('20:00');

    await user.type(screen.getByLabelText('Gewicht in Gramm'), '104');
    await user.click(screen.getByRole('button', { name: 'Gewicht speichern' }));

    await waitFor(async () => expect(await db.weights.count()).toBe(2));
    const saved = (await db.weights.toArray()).find((entry) => entry.id !== 'w1')!;
    expect(dateOf(saved.at)).toBe(birthDate);
    expect(new Date(saved.at).getHours()).toBe(20);
    expect(saved.grams).toBe(104);
    expect(await screen.findByText('20:00 Uhr')).toBeInTheDocument();
    expect(screen.getByText('2 Messungen vorhanden')).toBeInTheDocument();
  });

  it('verhindert eine zweite Messung in derselben Minute', async () => {
    await seed();
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Geburtstag' }));
    await user.clear(screen.getByLabelText('Uhrzeit'));
    await user.type(screen.getByLabelText('Uhrzeit'), '08:00');
    await user.type(screen.getByLabelText('Gewicht in Gramm'), '104');
    await user.click(screen.getByRole('button', { name: 'Gewicht speichern' }));

    expect(await screen.findByText(/Für diese Uhrzeit gibt es schon/)).toBeInTheDocument();
    expect(await db.weights.count()).toBe(1);
  });

  it('behält das Gewicht sichtbar, wenn das Speichern fehlschlägt', async () => {
    await seed();
    vi.spyOn(db.weights, 'add').mockRejectedValueOnce(new Error('IndexedDB belegt'));
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Geburtstag' }));
    const input = screen.getByLabelText('Gewicht in Gramm');
    await user.type(input, '104');
    await user.click(screen.getByRole('button', { name: 'Gewicht speichern' }));

    expect(await screen.findByText(/Die Eingabe bleibt erhalten/)).toBeInTheDocument();
    expect(input).toHaveValue('104');
    expect(await db.weights.count()).toBe(1);
  });
});
