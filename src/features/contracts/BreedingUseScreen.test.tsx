import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

import { ConfirmProvider, ToastProvider } from '../../ui';
import { db, insert, wipeDatabase } from '../../db/db';
import { addDays, addMonths, fromLocalInputValue, todayISO } from '../../lib/date';
import { fristende, monateBisFrist } from './calc';
import type { BreedingUse, Contract } from '../../types';
import { BreedingUseScreen } from './BreedingUseScreen';
import { vorgangAnlegen } from './breedingUse';

function zeichne(id: string) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <MemoryRouter initialEntries={[`/mehr/zuchtnutzung/${id}`]}>
          <Routes>
            <Route path="/mehr/zuchtnutzung/:breedingUseId" element={<BreedingUseScreen />} />
            <Route path="/mehr/vertraege" element={<p>Verträge</p>} />
            <Route path="/mehr/vertraege/:contractId" element={<p>Editor</p>} />
          </Routes>
        </MemoryRouter>
      </ConfirmProvider>
    </ToastProvider>,
  );
}

/** Legt Vertrag und Vorgang an; startDate relativ zu heute. */
async function vorgangMitStart(monateSeitStart: number): Promise<BreedingUse> {
  const start = addMonths(todayISO(), -monateSeitStart);
  const vertrag: Contract = await insert(db.contracts, {
    type: 'breeding_reserved',
    data: {
      type: 'breeding_reserved',
      buyers: [{ name: 'Anna Muster', sex: 'female' }],
      animals: [{ name: 'Mia', sex: 'female' }],
      breed: 'Russisch Blau',
      regularPriceCents: 250_000,
      discountCents: 138_000,
      breedingUseStartDate: start,
      breedingUseMonths: 18,
      breedingUseExtensionMonths: 6,
      backPaymentDays: 14,
    },
  });
  return (await vorgangAnlegen(vertrag)) as BreedingUse;
}

beforeEach(async () => {
  await wipeDatabase();
});

