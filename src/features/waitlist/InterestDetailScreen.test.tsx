/**
 * Oberflächentests des Interessenten-Bildschirms.
 * Geprüft wird, was im Alltag schiefgehen kann: Ladezustand, gelöschter
 * Eintrag, die Schnellerfassung im Verlauf, die Status-Kette und die Absage.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

import { ConfirmProvider, ToastProvider } from '../../ui';
import { db, wipeDatabase } from '../../db/db';
import { InterestDetailScreen } from './InterestDetailScreen';
import { createInterest } from './store';

function renderScreen(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/warteliste/${id}`]}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/warteliste/:interestId" element={<InterestDetailScreen />} />
            <Route path="/warteliste" element={<p>Warteliste</p>} />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await wipeDatabase();
});

describe('InterestDetailScreen', () => {
  it('zeigt einen Ladezustand, keinen leeren Bildschirm', async () => {
    const a = await createInterest({ name: 'Anna' });
    renderScreen(a.id);

    expect(screen.getByText('Eintrag wird geladen …')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Anna' })).toBeInTheDocument());
  });

  it('erklärt verständlich, wenn es den Eintrag nicht mehr gibt', async () => {
    renderScreen('gibt-es-nicht');
    await waitFor(() => expect(screen.getByText('Eintrag nicht gefunden')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Zurück zur Warteliste/ })).toBeInTheDocument();
  });

  it('hält einen Gesprächsverlauf mit zwei Handgriffen fest', async () => {
    const user = userEvent.setup();
    const a = await createInterest({ name: 'Anna' });
    renderScreen(a.id);

    await waitFor(() => expect(screen.getByText('Noch nichts festgehalten')).toBeInTheDocument());

    await user.click(screen.getByRole('radio', { name: /WhatsApp/ }));
    await user.type(
      screen.getByLabelText('Was wurde besprochen?'),
      'Fragen zum Allergietest beantwortet',
    );
    await user.click(screen.getByRole('button', { name: /In den Verlauf eintragen/ }));

    await waitFor(async () => {
      const notes = await db.interestNotes.where('interestId').equals(a.id).toArray();
      expect(notes).toHaveLength(1);
      expect(notes[0].channel).toBe('whatsapp');
      expect(notes[0].text).toBe('Fragen zum Allergietest beantwortet');
    });

    expect(
      await screen.findByText('Fragen zum Allergietest beantwortet'),
    ).toBeInTheDocument();
  });

  it('schaltet den Status über die Kette weiter', async () => {
    const user = userEvent.setup();
    const a = await createInterest({ name: 'Anna' });
    renderScreen(a.id);

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Vorgemerkt' })).toBeInTheDocument());
    await user.click(screen.getByRole('radio', { name: 'Vorgemerkt' }));

    await waitFor(async () => {
      expect((await db.interests.get(a.id))?.status).toBe('shortlisted');
    });
  });

  it('fragt vor einer Absage nach und legt den Eintrag dann in den Papierkorb', async () => {
    const user = userEvent.setup();
    const a = await createInterest({ name: 'Anna' });
    renderScreen(a.id);

    await waitFor(() => expect(screen.getByRole('button', { name: /^Absagen$/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^Absagen$/ }));

    const dialog = await screen.findByRole('alertdialog');
    expect(screen.getByText(/nach 30 Tagen endgültig gelöscht/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Absagen' }));

    await waitFor(async () => {
      const after = await db.interests.get(a.id);
      expect(after?.status).toBe('declined');
      expect(after?.deletedAt).toBeTruthy();
    });
  });

  it('erklärt fehlende Kontaktdaten, statt still nichts zu tun', async () => {
    const user = userEvent.setup();
    const a = await createInterest({ name: 'Anna' });
    renderScreen(a.id);

    await waitFor(() => expect(screen.getByRole('button', { name: /Anrufen/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Anrufen/ }));

    expect(
      await screen.findByText('Eine Telefonnummer ist nicht hinterlegt.'),
    ).toBeInTheDocument();
  });

  it('bietet ein freies Notizfeld und keinerlei Bewertung', async () => {
    const a = await createInterest({ name: 'Anna' });
    renderScreen(a.id);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Notiz' })).toBeInTheDocument());
    expect(screen.getByText(/Platz für alles, was sonst nirgends hinpasst/)).toBeInTheDocument();
    expect(screen.queryByText(/Bewertung/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sterne/i)).not.toBeInTheDocument();
  });
});
