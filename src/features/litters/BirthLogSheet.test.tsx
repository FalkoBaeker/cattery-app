/**
 * Die eine Oberfläche, bei der ein Fehler weh tut: das Geburtsprotokoll.
 * Geprüft wird, dass jeder Tipp sofort in der Datenbank landet — nur so
 * übersteht der Verlauf Bildschirmsperre und Neuladen.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { db, insert, wipeDatabase } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../types';
import type { BirthEvent, Kitten, Litter } from '../../types';
import { addDays, todayISO } from '../../lib/date';
import { localDateTime } from '../weights/backfill';
import { addBirthEvent, addKitten } from './data';
import { BirthLogSheet } from './BirthLogSheet';

function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}

async function makeLitter(over: Partial<Litter> = {}): Promise<Litter> {
  return insert<Litter>(db.litters, { motherId: 'mutter', status: 'pregnant', ...over });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await wipeDatabase();
});

function renderLog(litter: Litter, kittens: Kitten[] = [], events: BirthEvent[] = []) {
  return render(<Providers><BirthLogSheet open onClose={() => {}} litter={litter} kittens={kittens} events={events} settings={DEFAULT_SETTINGS} /></Providers>);
}

function latestDialog() {
  return within(screen.getAllByRole('dialog').at(-1)!);
}

describe('BirthLogSheet', () => {
  it('schreibt jede Wehe sofort in die Datenbank', async () => {
    const user = userEvent.setup();
    const litter = await makeLitter();

    render(
      <Providers>
        <BirthLogSheet
          open
          onClose={() => {}}
          litter={litter}
          kittens={[]}
          events={[]}
          settings={DEFAULT_SETTINGS}
        />
      </Providers>,
    );

    await user.click(screen.getByRole('button', { name: 'Wehe' }));

    await waitFor(async () => {
      expect(await db.birthEvents.where('litterId').equals(litter.id).count()).toBe(1);
    });
    const [event] = await db.birthEvents.toArray();
    expect(event.kind).toBe('contraction');
    expect(new Date(event.at).getTime()).toBeGreaterThan(Date.now() - 10_000);
  });

  it('speichert Wehe, Nachgeburt und Notiz mit dem ausgewählten vergangenen Zeitpunkt', async () => {
    const user = userEvent.setup();
    const litter = await makeLitter();
    renderLog(litter);
    await user.click(screen.getByRole('button', { name: 'Gestern' }));
    fireEvent.change(screen.getByLabelText('Uhrzeit (optional)'), { target: { value: '09:25' } });
    await user.click(screen.getByRole('button', { name: 'Wehe' }));
    await waitFor(async () => expect(await db.birthEvents.count()).toBe(1));
    await user.click(screen.getByRole('button', { name: 'Nachgeburt' }));
    await waitFor(async () => expect(await db.birthEvents.count()).toBe(2));
    await user.click(screen.getByRole('button', { name: 'Notiz' }));
    const dialog = latestDialog();
    await user.type(dialog.getByLabelText('Was ist passiert?'), 'Unruhig');
    await user.click(dialog.getByRole('button', { name: 'Eintragen' }));
    await waitFor(async () => expect(await db.birthEvents.count()).toBe(3));
    const events = await db.birthEvents.toArray();
    expect(events.map((event) => event.kind).sort()).toEqual(['contraction', 'note', 'placenta']);
    expect(events.every((event) => event.at === localDateTime(addDays(todayISO(), -1), '09:25'))).toBe(true);
  });

  it('nimmt ohne Uhrzeit mittags am ausgewählten vergangenen Datum statt jetzt', async () => {
    const user = userEvent.setup();
    const litter = await makeLitter();
    renderLog(litter);
    await user.click(screen.getByRole('button', { name: 'Gestern' }));
    await user.click(screen.getByRole('button', { name: 'Wehe' }));
    await waitFor(async () => expect(await db.birthEvents.count()).toBe(1));
    expect((await db.birthEvents.toArray())[0].at).toBe(localDateTime(addDays(todayISO(), -1), '12:00'));
  });

  it('verwendet ein eigenes vergangenes Neugeborenen-Datum für Wurf, Kitten, Geburtsgewicht und Ereignis', async () => {
    const user = userEvent.setup();
    const litter = await makeLitter();
    renderLog(litter);
    await user.click(screen.getByRole('button', { name: 'Gestern' }));
    await user.click(screen.getByRole('button', { name: 'Kitten geboren' }));
    const dialog = latestDialog();
    const date = addDays(todayISO(), -2);
    fireEvent.change(dialog.getByLabelText(/Geburtsdatum/), { target: { value: date } });
    fireEvent.change(dialog.getByLabelText('Uhrzeit (optional)'), { target: { value: '23:25' } });
    await user.type(dialog.getByLabelText('Geburtsgewicht'), '95');
    await user.click(dialog.getByRole('button', { name: 'Eintragen' }));
    await waitFor(async () => expect(await db.birthEvents.count()).toBe(1));
    const [kitten] = await db.kittens.toArray();
    const at = localDateTime(date, '23:25');
    expect(kitten.bornAt).toBe(at);
    expect((await db.weights.toArray())[0].at).toBe(at);
    expect((await db.birthEvents.toArray())[0].at).toBe(at);
    expect((await db.litters.get(litter.id))?.birthDate).toBe(date);
  });

  it('behält Neugeborenen-Eingaben und rollt alle Datensätze zurück, wenn das Ereignis scheitert', async () => {
    const user = userEvent.setup();
    const litter = await makeLitter();
    vi.spyOn(db.birthEvents, 'add').mockRejectedValueOnce(new Error('Datenbank belegt'));
    renderLog(litter);
    await user.click(screen.getByRole('button', { name: 'Kitten geboren' }));
    const dialog = latestDialog();
    await user.type(dialog.getByLabelText('Geburtsgewicht'), '95');
    await user.click(dialog.getByRole('button', { name: 'Eintragen' }));
    expect(await dialog.findByText(/Die Eingaben bleiben erhalten/)).toBeInTheDocument();
    expect(dialog.getByLabelText('Geburtsgewicht')).toHaveValue('95');
    expect(await db.kittens.count()).toBe(0);
    expect(await db.weights.count()).toBe(0);
    expect(await db.careTasks.count()).toBe(0);
    expect((await db.litters.get(litter.id))?.status).toBe('pregnant');
  });

  it('korrigiert den Geburtstag mit Geburtsgewicht und Ereignis atomar und lässt Geschwisterzeiten bestehen', async () => {
    const user = userEvent.setup();
    const date = addDays(todayISO(), -2);
    const litter = await makeLitter({ status: 'born', birthDate: date });
    const first = await addKitten({ litterId: litter.id, collarColor: 'red', birthWeightG: 95, bornAt: localDateTime(date, '10:00')! }, DEFAULT_SETTINGS);
    const second = await addKitten({ litterId: litter.id, collarColor: 'blue', bornAt: localDateTime(date, '11:00')! }, DEFAULT_SETTINGS);
    await addBirthEvent(litter.id, 'kitten_born', { kittenId: first.id, at: first.bornAt });
    await addBirthEvent(litter.id, 'kitten_born', { kittenId: second.id, at: second.bornAt });
    const events = await db.birthEvents.toArray();
    const event = events.find((entry) => entry.kittenId === first.id)!;
    const weightId = (await db.weights.toArray())[0].id;
    renderLog(litter, [first, second], events);
    await user.click(screen.getAllByRole('button', { name: /Eintrag ändern: Kitten geboren/ }).find((button) => button.getAttribute('aria-label')?.includes('10:00'))!);
    const dialog = latestDialog();
    const correctedDate = addDays(date, -1);
    fireEvent.change(dialog.getByLabelText(/Ereignisdatum/), { target: { value: correctedDate } });
    fireEvent.change(dialog.getByLabelText('Uhrzeit'), { target: { value: '22:15' } });
    await user.click(dialog.getByRole('button', { name: 'Speichern' }));
    const at = localDateTime(correctedDate, '22:15');
    await waitFor(async () => expect((await db.birthEvents.get(event.id))?.at).toBe(at));
    expect((await db.kittens.get(first.id))?.bornAt).toBe(at);
    expect((await db.weights.get(weightId))?.at).toBe(at);
    expect((await db.kittens.get(second.id))?.bornAt).toBe(second.bornAt);
    expect((await db.litters.get(litter.id))?.birthDate).toBe(correctedDate);
    expect(await db.birthEvents.count()).toBe(2);
  });

  it('erlaubt Korrekturen gewöhnlicher Ereignisse ohne Löschen und blockiert zukünftige Zeitpunkte', async () => {
    const user = userEvent.setup();
    const litter = await makeLitter();
    await addBirthEvent(litter.id, 'contraction', { at: localDateTime(addDays(todayISO(), -2), '09:00')! });
    const [event] = await db.birthEvents.toArray();
    renderLog(litter, [], [event]);
    await user.click(screen.getByRole('button', { name: /Eintrag ändern: Wehe/ }));
    const dialog = latestDialog();
    fireEvent.change(dialog.getByLabelText(/Ereignisdatum/), { target: { value: addDays(todayISO(), 1) } });
    await user.click(dialog.getByRole('button', { name: 'Speichern' }));
    expect(await dialog.findByText('Ein Ereignis darf nicht in der Zukunft liegen.')).toBeInTheDocument();
    expect((await db.birthEvents.get(event.id))?.at).toBe(event.at);
    fireEvent.change(dialog.getByLabelText(/Ereignisdatum/), { target: { value: addDays(todayISO(), -1) } });
    await user.click(dialog.getByRole('button', { name: 'Speichern' }));
    await waitFor(async () => expect((await db.birthEvents.get(event.id))?.at).toBe(localDateTime(addDays(todayISO(), -1), '09:00')));
    expect(await db.birthEvents.count()).toBe(1);
  });

  it('rollt eine Geburtskorrektur zurück, wenn die Geburtswiegung nicht aktualisiert werden kann', async () => {
    const user = userEvent.setup();
    const date = addDays(todayISO(), -2);
    const litter = await makeLitter({ status: 'born', birthDate: date });
    const kitten = await addKitten({ litterId: litter.id, collarColor: 'red', birthWeightG: 95, bornAt: localDateTime(date, '10:00')! }, DEFAULT_SETTINGS);
    await addBirthEvent(litter.id, 'kitten_born', { kittenId: kitten.id, at: kitten.bornAt });
    const [event] = await db.birthEvents.toArray();
    const [weight] = await db.weights.toArray();
    vi.spyOn(db.weights, 'update').mockRejectedValueOnce(new Error('Wiegung gesperrt'));
    renderLog(litter, [kitten], [event]);
    await user.click(screen.getByRole('button', { name: /Eintrag ändern: Kitten geboren/ }));
    const dialog = latestDialog();
    fireEvent.change(dialog.getByLabelText(/Ereignisdatum/), { target: { value: addDays(date, -1) } });
    await user.click(dialog.getByRole('button', { name: 'Speichern' }));
    expect(await dialog.findByText('Wiegung gesperrt')).toBeInTheDocument();
    expect((await db.kittens.get(kitten.id))?.bornAt).toBe(kitten.bornAt);
    expect((await db.birthEvents.get(event.id))?.at).toBe(event.at);
    expect((await db.weights.get(weight.id))?.at).toBe(weight.at);
    expect((await db.litters.get(litter.id))?.birthDate).toBe(date);
  });

  it('legt beim ersten Kitten Geburtsdatum, Kitten und Fahrplan an', async () => {
    const user = userEvent.setup();
    const litter = await makeLitter();

    render(
      <Providers>
        <BirthLogSheet
          open
          onClose={() => {}}
          litter={litter}
          kittens={[]}
          events={[]}
          settings={DEFAULT_SETTINGS}
        />
      </Providers>,
    );

    await user.click(screen.getByRole('button', { name: /Kitten geboren/ }));
    await user.click(await screen.findByRole('button', { name: 'Eintragen' }));

    await waitFor(async () => {
      expect(await db.kittens.where('litterId').equals(litter.id).count()).toBe(1);
    });

    const updated = await db.litters.get(litter.id);
    expect(updated?.status).toBe('born');
    expect(updated?.birthDate).toBe(todayISO());
    expect(await db.careTasks.where('litterId').equals(litter.id).count()).toBeGreaterThan(0);
    const events = await db.birthEvents.toArray();
    expect(events.filter((e) => e.kind === 'kitten_born')).toHaveLength(1);
  });

  it('zeigt den Abstand zur vorherigen Wehe an', async () => {
    const litter = await makeLitter();
    const base = new Date(2026, 2, 1, 2, 0).toISOString();
    const later = new Date(2026, 2, 1, 2, 4).toISOString();

    render(
      <Providers>
        <BirthLogSheet
          open
          onClose={() => {}}
          litter={litter}
          kittens={[]}
          events={[
            { id: '1', litterId: litter.id, at: base, kind: 'contraction' },
            { id: '2', litterId: litter.id, at: later, kind: 'contraction' },
          ]}
          settings={DEFAULT_SETTINGS}
        />
      </Providers>,
    );

    expect(screen.getByText(/4:00 Min\. nach der vorherigen Wehe/)).toBeInTheDocument();
    expect(screen.getByText(/2 Wehen erfasst/)).toBeInTheDocument();
  });

  it('erklärt den leeren Verlauf, statt ihn wegzulassen', async () => {
    const litter = await makeLitter();
    render(
      <Providers>
        <BirthLogSheet
          open
          onClose={() => {}}
          litter={litter}
          kittens={[]}
          events={[]}
          settings={DEFAULT_SETTINGS}
        />
      </Providers>,
    );

    expect(screen.getByText('Noch nichts eingetragen')).toBeInTheDocument();
    expect(screen.getByText('Noch keine Wehe erfasst')).toBeInTheDocument();
  });
});
