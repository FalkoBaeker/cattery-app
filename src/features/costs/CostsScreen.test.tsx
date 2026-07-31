import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CostsScreen } from './CostsScreen';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { clearSettingsCache, db, wipeDatabase } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../types';

const STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

function renderScreen() {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <MemoryRouter initialEntries={['/mehr/kosten']}>
          <CostsScreen />
        </MemoryRouter>
      </ConfirmProvider>
    </ToastProvider>,
  );
}

beforeEach(async () => {
  await wipeDatabase();
  clearSettingsCache();
  await db.settings.put(DEFAULT_SETTINGS);
});

describe('CostsScreen', () => {
  it('erklärt im Leerzustand, worum es geht, und bietet einen Weg nach vorn', async () => {
    renderScreen();
    expect(await screen.findByText('Noch keine Kosten erfasst')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ersten Beleg erfassen' })).toBeInTheDocument();
  });

  it('trägt einen Beleg ein und zeigt ihn in der Übersicht', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Ersten Beleg erfassen' }));
    await user.type(await screen.findByLabelText(/Betrag/), '120');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Allgemeine Belege')).toBeInTheDocument();
    expect(await db.costs.count()).toBe(1);
    const entry = (await db.costs.toArray())[0];
    expect(entry.amountCents).toBe(12_000);
    expect(entry.category).toBe('vet');
  });

  it('besteht auf einem Betrag — dem einzigen Pflichtfeld', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Ersten Beleg erfassen' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Bitte einen Betrag eintragen.')).toBeInTheDocument();
    expect(await db.costs.count()).toBe(0);
  });

  it('rechnet je Wurf Kosten, Erlöse und Ergebnis zusammen', async () => {
    await db.cats.put({
      id: 'cat-1',
      callName: 'Mira',
      sex: 'female',
      breed: 'Russisch Blau',
      status: 'active',
      isOwn: true,
      ...STAMP,
    });
    await db.litters.put({
      id: 'litter-1',
      motherId: 'cat-1',
      status: 'born',
      birthDate: '2026-03-01',
      ...STAMP,
    });
    await db.costs.put({
      id: 'c1',
      date: '2026-03-05',
      category: 'vet',
      amountCents: 50_000,
      litterId: 'litter-1',
      ...STAMP,
    });
    await db.revenues.put({
      id: 'r1',
      date: '2026-06-01',
      amountCents: 250_000,
      litterId: 'litter-1',
      ...STAMP,
    });

    renderScreen();

    expect(await screen.findByText('Wurf von Mira')).toBeInTheDocument();
    expect(screen.getByText(/Kosten 500,00 .*Erlöse 2\.500,00/)).toBeInTheDocument();
    // Einmal in der Gesamtkarte, einmal als Kennzeichen am Wurf.
    expect(screen.getAllByText(/\+2\.000,00/)).toHaveLength(2);
  });

  it('führt in die Wurfansicht und wieder zurück', async () => {
    const user = userEvent.setup();
    await db.cats.put({
      id: 'cat-1',
      callName: 'Mira',
      sex: 'female',
      breed: 'Russisch Blau',
      status: 'active',
      isOwn: true,
      ...STAMP,
    });
    await db.litters.put({
      id: 'litter-1',
      motherId: 'cat-1',
      status: 'born',
      birthDate: '2026-03-01',
      ...STAMP,
    });
    await db.costs.put({
      id: 'c1',
      date: '2026-03-05',
      category: 'food',
      amountCents: 4_000,
      litterId: 'litter-1',
      ...STAMP,
    });

    renderScreen();

    await user.click(await screen.findByRole('button', { name: /Wurf von Mira/ }));
    expect(await screen.findByText('Nach Kategorie')).toBeInTheDocument();
    expect(screen.getByText('Geboren am 01.03.2026')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(await screen.findByText('Je Wurf')).toBeInTheDocument();
  });

  it('zeigt die laufenden Kosten je Zuchttier', async () => {
    const user = userEvent.setup();
    await db.cats.put({
      id: 'cat-1',
      callName: 'Mira',
      sex: 'female',
      breed: 'Russisch Blau',
      status: 'active',
      isOwn: true,
      ...STAMP,
    });
    await db.costs.put({
      id: 'c1',
      date: '2026-02-05',
      category: 'vet',
      amountCents: 8_000,
      catId: 'cat-1',
      ...STAMP,
    });

    renderScreen();

    await user.click(await screen.findByRole('radio', { name: 'Zuchttiere' }));
    expect(await screen.findByText('Mira')).toBeInTheDocument();
    expect(screen.getByText('1 Beleg seit 05.02.2026')).toBeInTheDocument();
  });
});
