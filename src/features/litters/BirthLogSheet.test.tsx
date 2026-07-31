/**
 * Die eine Oberfläche, bei der ein Fehler weh tut: das Geburtsprotokoll.
 * Geprüft wird, dass jeder Tipp sofort in der Datenbank landet — nur so
 * übersteht der Verlauf Bildschirmsperre und Neuladen.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { db, insert, wipeDatabase } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../types';
import type { Litter } from '../../types';
import { todayISO } from '../../lib/date';
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
  await wipeDatabase();
});

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
