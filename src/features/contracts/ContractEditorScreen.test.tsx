import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ConfirmProvider, ToastProvider } from '../../ui';
import { db, updateSettings, wipeDatabase } from '../../db/db';
import { ContractEditorScreen } from './ContractEditorScreen';

function zeichne(pfad: string) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <MemoryRouter initialEntries={[pfad]}>
          <Routes>
            <Route path="/mehr/vertraege/neu" element={<ContractEditorScreen />} />
            <Route path="/mehr/vertraege/:contractId" element={<ContractEditorScreen />} />
          </Routes>
        </MemoryRouter>
      </ConfirmProvider>
    </ToastProvider>,
  );
}

/** Die Live-Vorschau des gesetzten Vertragstextes. */
async function vorschau(): Promise<HTMLElement> {
  return (await screen.findAllByLabelText('Vertragstext'))[0];
}

beforeEach(async () => {
  await wipeDatabase();
  await updateSettings({
    seller: {
      name: 'Beispiel Züchterin',
      address: 'Beispielweg 3, 12345 Beispielstadt',
      birthDate: '1985-06-14',
      iban: 'DE00 0000 0000 0000 0000 00',
      place: 'Beispielstadt',
      clubName: 'Catmaniac',
    },
  });
});

describe('Vertragseditor', () => {
  it('zeigt zuerst einen Ladezustand und dann das Formular', async () => {
    zeichne('/mehr/vertraege/neu?art=standard');
    expect(screen.getByLabelText('Wird geladen')).toBeInTheDocument();
    expect(await screen.findByText('Vertragsart')).toBeInTheDocument();
  });

  it('schreibt Eingaben sofort in die Live-Vorschau', async () => {
    const nutzer = userEvent.setup();
    zeichne('/mehr/vertraege/neu?art=standard');

    const nameFeld = await screen.findByLabelText('Name');
    await nutzer.type(nameFeld, 'Anna Muster');

    await waitFor(async () => {
      expect((await vorschau()).textContent).toContain('Anna Muster');
    });
    // Auch die Anrede im Rechtstext steht schon drin.
    expect((await vorschau()).textContent).toContain('nachfolgend der Käufer genannt');
  });

  it('erklärt fehlende Verkäuferdaten und führt zu den Einstellungen', async () => {
    await updateSettings({ seller: { name: '', address: '', clubName: 'Catmaniac' } });
    zeichne('/mehr/vertraege/neu?art=standard');
    expect(await screen.findByText('Verkäuferdaten fehlen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zu den Einstellungen' })).toBeInTheDocument();
  });

  it('speichert einen Standardvertrag ohne Zuchtnutzungs-Vorgang', async () => {
    const nutzer = userEvent.setup();
    zeichne('/mehr/vertraege/neu?art=standard');

    await nutzer.type(await screen.findByLabelText('Name'), 'Anna Muster');
    await nutzer.click(screen.getByRole('button', { name: /Vertrag speichern/ }));

    await waitFor(async () => expect(await db.contracts.count()).toBe(1));
    const vertrag = (await db.contracts.toArray())[0];
    expect(vertrag.type).toBe('standard');
    expect(vertrag.data.buyers[0].name).toBe('Anna Muster');
    expect(await db.breedingUses.count()).toBe(0);
  });

  it('legt bei zweimaligem Speichern keinen zweiten Vertrag an', async () => {
    const nutzer = userEvent.setup();
    zeichne('/mehr/vertraege/neu?art=standard');

    await nutzer.type(await screen.findByLabelText('Name'), 'Anna Muster');
    const knopf = screen.getByRole('button', { name: /Vertrag speichern|Gespeichert/ });
    await nutzer.click(knopf);
    await waitFor(async () => expect(await db.contracts.count()).toBe(1));
    await nutzer.click(screen.getByRole('button', { name: /Vertrag speichern|Gespeichert/ }));

    await waitFor(async () => expect(await db.contracts.count()).toBe(1));
  });

  it('legt beim Zuchtnutzungsvertrag automatisch den Vorgang an', async () => {
    const nutzer = userEvent.setup();
    zeichne('/mehr/vertraege/neu?art=zuchtnutzung');

    await nutzer.type(await screen.findByLabelText('Rufname'), 'Mia');
    await nutzer.click(screen.getByRole('button', { name: /Vertrag speichern/ }));

    await waitFor(async () => expect(await db.breedingUses.count()).toBe(1));
    const vorgang = (await db.breedingUses.toArray())[0];
    expect(vorgang.catName).toBe('Mia');
    expect(vorgang.stage).toBe('at_buyer');
    expect(vorgang.months).toBe(18);
    expect(vorgang.extensionMonths).toBe(6);
  });

  it('zeigt beim Zuchtnutzungsvertrag die Fristfelder statt der Übergabe', async () => {
    zeichne('/mehr/vertraege/neu?art=zuchtnutzung');
    expect(await screen.findByText('Fristen')).toBeInTheDocument();
    expect(screen.queryByText('Übergabe')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nutzungsfrist')).toHaveValue('18');
  });

  it('rechnet die Restsumme beim Tippen mit', async () => {
    const nutzer = userEvent.setup();
    zeichne('/mehr/vertraege/neu?art=standard');

    await nutzer.type(await screen.findByLabelText('Gesamtpreis'), '2500');
    await nutzer.type(screen.getByLabelText('Anzahlung (meist keine)'), '560');

    await waitFor(() => {
      const zeile = screen.getByText('Restsumme').parentElement as HTMLElement;
      expect(zeile.textContent).toMatch(/1\.940,00/);
    });
  });

  it('meldet freundlich, wenn der Vertrag nicht mehr da ist', async () => {
    zeichne('/mehr/vertraege/gibtesnicht');
    expect(await screen.findByText('Dieser Vertrag ist nicht mehr da')).toBeInTheDocument();
  });

  it('übernimmt Käufer und Kitten aus den Aufrufparametern', async () => {
    const wurf = await db.litters.add({
      id: 'w1',
      motherId: 'm1',
      status: 'born',
      birthDate: '2026-03-03',
      createdAt: '2026-03-03T00:00:00Z',
      updatedAt: '2026-03-03T00:00:00Z',
    });
    await db.kittens.add({
      id: 'k1',
      litterId: String(wurf),
      collarColor: 'red',
      callName: 'Mia',
      sex: 'female',
      stillborn: false,
      chipNo: '276093400000001',
      saleStatus: 'reserved',
      priceCents: 250_000,
      createdAt: '2026-03-03T00:00:00Z',
      updatedAt: '2026-03-03T00:00:00Z',
    });
    await db.interests.add({
      id: 'i1',
      name: 'Anna Muster',
      wishSex: 'female',
      status: 'reserved',
      sortIndex: 0,
      createdAt: '2026-03-03T00:00:00Z',
      updatedAt: '2026-03-03T00:00:00Z',
    });

    zeichne('/mehr/vertraege/neu?art=standard&kittenId=k1&interestId=i1');

    await waitFor(() => expect(screen.getByLabelText('Rufname')).toHaveValue('Mia'));
    expect(screen.getByLabelText('Name')).toHaveValue('Anna Muster');
    expect(screen.getByLabelText('Chipnummer')).toHaveValue('276093400000001');
    expect(screen.getByLabelText('Gesamtpreis')).toHaveValue('2.500,00');
  });

  it('fügt weitere Käufer hinzu und entfernt sie wieder', async () => {
    const nutzer = userEvent.setup();
    zeichne('/mehr/vertraege/neu?art=standard');

    await nutzer.click(await screen.findByRole('button', { name: 'Weitere Person' }));
    await waitFor(() => expect(screen.getByText('Person 2')).toBeInTheDocument());

    await nutzer.click(screen.getByRole('button', { name: 'Person 2 entfernen' }));
    await waitFor(() => expect(screen.queryByText('Person 2')).not.toBeInTheDocument());
  });

  it('warnt, wenn im Zuchtnutzungsvertrag ein Kater eingetragen wird', async () => {
    const nutzer = userEvent.setup();
    zeichne('/mehr/vertraege/neu?art=zuchtnutzung');

    await nutzer.click(await screen.findByRole('radio', { name: 'Kater' }));
    await waitFor(() =>
      expect(
        screen.getByText('Der Vertrag mit Zuchtvorbehalt gilt nur für weibliche Tiere.'),
      ).toBeInTheDocument(),
    );
  });
});
