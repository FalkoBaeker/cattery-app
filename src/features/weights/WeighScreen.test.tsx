/**
 * Test der kniffligen Interaktion: eintippen, bestätigen, Fokus springt weiter,
 * sofort gespeichert, Platzhalter wird nicht mitgespeichert.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { db, wipeDatabase } from '../../db/db';
import type { Kitten } from '../../types';
import { addDays, todayISO } from '../../lib/date';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { WeighScreen } from './WeighScreen';

const STAMP = { createdAt: '2026-03-03T06:00:00.000Z', updatedAt: '2026-03-03T06:00:00.000Z' };

function kitten(id: string, collar: Kitten['collarColor'], extra: Partial<Kitten> = {}): Kitten {
  return {
    id,
    litterId: 'l1',
    collarColor: collar,
    sex: 'unknown',
    stillborn: false,
    saleStatus: 'available',
    ...STAMP,
    ...extra,
  };
}

async function seed(kittens: Kitten[]) {
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
    birthDate: '2026-03-03',
    ...STAMP,
  });
  for (const k of kittens) await db.kittens.put(k);
}

function renderScreen() {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <MemoryRouter initialEntries={['/wiegen/l1']}>
          <Routes>
            <Route path="/wiegen/:litterId" element={<WeighScreen />} />
          </Routes>
        </MemoryRouter>
      </ConfirmProvider>
    </ToastProvider>,
  );
}

function todayAt(hour: number): string {
  const [year, month, day] = todayISO().split('-').map(Number);
  return new Date(year, month - 1, day, hour, 0, 0).toISOString();
}

beforeAll(() => {
  // jsdom kennt scrollIntoView nicht.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('WeighScreen', () => {
  beforeEach(async () => {
    await seed([kitten('k1', 'red'), kitten('k2', 'blue'), kitten('k3', 'green')]);
  });

  it('speichert sofort und springt zum nächsten Kitten', async () => {
    const user = userEvent.setup();
    renderScreen();

    const rot = await screen.findByLabelText('Gewicht von Rot in Gramm');
    await user.click(rot);
    await user.keyboard('95');
    await act(async () => {
      fireEvent.keyDown(rot, { key: 'Enter' });
      await vi.waitFor(async () => expect(await db.weights.count()).toBe(1));
    });
    const entry = (await db.weights.toArray())[0];
    expect(entry.kittenId).toBe('k1');
    expect(entry.grams).toBe(95);

    // Fokus steht jetzt auf dem nächsten Kitten.
    expect(document.activeElement?.id).toBe('weigh-k2');
    expect(screen.getByText('95 g gespeichert')).toBeInTheDocument();
    expect(await screen.findByText('1 von 3 gewogen')).toBeInTheDocument();
    // Das eben benutzte Feld ist wieder leer.
    expect((rot as HTMLInputElement).value).toBe('');
  });

  it('zeigt den letzten Wert nur als Platzhalter und speichert ihn nicht mit', async () => {
    await db.weights.put({ id: 'w1', kittenId: 'k1', at: '2026-03-05T07:00:00.000Z', grams: 128 });
    const user = userEvent.setup();
    renderScreen();

    const rot = (await screen.findByLabelText('Gewicht von Rot in Gramm')) as HTMLInputElement;
    await waitFor(() => expect(rot.placeholder).toBe('128'));
    expect(rot.value).toBe('');

    // Ohne Eingabe darf beim Weiterklicken nichts entstehen.
    await user.click(screen.getByLabelText('Gewicht von Blau in Gramm'));
    await user.click(document.body);
    await waitFor(async () => expect(await db.weights.count()).toBe(1));
  });

  it('speichert auch, wenn direkt in die nächste Zeile getippt wird', async () => {
    const user = userEvent.setup();
    renderScreen();

    const rot = await screen.findByLabelText('Gewicht von Rot in Gramm');
    await user.click(rot);
    await user.keyboard('101');
    await act(async () => {
      (screen.getByLabelText('Gewicht von Grün in Gramm') as HTMLInputElement).focus();
      await vi.waitFor(async () => expect(await db.weights.count()).toBe(1));
    });
    expect((await db.weights.toArray())[0].grams).toBe(101);
    // Der Datenbankschreibvorgang ist einen Augenblick vor den davon
    // abhängigen React-Zuständen fertig. Auch deren sichtbares Ergebnis
    // gehört zu dieser Interaktion und muss vor Testende angekommen sein.
    expect(await screen.findByText('101 g gespeichert')).toBeInTheDocument();
    expect(await screen.findByText('1 von 3 gewogen')).toBeInTheDocument();
  });

  it('meldet unsinnige Eingaben auf Deutsch und speichert nichts', async () => {
    const user = userEvent.setup();
    renderScreen();

    const rot = await screen.findByLabelText('Gewicht von Rot in Gramm');
    await user.click(rot);
    await user.keyboard('0{Enter}');

    expect(await screen.findByText(/zwischen 1 und/i)).toBeInTheDocument();
    expect(await db.weights.count()).toBe(0);
  });

  it('zählt den Fortschritt des Tages und lässt erneutes Wiegen zu', async () => {
    const user = userEvent.setup();
    renderScreen();

    expect(await screen.findByText('0 von 3 gewogen')).toBeInTheDocument();

    const rot = await screen.findByLabelText('Gewicht von Rot in Gramm');
    await user.click(rot);
    await user.keyboard('95');
    await act(async () => {
      fireEvent.keyDown(rot, { key: 'Enter' });
      await vi.waitFor(async () => expect(await db.weights.count()).toBe(1));
    });
    expect(await screen.findByText('1 von 3 gewogen')).toBeInTheDocument();

    // Zweite Wiegung am selben Tag ist der Normalfall.
    await user.click(rot);
    await user.keyboard('99');
    await act(async () => {
      fireEvent.keyDown(rot, { key: 'Enter' });
      await vi.waitFor(async () => expect(await db.weights.count()).toBe(2));
    });
    expect(await screen.findByText('1 von 3 gewogen')).toBeInTheDocument();
    expect(await screen.findByText('2× erfasst')).toBeInTheDocument();
  });

  it('meldet in den ersten zwei Wochen nach der ersten Runde noch kein Tagesziel', async () => {
    const today = todayISO();
    await db.litters.update('l1', { birthDate: addDays(today, -5) });
    await db.weights.bulkPut([
      { id: 'w1', kittenId: 'k1', at: todayAt(7), grams: 128 },
      { id: 'w2', kittenId: 'k2', at: todayAt(7), grams: 131 },
      { id: 'w3', kittenId: 'k3', at: todayAt(7), grams: 126 },
    ]);

    renderScreen();

    expect(await screen.findByText('3 von 6 Messungen')).toBeInTheDocument();
    expect(screen.getByText('0 von 3 vollständig')).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', {
      name: 'Wiege-Fortschritt: 3 von 6 Messungen',
    });
    expect(progress).toHaveAttribute('aria-valuemax', '6');
    expect(progress).toHaveAttribute('aria-valuenow', '3');
    expect(screen.queryByText('3 von 3 gewogen')).not.toBeInTheDocument();
  });

  it('nimmt eine gerade gespeicherte Messung wieder zurück', async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();

    const rot = await screen.findByLabelText('Gewicht von Rot in Gramm');
    await user.click(rot);
    await user.keyboard('95');
    await act(async () => {
      fireEvent.keyDown(rot, { key: 'Enter' });
      await vi.waitFor(async () => expect(await db.weights.count()).toBe(1));
    });

    // Zurücknehmen geht an zwei Stellen: in der Zeile und in der Meldung.
    await waitFor(() =>
      expect(within(container).getByRole('button', { name: 'Rückgängig' })).toBeInTheDocument(),
    );
    expect(screen.getAllByRole('button', { name: 'Rückgängig' }).length).toBeGreaterThan(1);

    await act(async () => {
      fireEvent.click(within(container).getByRole('button', { name: 'Rückgängig' }));
      await vi.waitFor(async () => expect(await db.weights.count()).toBe(0));
    });
    await waitFor(() =>
      expect(within(container).queryByRole('button', { name: 'Rückgängig' })).toBeNull(),
    );
  });

  it('zeigt totgeborene Kitten nicht an', async () => {
    await seed([
      kitten('k1', 'red'),
      kitten('k2', 'blue', { stillborn: true }),
      kitten('k3', 'green', { saleStatus: 'deceased' }),
    ]);
    renderScreen();

    expect(await screen.findByLabelText('Gewicht von Rot in Gramm')).toBeInTheDocument();
    expect(screen.queryByLabelText('Gewicht von Blau in Gramm')).not.toBeInTheDocument();
    expect(await screen.findByText(/2 Kitten werden nicht angezeigt/)).toBeInTheDocument();
  });

  it('erklärt den leeren Wurf statt eine leere Liste zu zeigen', async () => {
    await seed([]);
    renderScreen();
    expect(await screen.findByText('Noch keine Kitten erfasst')).toBeInTheDocument();
  });

  it('sagt Bescheid, wenn es den Wurf nicht gibt', async () => {
    await wipeDatabase();
    renderScreen();
    expect(await screen.findByText('Wurf nicht gefunden')).toBeInTheDocument();
  });
});
