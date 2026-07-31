import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ConfirmProvider, ToastProvider } from '../../ui';
import { db, insert, updateSettings, wipeDatabase } from '../../db/db';
import type { Contract, ContractData } from '../../types';
import { ContractsScreen } from './ContractsScreen';
import { BreedingUseScreen } from './BreedingUseScreen';
import { vorgangAnlegen } from './breedingUse';

function zeichne() {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <MemoryRouter initialEntries={['/mehr/vertraege']}>
          <Routes>
            <Route path="/mehr/vertraege" element={<ContractsScreen />} />
            <Route path="/mehr/zuchtnutzung/:breedingUseId" element={<BreedingUseScreen />} />
            <Route path="/mehr/vertraege/:contractId" element={<p>Editor</p>} />
            <Route path="/mehr/vertraege/neu" element={<p>Neuer Vertrag</p>} />
            <Route path="/mehr/einstellungen" element={<p>Einstellungen</p>} />
          </Routes>
        </MemoryRouter>
      </ConfirmProvider>
    </ToastProvider>,
  );
}

async function vertragAnlegen(over: Partial<ContractData> = {}): Promise<Contract> {
  const data: ContractData = {
    type: 'standard',
    buyers: [{ name: 'Anna Muster', sex: 'female' }],
    animals: [{ name: 'Mia', sex: 'female' }],
    breed: 'Russisch Blau',
    totalPriceCents: 250_000,
    ...over,
  };
  return insert(db.contracts, { type: data.type, data });
}

beforeEach(async () => {
  await wipeDatabase();
  await updateSettings({
    seller: {
      name: 'Beispiel Züchterin',
      address: 'Beispielweg 3, 12345 Beispielstadt',
      clubName: 'Catmaniac',
    },
  });
});

describe('Vertragsliste', () => {
  it('zeigt einen Ladezustand, keinen falschen Leerzustand', async () => {
    zeichne();
    expect(screen.getByLabelText('Wird geladen')).toBeInTheDocument();
    expect(screen.queryByText('Noch kein Vertrag')).not.toBeInTheDocument();
    await screen.findByText('Noch kein Vertrag');
  });

  it('erklärt den Leerzustand und bietet einen Weg nach vorn', async () => {
    zeichne();
    expect(await screen.findByText('Noch kein Vertrag')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ersten Vertrag anlegen' })).toBeInTheDocument();
  });

  it('listet gespeicherte Verträge mit Käufer und Tier', async () => {
    await vertragAnlegen();
    zeichne();
    expect(await screen.findByText('Kaufvertrag')).toBeInTheDocument();
    expect(screen.getByText('Anna Muster · Mia')).toBeInTheDocument();
    expect(screen.getByText('Entwurf')).toBeInTheDocument();
  });

  it('kennzeichnet Verträge mit gespeichertem PDF', async () => {
    const c = await vertragAnlegen();
    await db.contracts.update(c.id, { pdfAttachmentId: 'a1' });
    zeichne();
    expect(await screen.findByText('PDF')).toBeInTheDocument();
  });

  it('führt bei fehlenden Verkäuferdaten in die Einstellungen', async () => {
    await updateSettings({ seller: { name: '', address: '', clubName: 'Catmaniac' } });
    zeichne();
    expect(await screen.findByText('Verkäuferdaten fehlen')).toBeInTheDocument();
  });

  it('zeigt laufende Zuchtnutzungen mit Restlaufzeit', async () => {
    const c = await insert(db.contracts, {
      type: 'breeding_reserved',
      data: {
        type: 'breeding_reserved',
        buyers: [{ name: 'Anna Muster' }],
        animals: [{ name: 'Mia', sex: 'female' }],
        breed: 'Russisch Blau',
        breedingUseStartDate: '2026-06-01',
      },
    });
    await vorgangAnlegen(c);

    zeichne();
    expect(await screen.findByText('Laufende Zuchtnutzungen')).toBeInTheDocument();
    expect(screen.getByText('Mia')).toBeInTheDocument();
    expect(screen.getByText('Katze beim Käufer')).toBeInTheDocument();
  });

  it('blendet abgeschlossene Vorgänge aus', async () => {
    const c = await insert(db.contracts, {
      type: 'breeding_reserved',
      data: {
        type: 'breeding_reserved',
        buyers: [],
        animals: [{ name: 'Mia', sex: 'female' }],
        breed: 'Russisch Blau',
      },
    });
    const v = await vorgangAnlegen(c);
    await db.breedingUses.update(v!.id, { stage: 'closed' });

    zeichne();
    await screen.findByText('Kaufvertrag mit Zuchtnutzungsvorbehalt');
    expect(screen.queryByText('Laufende Zuchtnutzungen')).not.toBeInTheDocument();
  });

  it('öffnet die Auswahl der Vertragsart', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.click(await screen.findByRole('button', { name: 'Neuer Vertrag' }));
    expect(await screen.findByText('Mit Zuchtnutzungsvorbehalt')).toBeInTheDocument();
  });

  it('bietet zu einem Vertrag ohne PDF keine Teilen-Aktion an', async () => {
    const nutzer = userEvent.setup();
    await vertragAnlegen();
    zeichne();
    await nutzer.click(await screen.findByRole('button', { name: /Aktionen für/ }));
    expect(await screen.findByText(/noch kein PDF/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PDF teilen' })).not.toBeInTheDocument();
  });

  it('löscht einen Vertrag nach Rückfrage', async () => {
    const nutzer = userEvent.setup();
    await vertragAnlegen();
    zeichne();

    await nutzer.click(await screen.findByRole('button', { name: /Aktionen für/ }));
    await nutzer.click(await screen.findByRole('button', { name: 'Vertrag löschen' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Löschen' }));

    await waitFor(async () => expect(await db.contracts.count()).toBe(0));
  });
});
