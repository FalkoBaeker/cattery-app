import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { db, insert, wipeDatabase } from '../../db/db';
import type { Cat, ID } from '../../types';
import { CatDetailScreen } from './CatDetailScreen';

function renderScreen(catId: ID) {
  const router = createMemoryRouter(
    [
      { path: '/zucht', element: <p>Zuchtübersicht</p> },
      { path: '/zucht/katze/:catId', element: <CatDetailScreen /> },
    ],
    { initialEntries: [`/zucht/katze/${catId}`] },
  );
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </ToastProvider>,
  );
}

async function makeCat(over: Partial<Cat> = {}): Promise<Cat> {
  return insert(db.cats, {
    callName: 'Mascha',
    sex: 'female',
    breed: 'Russisch Blau',
    status: 'active',
    isOwn: true,
    ...over,
  });
}

describe('CatDetailScreen', () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it('sagt Bescheid, wenn es die Katze nicht gibt', async () => {
    renderScreen('gibt-es-nicht');
    expect(await screen.findByText('Diese Katze gibt es nicht mehr')).toBeInTheDocument();
  });

  it('zeigt Kopf und Leerzustände einer frisch angelegten Katze', async () => {
    const cat = await makeCat({ callName: 'Nadja', birthDate: '2020-05-04' });
    renderScreen(cat.id);

    expect(await screen.findByRole('heading', { level: 1, name: 'Nadja' })).toBeInTheDocument();
    expect(await screen.findByText('Noch keine Rolligkeit erfasst')).toBeInTheDocument();
    expect(await screen.findByText('Noch kein Test erfasst')).toBeInTheDocument();
    expect(await screen.findByText('Noch kein Wurf')).toBeInTheDocument();
    expect(await screen.findByText('Noch kein Gewicht erfasst')).toBeInTheDocument();
  });

  it('führt bei einem Kater weder Rolligkeit noch Gewicht', async () => {
    const cat = await makeCat({ callName: 'Boris', sex: 'male' });
    renderScreen(cat.id);

    expect(await screen.findByRole('heading', { level: 1, name: 'Boris' })).toBeInTheDocument();
    expect(screen.queryByText('Noch keine Rolligkeit erfasst')).not.toBeInTheDocument();
    expect(screen.queryByText('Noch kein Gewicht erfasst')).not.toBeInTheDocument();
  });

  it('sagt ab drei Rolligkeiten den nächsten Termin voraus', async () => {
    const cat = await makeCat();
    for (const startDate of ['2026-01-01', '2026-01-22', '2026-02-12']) {
      await insert(db.heatCycles, { catId: cat.id, startDate });
    }
    renderScreen(cat.id);

    expect(await screen.findByText(/Nächste Rolligkeit um den|Erwartet war der/)).toBeInTheDocument();
    expect(await screen.findByText(/Schätzung aus 2 Abständen/)).toBeInTheDocument();
  });

  it('verspricht bei zwei Rolligkeiten nichts', async () => {
    const cat = await makeCat();
    for (const startDate of ['2026-01-01', '2026-01-22']) {
      await insert(db.heatCycles, { catId: cat.id, startDate });
    }
    renderScreen(cat.id);

    expect(await screen.findByText('Noch keine Vorhersage')).toBeInTheDocument();
  });

  it('markiert einen abgelaufenen Gesundheitstest', async () => {
    const cat = await makeCat();
    await insert(db.healthTests, {
      catId: cat.id,
      kind: 'hcm',
      date: '2020-01-01',
      validMonths: 6,
      nextDueDate: '2020-07-01',
      result: 'ohne Befund',
    });
    renderScreen(cat.id);

    expect((await screen.findAllByText('Abgelaufen')).length).toBeGreaterThan(0);
    // Einmal im Abschnitt Gesundheitstests, einmal im Zeitstrahl.
    expect((await screen.findAllByText(/HCM/)).length).toBeGreaterThanOrEqual(2);
  });

  it('nimmt einen Wurf in Liste und Zeitstrahl auf', async () => {
    const cat = await makeCat();
    await insert(db.litters, {
      motherId: cat.id,
      status: 'born',
      birthDate: '2026-03-07',
    });
    renderScreen(cat.id);

    expect(await screen.findByText('Wurf vom 07.03.2026')).toBeInTheDocument();
    expect(await screen.findByText('Wurf geboren')).toBeInTheDocument();
  });
});
