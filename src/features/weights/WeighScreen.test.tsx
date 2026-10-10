import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { db, wipeDatabase } from '../../db/db';
import type { Kitten } from '../../types';
import { addDays, dateOf, todayISO } from '../../lib/date';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { WeighScreen } from './WeighScreen';
import { localDateTime } from './backfill';

const STAMP = { createdAt: '2026-03-03T06:00:00.000Z', updatedAt: '2026-03-03T06:00:00.000Z' };
const yesterday = () => addDays(todayISO(), -1);

function kitten(id: string, collarColor: Kitten['collarColor'], extra: Partial<Kitten> = {}): Kitten {
  return { id, litterId: 'l1', collarColor, sex: 'unknown', stillborn: false, saleStatus: 'available', ...STAMP, ...extra };
}

async function seed(kittens = [kitten('k1', 'red'), kitten('k2', 'blue'), kitten('k3', 'green')]) {
  await wipeDatabase();
  await db.litters.put({ id: 'l1', motherId: 'c1', status: 'born', birthDate: addDays(todayISO(), -5), ...STAMP });
  await db.kittens.bulkPut(kittens);
}

function renderScreen() {
  return render(
    <ToastProvider><ConfirmProvider>
      <MemoryRouter initialEntries={['/wiegen/l1']}>
        <Routes><Route path="/wiegen/:litterId" element={<WeighScreen />} /></Routes>
      </MemoryRouter>
    </ConfirmProvider></ToastProvider>,
  );
}

function setTime(time: string) {
  fireEvent.change(screen.getByLabelText('Uhrzeit (optional)'), { target: { value: time } });
}

beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });

