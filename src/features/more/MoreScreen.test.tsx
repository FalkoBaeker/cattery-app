import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MoreScreen } from './MoreScreen';
import { clearSettingsCache, db, wipeDatabase } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../types';

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/mehr']}>
      <MoreScreen />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await wipeDatabase();
  clearSettingsCache();
});

describe('MoreScreen', () => {
  it('zeigt alle Bereiche, solange nichts abgeschaltet ist', async () => {
    await db.settings.put(DEFAULT_SETTINGS);
    renderScreen();

    expect(await screen.findByText('Dokumente')).toBeInTheDocument();
    expect(screen.getByText('Verträge')).toBeInTheDocument();
    expect(screen.getByText('Kosten')).toBeInTheDocument();
    expect(screen.getByText('Einstellungen')).toBeInTheDocument();
  });

  it('blendet abgeschaltete Module aus, Einstellungen bleiben immer da', async () => {
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      modules: { ...DEFAULT_SETTINGS.modules, costs: false, contracts: false },
    });
    renderScreen();

    expect(await screen.findByText('Einstellungen')).toBeInTheDocument();
    expect(screen.getByText('Dokumente')).toBeInTheDocument();
    expect(screen.queryByText('Kosten')).not.toBeInTheDocument();
    expect(screen.queryByText('Verträge')).not.toBeInTheDocument();
  });

  it('kommt ohne gespeicherte Einstellungen mit den Vorgaben zurecht', async () => {
    renderScreen();
    expect(await screen.findByText('Einstellungen')).toBeInTheDocument();
  });

  it('nennt den Zwingernamen in der Kopfzeile, wenn er gepflegt ist', async () => {
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      seller: { ...DEFAULT_SETTINGS.seller, catteryName: 'von der Silbernen Newa' },
    });
    renderScreen();
    expect(await screen.findByText('von der Silbernen Newa')).toBeInTheDocument();
  });

  it('erklärt, dass alles nur auf diesem Gerät liegt', async () => {
    await db.settings.put(DEFAULT_SETTINGS);
    renderScreen();
    expect(
      await screen.findByText(/ausschließlich auf diesem iPhone/i),
    ).toBeInTheDocument();
  });
});
