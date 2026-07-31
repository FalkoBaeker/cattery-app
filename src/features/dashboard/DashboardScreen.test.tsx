import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardScreen } from './DashboardScreen';
import { clearSettingsCache, db, wipeDatabase } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../types';
import { addDays, nowISO, todayISO } from '../../lib/date';
import { INSTALL_HINT_KEY } from '../settings/install';

const STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <DashboardScreen />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await wipeDatabase();
  clearSettingsCache();
  // Der Installations-Hinweis wurde bereits weggeklickt — er soll die
  // eigentlichen Zustände in diesen Tests nicht überlagern.
  localStorage.setItem(INSTALL_HINT_KEY, '1');
});

describe('DashboardScreen', () => {
  it('führt beim allerersten Start durch drei Schritte', async () => {
    await db.settings.put(DEFAULT_SETTINGS);
    renderScreen();

    expect(await screen.findByText('Willkommen')).toBeInTheDocument();
    expect(screen.getByText('Zuchttiere anlegen')).toBeInTheDocument();
    expect(screen.getByText('Einstellungen ausfüllen')).toBeInTheDocument();
    expect(screen.getByText('App zum Home-Bildschirm')).toBeInTheDocument();
  });

  it('bleibt ruhig, wenn alles erledigt ist', async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS, lastBackupAt: nowISO() });
    await db.cats.put({
      id: 'cat-1',
      callName: 'Mira',
      sex: 'female',
      breed: 'Russisch Blau',
      status: 'active',
      isOwn: true,
      ...STAMP,
    });
    renderScreen();

    expect(await screen.findByText('Für heute ist alles erledigt.')).toBeInTheDocument();
    expect(screen.queryByText('Willkommen')).not.toBeInTheDocument();
  });

  it('bietet den direkten Absprung in den Wiege-Modus an', async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS, lastBackupAt: nowISO() });
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
      birthDate: addDays(todayISO(), -3),
      ...STAMP,
    });
    await db.kittens.put({
      id: 'kit-1',
      litterId: 'litter-1',
      collarColor: 'red',
      sex: 'unknown',
      stillborn: false,
      saleStatus: 'available',
      ...STAMP,
    });

    renderScreen();

    expect(await screen.findByText('Heute noch nicht gewogen')).toBeInTheDocument();
    expect(screen.getByText('Wurf von Mira')).toBeInTheDocument();
    expect(screen.getByText('Wiegen')).toBeInTheDocument();
    expect(screen.queryByText('Für heute ist alles erledigt.')).not.toBeInTheDocument();
  });

  it('erinnert an die Sicherung, wenn noch nie gesichert wurde', async () => {
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
    renderScreen();

    expect(await screen.findByText('Zeit für eine Sicherung')).toBeInTheDocument();
    expect(screen.getByText(/noch nie gesichert/i)).toBeInTheDocument();
  });

  it('versteckt Gewichte, wenn das Modul ausgeschaltet ist', async () => {
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      lastBackupAt: nowISO(),
      modules: { ...DEFAULT_SETTINGS.modules, weights: false },
    });
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
      birthDate: addDays(todayISO(), -3),
      ...STAMP,
    });
    await db.kittens.put({
      id: 'kit-1',
      litterId: 'litter-1',
      collarColor: 'red',
      sex: 'unknown',
      stillborn: false,
      saleStatus: 'available',
      ...STAMP,
    });

    renderScreen();

    expect(await screen.findByText('Für heute ist alles erledigt.')).toBeInTheDocument();
    expect(screen.queryByText('Heute noch nicht gewogen')).not.toBeInTheDocument();
  });
});
