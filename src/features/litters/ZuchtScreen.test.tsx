import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { clearSettingsCache, db, wipeDatabase } from '../../db/db';
import { addDays, todayISO } from '../../lib/date';
import { DEFAULT_SETTINGS } from '../../types';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { ZuchtScreen } from './ZuchtScreen';

const STAMP = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(async () => {
  await wipeDatabase();
  clearSettingsCache();
});

describe('ZuchtScreen – Gewichtsauffälligkeiten', () => {
  it('öffnet vom Warn-Badge eine gefilterte Kittenliste statt des ganzen Wurfes', async () => {
    const birthDate = addDays(todayISO(), -8);
    const previousDate = addDays(todayISO(), -1);
    await db.settings.put(DEFAULT_SETTINGS);
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
      birthDate,
      ...STAMP,
    });
    await db.kittens.bulkPut([
      {
        id: 'kit-warning',
        litterId: 'litter-1',
        callName: 'Ada',
        collarColor: 'red',
        sex: 'female',
        birthWeightG: 95,
        stillborn: false,
        saleStatus: 'available',
        ...STAMP,
      },
      {
        id: 'kit-ok',
        litterId: 'litter-1',
        callName: 'Balu',
        collarColor: 'beige',
        sex: 'male',
        birthWeightG: 95,
        stillborn: false,
        saleStatus: 'available',
        ...STAMP,
      },
    ]);
    await db.weights.bulkPut([
      { id: 'w-a-1', kittenId: 'kit-warning', at: `${previousDate}T08:00:00.000Z`, grams: 120 },
      { id: 'w-a-2', kittenId: 'kit-warning', at: `${todayISO()}T08:00:00.000Z`, grams: 118 },
      { id: 'w-b-1', kittenId: 'kit-ok', at: `${previousDate}T08:00:00.000Z`, grams: 120 },
      { id: 'w-b-2', kittenId: 'kit-ok', at: `${todayISO()}T08:00:00.000Z`, grams: 132 },
    ]);

    render(
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={['/zucht']}>
            <ZuchtScreen />
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>,
    );

    const warningButton = await screen.findByRole('button', {
      name: '1 auffällige Kitten anzeigen',
    });
    await userEvent.click(warningButton);

    const dialog = screen.getByRole('dialog', { name: 'Gewichtsauffälligkeiten' });
    expect(within(dialog).getByText('Ada')).toBeInTheDocument();
    expect(within(dialog).getByText('Kritisch')).toBeInTheDocument();
    expect(within(dialog).queryByText('Balu')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Alle Kitten im Wurf' })).toBeInTheDocument();
  });
});
