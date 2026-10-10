import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { db, insert, updateSettings, wipeDatabase } from '../../db/db';
import { AppointmentDetailScreen } from './AppointmentDetailScreen';
import { dateOf, formatDateTime, fromLocalInputValue } from '../../lib/date';

function wrap(route: string) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/kalender" element={<p>Kalender</p>} />
            <Route path="/kalender/:appointmentId" element={<AppointmentDetailScreen />} />
          </Routes>
        </MemoryRouter>
      </ConfirmProvider>
    </ToastProvider>,
  );
}

function shift(days: number, hour = 14): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

beforeEach(async () => {
  await wipeDatabase();
});

describe('AppointmentDetailScreen — Anlegen', () => {
  it('fragt zuerst nach der Art und zeigt den Rest erst danach', async () => {
    wrap('/kalender/neu');

    expect(await screen.findByText('Was für ein Termin ist das?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Datum und Uhrzeit')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /^Kennenlernen/ }));

    expect(screen.getByLabelText('Datum und Uhrzeit')).toBeInTheDocument();
    // Die Auswahl klappt zusammen und bleibt über „Ändern" erreichbar.
    expect(screen.queryByText('Was für ein Termin ist das?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ändern/ })).toBeInTheDocument();
  });

  it('bietet alle vier Besuchsgründe plus Tierarzt, Deckbesuch und Sonstiges an', async () => {
    wrap('/kalender/neu');
    await screen.findByText('Was für ein Termin ist das?');
    for (const label of [
      /^Kennenlernen/,
      /^Allergietest/,
      /^Kitten kennenlernen/,
      /^Abholung/,
      /^Tierarzt/,
      /^Deckbesuch/,
      /^Sonstiges/,
    ]) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });

  it('legt einen Termin mit beiden Erinnerungen an', async () => {
    wrap('/kalender/neu');
    await screen.findByText('Was für ein Termin ist das?');
    await userEvent.click(screen.getByRole('radio', { name: /^Abholung/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(async () => {
      const all = await db.appointments.toArray();
      expect(all).toHaveLength(1);
      expect(all[0].kind).toBe('pickup');
      expect(all[0].remind24h).toBe(true);
      expect(all[0].remind1h).toBe(true);
    });
  });

  it('übernimmt den Standard-Ort aus den Einstellungen', async () => {
    await updateSettings({
      seller: { name: '', address: '', clubName: 'Catmaniac', place: 'bei uns zu Hause' },
    });

    wrap('/kalender/neu');
    await screen.findByText('Was für ein Termin ist das?');
    await userEvent.click(screen.getByRole('radio', { name: /^Kennenlernen/ }));

    expect(screen.getByLabelText('Ort')).toHaveValue('bei uns zu Hause');
  });

  it('erinnert bei Besuchen an die Hausregeln, bei Tierarztterminen nicht', async () => {
    wrap('/kalender/neu');
    await screen.findByText('Was für ein Termin ist das?');
    await userEvent.click(screen.getByRole('radio', { name: /^Kitten kennenlernen/ }));
    expect(screen.getByText(/Schuhe bitte ausziehen/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Ändern/ }));
    await userEvent.click(screen.getByRole('radio', { name: /^Tierarzt/ }));
    expect(screen.queryByText(/Schuhe bitte ausziehen/)).not.toBeInTheDocument();
  });

  it('bietet bei Tierarzt und Deckbesuch Katze und Wurf statt Person an', async () => {
    wrap('/kalender/neu');
    await screen.findByText('Was für ein Termin ist das?');
    await userEvent.click(screen.getByRole('radio', { name: /^Deckbesuch/ }));

    expect(screen.getByLabelText('Katze')).toBeInTheDocument();
    expect(screen.getByLabelText('Wurf')).toBeInTheDocument();
    expect(screen.queryByLabelText('Interessent')).not.toBeInTheDocument();
  });

  it('sagt beim Interessenten ehrlich, wenn die Warteliste noch leer ist', async () => {
    wrap('/kalender/neu');
    await screen.findByText('Was für ein Termin ist das?');
    await userEvent.click(screen.getByRole('radio', { name: /^Kennenlernen/ }));

    await waitFor(() =>
      expect(screen.getByText(/Interessenten kommen aus der Warteliste/)).toBeInTheDocument(),
    );
  });
});

describe('AppointmentDetailScreen — Bearbeiten', () => {
  it('sagt einen Termin ab, statt ihn zu löschen', async () => {
    const a = await insert(db.appointments, {
      kind: 'meet_breeder',
      startAt: shift(3, 11),
      remind24h: true,
      remind1h: true,
    });

    wrap(`/kalender/${a.id}`);
    await userEvent.click(await screen.findByRole('button', { name: /Termin absagen/ }));

    await waitFor(async () => {
      const stored = await db.appointments.get(a.id);
      expect(stored?.cancelledAt).toBeTruthy();
    });
    expect(await screen.findByText('Dieser Termin ist abgesagt')).toBeInTheDocument();
  });

  it('markiert offene Erinnerungsfenster beim Zurücknehmen einer Absage als gesehen', async () => {
    const a = await insert(db.appointments, {
      kind: 'meet_breeder',
      startAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      remind24h: true,
      remind1h: true,
      cancelledAt: new Date().toISOString(),
    });

    wrap(`/kalender/${a.id}`);
    await userEvent.click(await screen.findByRole('button', { name: /Absage zurücknehmen/ }));

    await waitFor(async () => {
      expect((await db.appointments.get(a.id))?.cancelledAt).toBeUndefined();
      const keys = (await db.notificationLog.toArray()).map((row) => row.key).sort();
      expect(keys).toEqual([`appt:${a.id}:1h`, `appt:${a.id}:24h`]);
    });
  });

  it('fragt vor dem Löschen nach', async () => {
    const a = await insert(db.appointments, {
      kind: 'vet',
      startAt: shift(3, 11),
      remind24h: true,
      remind1h: true,
    });

    wrap(`/kalender/${a.id}`);
    await userEvent.click(await screen.findByRole('button', { name: /Termin löschen/ }));

    expect(await screen.findByText('Termin löschen?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(await db.appointments.get(a.id)).toBeTruthy();
  });

  it('schaltet die Erinnerungen einzeln ab und speichert das', async () => {
    const a = await insert(db.appointments, {
      kind: 'pickup',
      startAt: shift(3, 11),
      remind24h: true,
      remind1h: true,
    });

    wrap(`/kalender/${a.id}`);
    await userEvent.click(await screen.findByRole('switch', { name: /24 Stunden vorher/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Sichern' }));

    await waitFor(async () => {
      const stored = await db.appointments.get(a.id);
      expect(stored?.remind24h).toBe(false);
      expect(stored?.remind1h).toBe(true);
    });
  });

  it('meldet sich bei einem vergangenen Termin für die Nachbereitung', async () => {
    const interest = await insert(db.interests, {
      name: 'Familie Meyer',
      wishSex: 'any',
      status: 'new',
      sortIndex: 0,
    });
    const a = await insert(db.appointments, {
      kind: 'meet_kittens',
      startAt: shift(-1, 11),
      interestId: interest.id,
      remind24h: true,
      remind1h: true,
    });

    wrap(`/kalender/${a.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Notiz schreiben' }));
    const followUp = screen.getByRole('dialog', { name: "Wie war's?" });
    expect(within(followUp).getByLabelText('Datum des Besuchs')).toHaveValue(dateOf(a.startAt));
    expect(within(followUp).getByLabelText('Uhrzeit')).toHaveValue('11:00');
    const correctedDate = dateOf(shift(-3));
    fireEvent.change(within(followUp).getByLabelText('Datum des Besuchs'), { target: { value: correctedDate } });

    await userEvent.type(
      await screen.findByLabelText('Notiz'),
      'Sehr nett, wollen das blaue Kitten.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    // Auch die von Dexie ausgelöste Bildschirmaktualisierung abwarten. So
    // endet der Test nicht, während React noch den Live-Query-Stand rendert.
    expect(await screen.findByText('Nachbereitet')).toBeInTheDocument();
    await waitFor(async () => {
      const notes = await db.interestNotes.where('interestId').equals(interest.id).toArray();
      expect(notes).toHaveLength(1);
      expect(notes[0].channel).toBe('visit');
      expect(notes[0].text).toBe('Sehr nett, wollen das blaue Kitten.');
      expect(notes[0].at).toBe(fromLocalInputValue(`${correctedDate}T11:00`));
    });
    const stored = await db.appointments.get(a.id);
    expect(stored?.followUpDone).toBe(true);
  });

  it('legt die Nachbereitung ohne Interessent beim Termin selbst ab', async () => {
    const a = await insert(db.appointments, {
      kind: 'vet',
      startAt: shift(-1, 11),
      remind24h: true,
      remind1h: true,
    });

    wrap(`/kalender/${a.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Notiz schreiben' }));
    expect(screen.getByText(/kein Interessent verknüpft/)).toBeInTheDocument();

    await userEvent.type(await screen.findByLabelText('Notiz'), 'Alles in Ordnung.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(async () => {
      const stored = await db.appointments.get(a.id);
      expect(stored?.note).toBe(`${formatDateTime(a.startAt)}\nAlles in Ordnung.`);
      expect(stored?.followUpDone).toBe(true);
    });
  });

  it('sagt klar, wenn es den Termin nicht mehr gibt', async () => {
    wrap('/kalender/gibtesnicht');
    expect(await screen.findByText('Diesen Termin gibt es nicht mehr')).toBeInTheDocument();
  });
});
