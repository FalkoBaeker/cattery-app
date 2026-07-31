import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { SettingsScreen } from './SettingsScreen';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { clearSettingsCache, db, wipeDatabase } from '../../db/db';
import { DEFAULT_SETTINGS } from '../../types';

function renderScreen() {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <MemoryRouter initialEntries={['/mehr/einstellungen']}>
          <SettingsScreen />
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

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('SettingsScreen', () => {
  it('kennzeichnet unvollständige Verkäuferdaten als offen', async () => {
    renderScreen();
    expect(await screen.findByText('Verkäuferdaten')).toBeInTheDocument();
    expect(
      screen.getByText('Noch nicht ausgefüllt — für die Verträge nötig'),
    ).toBeInTheDocument();
  });

  it('speichert die Verkäuferdaten und weist auf den Datenschutz hin', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /Verkäuferdaten/ }));
    expect(await screen.findByText('Bleibt auf diesem iPhone')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Name'), 'Anna Beispiel');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(async () => {
      const stored = await db.settings.get('singleton');
      expect(stored?.seller.name).toBe('Anna Beispiel');
    });
  });

  it('setzt das Farbschema sofort und dauerhaft', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('radio', { name: 'Dunkel' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await waitFor(async () => {
      expect((await db.settings.get('singleton'))?.theme).toBe('dark');
    });
  });

  it('erklärt die Gewichtsschwellen und kann sie zurücksetzen', async () => {
    const user = userEvent.setup();
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      weight: { ...DEFAULT_SETTINGS.weight, goodGainG: 99 },
    });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /Gewichtsschwellen/ }));
    expect(
      await screen.findByText(/Ab diesem Wert wird die Zunahme grün/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Auf Vorgabe zurücksetzen' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(async () => {
      const stored = await db.settings.get('singleton');
      expect(stored?.weight.goodGainG).toBe(DEFAULT_SETTINGS.weight.goodGainG);
    });
  });

  it('speichert den Fahrplan aus einem einzigen Textfeld', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /Fahrplan/ }));
    const weeks = await screen.findByLabelText('Entwurmung in Woche');
    await user.clear(weeks);
    await user.type(weeks, '3 5 9');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(async () => {
      const stored = await db.settings.get('singleton');
      expect(stored?.schedule.dewormingWeeks).toEqual([3, 5, 9]);
    });
  });

  it('schaltet Bereiche ab, ohne Daten anzurühren', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /Module ein- und ausschalten/ }));
    expect(
      await screen.findByText(/Die dazugehörigen\s+Daten bleiben erhalten/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /Kosten/ }));

    await waitFor(async () => {
      expect((await db.settings.get('singleton'))?.modules.costs).toBe(false);
    });
  });

  it('sagt in der Sicherung nüchtern, was ohne sie passiert', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /Sichern und wiederherstellen/ }));
    expect(await screen.findByText('Ohne Sicherung sind die Daten weg')).toBeInTheDocument();
    expect(screen.getByText('Ersetzt alles Vorhandene')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sicherungsdatei auswählen/ })).toBeInTheDocument();
  });

  it('meldet ehrlich, wenn der Speicherverbrauch nicht ermittelbar ist', async () => {
    renderScreen();
    expect(
      await screen.findByText('Dieses Gerät gibt den Speicherverbrauch nicht preis.'),
    ).toBeInTheDocument();
  });

  it('fragt beim Zurücksetzen zweimal nach', async () => {
    const user = userEvent.setup();
    await db.cats.put({
      id: 'cat-1',
      callName: 'Mira',
      sex: 'female',
      breed: 'Russisch Blau',
      status: 'active',
      isOwn: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /Alle Daten löschen/ }));
    expect(await screen.findByText('Alle Daten löschen?')).toBeInTheDocument();

    // Erste Rückfrage bestätigen …
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    // … die zweite abbrechen.
    expect(await screen.findByText('Wirklich alles löschen?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(await db.cats.count()).toBe(1);
  });

  it('löscht erst nach der zweiten Bestätigung', async () => {
    const user = userEvent.setup();
    await db.cats.put({
      id: 'cat-1',
      callName: 'Mira',
      sex: 'female',
      breed: 'Russisch Blau',
      status: 'active',
      isOwn: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /Alle Daten löschen/ }));
    await user.click(await screen.findByRole('button', { name: 'Weiter' }));
    await user.click(await screen.findByRole('button', { name: 'Endgültig löschen' }));

    await waitFor(async () => {
      expect(await db.cats.count()).toBe(0);
    });
  });
});