describe('Zuchtnutzungs-Vorgang', () => {
  it('zeigt einen Ladezustand, bevor die Daten da sind', async () => {
    const v = await vorgangMitStart(0);
    zeichne(v.id);
    expect(screen.getByLabelText('Wird geladen')).toBeInTheDocument();
    await screen.findByText('Restlaufzeit');
  });

  it('meldet freundlich, wenn es den Vorgang nicht gibt', async () => {
    zeichne('gibtesnicht');
    expect(await screen.findByText('Dieser Vorgang ist nicht mehr da')).toBeInTheDocument();
  });

  it('zeigt die Restlaufzeit groß und deutlich', async () => {
    const v = await vorgangMitStart(11);
    // Monatsenden können den Rest um einen Monat verschieben — deshalb
    // wird gegen dieselbe Rechnung geprüft, nicht gegen eine feste Zahl.
    const monate = monateBisFrist(v.deadlineDate);
    expect(monate).toBeGreaterThanOrEqual(6);
    zeichne(v.id);
    expect(await screen.findByText(`noch ${monate} Monate`)).toBeInTheDocument();
  });

  it('erklärt, was am Fristablauf hängt', async () => {
    const v = await vorgangMitStart(0);
    zeichne(v.id);
    // Der Preisnachlass steht im Vertrag; der wird erst nach dem Vorgang geladen.
    await waitFor(async () => {
      const text = (await screen.findByText(/entfällt der/)).textContent ?? '';
      expect(text).toMatch(/Preisnachlass/);
      expect(text).toMatch(/1\.380,00/);
      expect(text).toMatch(/14 Tagen/);
    });
  });

  it('behält Geldbetrag und Zahlungsfrist, wenn der Vertrag bewusst gelöscht wurde', async () => {
    const v = await vorgangMitStart(0);
    await db.contracts.delete(v.contractId);

    zeichne(v.id);

    expect(await screen.findByText('Vertrag wurde gelöscht')).toBeInTheDocument();
    const text = (await screen.findByText(/entfällt der/)).textContent ?? '';
    expect(text).toMatch(/1\.380,00/);
    expect(text).toMatch(/14 Tagen/);
  });

  it('warnt drei Monate vor Ablauf', async () => {
    const v = await vorgangMitStart(16);
    zeichne(v.id);
    expect(await screen.findByText('Noch etwa drei Monate')).toBeInTheDocument();
  });

  it('meldet den Ablauf mit dem letzten Nachzahlungstag', async () => {
    const v = await vorgangMitStart(20);
    zeichne(v.id);
    expect(await screen.findByText('Die Frist ist abgelaufen')).toBeInTheDocument();
    expect(screen.getByText(/also bis/)).toBeInTheDocument();
  });

  it('schaltet einen Schritt weiter und schreibt den Verlauf mit', async () => {
    const nutzer = userEvent.setup();
    const v = await vorgangMitStart(2);
    zeichne(v.id);

    await nutzer.click(await screen.findByRole('button', { name: /Zur Deckung angefordert/ }));
    expect((await db.breedingUses.get(v.id))?.stage).toBe('at_buyer');
    const eventDate = addDays(todayISO(), -10);
    fireEvent.change(screen.getByLabelText(/^Datum des Ereignisses/), { target: { value: eventDate } });
    fireEvent.change(screen.getByLabelText('Uhrzeit'), { target: { value: '09:30' } });
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(async () => {
      const nachher = await db.breedingUses.get(v.id);
      expect(nachher?.stage).toBe('requested');
      expect(nachher?.history).toHaveLength(2);
      expect(nachher?.history.at(-1)?.at).toBe(fromLocalInputValue(`${eventDate}T09:30`));
    });
  });

  it('verlängert die Frist nach Rückfrage um sechs Monate', async () => {
    const nutzer = userEvent.setup();
    const v = await vorgangMitStart(2);
    zeichne(v.id);

    await nutzer.click(
      await screen.findByRole('button', { name: 'Frist um 6 Monate verlängern' }),
    );
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Verlängern' }));

    await waitFor(async () => {
      const nachher = await db.breedingUses.get(v.id);
      expect(nachher?.extendedAt).toBe(todayISO());
      // Die Verlängerung setzt auf dem bereits berechneten Fristende auf,
      // nicht auf dem Fristbeginn — bei Monatsenden ist das ein Unterschied.
      expect(nachher?.deadlineDate).toBe(fristende(v.startDate, 18, 6, true));
    });
    // Ein zweites Mal wird nicht angeboten.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Frist um 6 Monate verlängern' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('zeigt die vollständige Statuskette', async () => {
    const v = await vorgangMitStart(1);
    zeichne(v.id);
    await screen.findByText('Statuskette');
    for (const label of [
      'Katze beim Käufer',
      'Zur Deckung angefordert',
      'Bei uns',
      'Gedeckt',
      'Trächtig',
      'Wurf da',
      'Kastriert',
      'Eigentum übertragen',
      'Abgeschlossen',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('nimmt eine Notiz in den Verlauf auf', async () => {
    const nutzer = userEvent.setup();
    const v = await vorgangMitStart(1);
    zeichne(v.id);

    await nutzer.click(await screen.findByRole('button', { name: 'Notiz' }));
    await nutzer.type(await screen.findByLabelText('Was ist passiert?'), 'Käuferin angerufen');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(async () => {
      const nachher = await db.breedingUses.get(v.id);
      expect(nachher?.history.at(-1)?.note).toBe('Käuferin angerufen');
    });
  });

  it('rechnet die Frist neu, wenn der Fristbeginn korrigiert wird', async () => {
    const nutzer = userEvent.setup();
    const v = await vorgangMitStart(1);
    zeichne(v.id);

    await nutzer.click(await screen.findByText('Erstmalige Überlassung'));
    const feld = await screen.findByLabelText('Datum der Überlassung');
    await nutzer.clear(feld);
    await nutzer.type(feld, '2026-08-31');
    await nutzer.click(screen.getByRole('button', { name: 'Übernehmen' }));

    await waitFor(async () => {
      const nachher = await db.breedingUses.get(v.id);
      expect(nachher?.startDate).toBe('2026-08-31');
      // Monatsende: 31.08. + 18 Monate = 29.02.2028 (Schaltjahr)
      expect(nachher?.deadlineDate).toBe('2028-02-29');
    });
  });

  it('bricht den Vorgang nach Rückfrage ab und blendet die Aktionen aus', async () => {
    const nutzer = userEvent.setup();
    const v = await vorgangMitStart(1);
    zeichne(v.id);

    await nutzer.click(await screen.findByRole('button', { name: 'Vorgang abbrechen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Abbrechen' }));

    await waitFor(async () => {
      expect((await db.breedingUses.get(v.id))?.stage).toBe('cancelled');
    });
    await waitFor(() => expect(screen.getByText('Vorgang beendet')).toBeInTheDocument());
  });

  it('gilt ab dem Wurf als erfüllt und warnt dann nicht mehr', async () => {
    const v = await vorgangMitStart(17);
    await db.breedingUses.update(v.id, { stage: 'littered' });
    zeichne(v.id);
    expect(await screen.findByText('Zuchtnutzung erfüllt')).toBeInTheDocument();
    expect(screen.queryByText(/entfällt der/)).not.toBeInTheDocument();
  });

  it('korrigiert ein Kastrationsdatum und sortiert den Verlauf, ohne den aktuellen Stand zu ändern', async () => {
    const v = await vorgangMitStart(1);
    const matingAt = fromLocalInputValue(`${addDays(todayISO(), -8)}T10:00`);
    const neuteredAt = fromLocalInputValue(`${addDays(todayISO(), -4)}T10:00`);
    const correctedDate = addDays(todayISO(), -12);
    await db.breedingUses.update(v.id, {
      stage: 'neutered',
      history: [{ stage: 'mated', at: matingAt }, { stage: 'neutered', at: neuteredAt }],
    });
    zeichne(v.id);
    await userEvent.click(await screen.findByRole('button', { name: /^Kastriert/ }));
    const dialog = screen.getByRole('dialog', { name: 'Ereignisdatum ändern' });
    fireEvent.change(within(dialog).getByLabelText(/^Datum des Ereignisses/), { target: { value: correctedDate } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Übernehmen' }));

    await waitFor(async () => {
      const stored = await db.breedingUses.get(v.id);
      expect(stored?.stage).toBe('neutered');
      expect(stored?.history[1].at).toBe(fromLocalInputValue(`${correctedDate}T10:00`));
    });
    const timeline = screen.getByRole('heading', { name: 'Verlauf' }).closest('section')!;
    expect(within(timeline).getAllByRole('button').map((button) => button.textContent))
      .toEqual([expect.stringContaining('Gedeckt'), expect.stringContaining('Kastriert')]);
  });

  it('blocks saving a stage dated in the future', async () => {
    const v = await vorgangMitStart(1);
    zeichne(v.id);
    await userEvent.click(await screen.findByRole('button', { name: /Zur Deckung angefordert/ }));
    fireEvent.change(screen.getByLabelText(/^Datum des Ereignisses/), { target: { value: addDays(todayISO(), 1) } });
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
    expect(screen.getByText('Das Ereignis darf nicht in der Zukunft liegen.')).toBeInTheDocument();
    expect((await db.breedingUses.get(v.id))?.stage).toBe('at_buyer');
  });
});
