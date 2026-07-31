/**
 * Oberflächentests der kniffligen Stellen:
 *  - „wird geladen" darf nie wie „nichts vorhanden" aussehen,
 *  - Suche und Filter,
 *  - der Papierkorb bleibt eingeklappt und lässt sich öffnen.
 *
 * Das Ziehen selbst wird hier nicht geprüft — dafür bräuchte jsdom ein
 * echtes Layout. Die Rechnung dahinter steckt in order.ts und ist dort
 * vollständig geprüft.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { ConfirmProvider, ToastProvider } from '../../ui';
import { db, wipeDatabase } from '../../db/db';
import { WaitlistScreen } from './WaitlistScreen';
import { createInterest, trashInterest, updateInterest } from './store';

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/warteliste']}>
      <ToastProvider>
        <ConfirmProvider>
          <WaitlistScreen />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await wipeDatabase();
});

describe('WaitlistScreen', () => {
  it('zeigt zuerst einen Ladezustand und erst danach den Leerzustand', async () => {
    renderScreen();

    expect(screen.getByText('Warteliste wird geladen …')).toBeInTheDocument();
    expect(screen.queryByText('Noch niemand auf der Warteliste')).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText('Noch niemand auf der Warteliste')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Ersten Interessenten anlegen/ })).toBeInTheDocument();
  });

  it('zeigt die Einträge in der gespeicherten Reihenfolge', async () => {
    const a = await createInterest({ name: 'Anna' });
    const b = await createInterest({ name: 'Bernd' });
    await updateInterest(a.id, { sortIndex: 1 });
    await updateInterest(b.id, { sortIndex: 0 });

    renderScreen();

    await waitFor(() => expect(screen.getByText('Anna')).toBeInTheDocument());
    const names = screen.getAllByText(/^(Anna|Bernd)$/).map((el) => el.textContent);
    expect(names).toEqual(['Bernd', 'Anna']);
  });

  it('sagt bei fehlendem Kontakt deutlich, dass noch nichts festgehalten wurde', async () => {
    await createInterest({ name: 'Anna' });
    renderScreen();
    await waitFor(() => expect(screen.getByText('Noch kein Kontakt festgehalten')).toBeInTheDocument());
  });

  it('filtert über die Suche und bietet einen Weg zurück', async () => {
    const user = userEvent.setup();
    await createInterest({ name: 'Anna' });
    await createInterest({ name: 'Bernd' });

    renderScreen();
    await waitFor(() => expect(screen.getByText('Anna')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Warteliste durchsuchen'), 'bern');

    await waitFor(() => expect(screen.queryByText('Anna')).not.toBeInTheDocument());
    expect(screen.getByText('Bernd')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Warteliste durchsuchen'));
    await user.type(screen.getByLabelText('Warteliste durchsuchen'), 'xyz');

    await waitFor(() => expect(screen.getByText('Nichts gefunden')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Filter zurücksetzen/ }));
    await waitFor(() => expect(screen.getByText('Anna')).toBeInTheDocument());
  });

  it('sperrt das Sortieren, solange gefiltert wird', async () => {
    const user = userEvent.setup();
    await createInterest({ name: 'Anna' });
    await createInterest({ name: 'Bernd' });

    renderScreen();
    await waitFor(() => expect(screen.getByText(/kurz gedrückt halten/)).toBeInTheDocument());

    await user.click(screen.getByRole('radio', { name: 'Neu' }));

    await waitFor(() =>
      expect(screen.getByText(/lässt sich die Reihenfolge nicht ändern/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/kurz gedrückt halten/)).not.toBeInTheDocument();
  });

  it('zeigt den Papierkorb eingeklappt und lässt ihn öffnen', async () => {
    const user = userEvent.setup();
    const a = await createInterest({ name: 'Anna' });
    await trashInterest(a.id);

    renderScreen();

    await waitFor(() => expect(screen.getByText(/Papierkorb/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Zurückholen/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByRole('button', { name: /Zurückholen/ })).toBeInTheDocument();
    expect(screen.getByText(/wird in 30 Tagen endgültig gelöscht/)).toBeInTheDocument();
  });

  it('holt einen Eintrag aus dem Papierkorb zurück', async () => {
    const user = userEvent.setup();
    const a = await createInterest({ name: 'Anna' });
    await trashInterest(a.id);

    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { expanded: false }));
    await user.click(screen.getByRole('button', { name: /Zurückholen/ }));

    await waitFor(async () => {
      expect((await db.interests.get(a.id))?.deletedAt).toBeUndefined();
    });
  });
});