describe('WeighScreen', () => {
  beforeEach(async () => { vi.restoreAllMocks(); await seed(); });

  it('zeigt heute und speichert den ganzen Durchgang erst nach ausdrücklichem Speichern', async () => {
    const user = userEvent.setup();
    renderScreen();
    const red = await screen.findByLabelText('Gewicht von Rot in Gramm');
    expect(screen.getByLabelText(/Wiegedatum/)).toHaveValue(todayISO());
    await user.click(red);
    await user.keyboard('95{Enter}101{Enter}98{Enter}');
    expect(await db.weights.count()).toBe(0);
    expect(screen.getByLabelText('Gewicht von Rot in Gramm')).toHaveValue('95');
    await user.click(screen.getByRole('button', { name: 'Gewichte speichern (3)' }));
    await waitFor(async () => expect(await db.weights.count()).toBe(3));
    const entries = await db.weights.toArray();
    expect(new Set(entries.map((entry) => entry.at)).size).toBe(1);
    expect(entries.every((entry) => dateOf(entry.at) === todayISO())).toBe(true);
    expect(await screen.findByText('95 g gespeichert')).toBeInTheDocument();
    expect(red).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Gewichte speichern' })).toBeDisabled();
    expect(await screen.findByText('3 von 6 Messungen')).toBeInTheDocument();
  });

  it('speichert gestern mit gemeinsamer Uhrzeit und niemals beim Verlassen eines Feldes', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Gestern' }));
    setTime('10:25');
    const red = screen.getByLabelText('Gewicht von Rot in Gramm');
    await user.type(red, '95');
    await user.click(screen.getByLabelText('Gewicht von Blau in Gramm'));
    expect(await db.weights.count()).toBe(0);
    await user.keyboard('101{Enter}98{Enter}');
    await user.click(screen.getByRole('button', { name: 'Gewichte speichern (3)' }));
    await waitFor(async () => expect(await db.weights.count()).toBe(3));
    expect((await db.weights.toArray()).every((entry) => entry.at === localDateTime(yesterday(), '10:25'))).toBe(true);
  });

  it('nutzt auch ohne Uhrzeit das ausgewählte vergangene Datum', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Gestern' }));
    expect(screen.getByText('Zeitpunkt: 08:00 Uhr')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Gewicht von Rot in Gramm'), '95');
    await user.click(screen.getByRole('button', { name: 'Gewichte speichern (1)' }));
    await waitFor(async () => expect(await db.weights.count()).toBe(1));
    expect((await db.weights.toArray())[0].at).toBe(localDateTime(yesterday(), '08:00'));
  });

  it('behält alle Eingaben bei einem Schreibfehler und rollt Teilwerte zurück', async () => {
    const user = userEvent.setup();
    const originalAdd = db.weights.add.bind(db.weights);
    let calls = 0;
    vi.spyOn(db.weights, 'add').mockImplementation((...args) => {
      if (++calls === 2) return Promise.reject(new Error('IndexedDB belegt')) as ReturnType<typeof db.weights.add>;
      return originalAdd(...args);
    });
    renderScreen();
    await user.type(await screen.findByLabelText('Gewicht von Rot in Gramm'), '95{Enter}101{Enter}98');
    await user.click(screen.getByRole('button', { name: 'Gewichte speichern (3)' }));
    expect(await screen.findByText(/Die Eingaben bleiben erhalten/)).toBeInTheDocument();
    expect(await db.weights.count()).toBe(0);
    expect(screen.getByLabelText('Gewicht von Rot in Gramm')).toHaveValue('95');
    expect(screen.getByLabelText('Gewicht von Blau in Gramm')).toHaveValue('101');
    await user.click(screen.getByRole('button', { name: 'Gewichte speichern (3)' }));
    await waitFor(async () => expect(await db.weights.count()).toBe(3));
  });

  it('behält ungespeicherte Gewichte bei abgebrochenem und bestätigtem Datumswechsel', async () => {
    const user = userEvent.setup();
    renderScreen();
    const red = await screen.findByLabelText('Gewicht von Rot in Gramm');
    await user.type(red, '95');
    await user.click(screen.getByRole('button', { name: 'Gestern' }));
    let dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByLabelText(/Wiegedatum/)).toHaveValue(todayISO());
    expect(red).toHaveValue('95');
    await user.click(screen.getByRole('button', { name: 'Gestern' }));
    dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Datum ändern' }));
    expect(screen.getByLabelText(/Wiegedatum/)).toHaveValue(yesterday());
    expect(red).toHaveValue('95');
    expect(await db.weights.count()).toBe(0);
  });

  it('zeigt ausgewählte Tageswerte, korrigiert sie und verwendet keine späteren Platzhalter', async () => {
    await db.weights.bulkPut([
      { id: 'old', kittenId: 'k1', at: localDateTime(yesterday(), '08:00')!, grams: 95 },
      { id: 'later', kittenId: 'k1', at: localDateTime(todayISO(), '00:00')!, grams: 110 },
    ]);
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Gestern' }));
    expect(screen.getByLabelText('Gewicht von Rot in Gramm')).toHaveAttribute('placeholder', '95');
    await user.click(screen.getByRole('button', { name: 'Rot: 95 g um 08:00 Uhr ändern' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Gewicht');
    await user.clear(input);
    await user.type(input, '97');
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await waitFor(async () => expect((await db.weights.get('old'))?.grams).toBe(97));
    expect(await db.weights.count()).toBe(2);
  });

  it('verhindert doppelte Minuten und lässt Uhrzeitkorrektur ohne Eingabeverlust zu', async () => {
    await db.weights.put({ id: 'old', kittenId: 'k1', at: localDateTime(yesterday(), '08:00')!, grams: 95 });
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Gestern' }));
    setTime('08:00');
    await user.type(screen.getByLabelText('Gewicht von Rot in Gramm'), '97');
    await user.click(screen.getByRole('button', { name: 'Gewichte speichern (1)' }));
    expect(await screen.findByText(/Für diese Uhrzeit/)).toBeInTheDocument();
    expect(screen.getByLabelText('Gewicht von Rot in Gramm')).toHaveValue('97');
    setTime('20:00');
    await user.click(screen.getByRole('button', { name: 'Gewichte speichern (1)' }));
    await waitFor(async () => expect(await db.weights.count()).toBe(2));
  });

  it('speichert keine Platzhalter oder leeren Zeilen', async () => {
    await db.weights.put({ id: 'old', kittenId: 'k1', at: localDateTime(yesterday(), '08:00')!, grams: 95 });
    const user = userEvent.setup();
    renderScreen();
    await user.type(await screen.findByLabelText('Gewicht von Blau in Gramm'), '101');
    await user.click(screen.getByRole('button', { name: 'Gewichte speichern (1)' }));
    await waitFor(async () => expect(await db.weights.count()).toBe(2));
    expect((await db.weights.toArray()).filter((entry) => entry.kittenId === 'k1')).toHaveLength(1);
  });

  it('zeigt nur lebende Kitten und erklärt den leeren oder fehlenden Wurf', async () => {
    await seed([kitten('k1', 'red'), kitten('k2', 'blue', { stillborn: true }), kitten('k3', 'green', { saleStatus: 'deceased' })]);
    const first = renderScreen();
    expect(await screen.findByLabelText('Gewicht von Rot in Gramm')).toBeInTheDocument();
    expect(screen.queryByLabelText('Gewicht von Blau in Gramm')).not.toBeInTheDocument();
    first.unmount();
    await seed([]);
    const second = renderScreen();
    expect(await screen.findByText('Noch keine Kitten erfasst')).toBeInTheDocument();
    second.unmount();
    await wipeDatabase();
    renderScreen();
    expect(await screen.findByText('Wurf nicht gefunden')).toBeInTheDocument();
  });
});
