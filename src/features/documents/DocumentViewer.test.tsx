/**
 * Oberflächentests für die zwei Stellen, an denen es wirklich klemmt:
 * der Betrachter darf „wird geladen" nie als „leer" zeigen, und der
 * Schnellzugriff muss auch dann einen Weg nach vorn anbieten, wenn es
 * noch gar kein Dokument gibt.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { db, insert, putAttachment, wipeDatabase } from '../../db/db';
import { ToastProvider, ConfirmProvider } from '../../ui';
import { DocumentViewer } from './DocumentViewer';
import { QuickDocButton } from './QuickDocButton';
import type { ReactNode } from 'react';

function wrap(node: ReactNode) {
  return render(
    <ToastProvider>
      <ConfirmProvider>{node}</ConfirmProvider>
    </ToastProvider>,
  );
}

async function makeAttachment() {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
  const record = await putAttachment(blob, { width: 100, height: 80 });
  return record.id;
}

beforeEach(async () => {
  await wipeDatabase();
  // fake-indexeddb gibt Blobs als einfache Objekte zurück; `createObjectURL`
  // lehnt die ab. Im Browser ist das kein Thema — hier wird es überbrückt.
  let counter = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${counter++}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DocumentViewer', () => {
  it('zeigt Titel und Seitenzähler', async () => {
    const a = await makeAttachment();
    const b = await makeAttachment();
    const doc = await insert(db.documents, {
      kind: 'vaccination_card',
      title: 'Impfpass Mira',
      pageIds: [a, b],
      customerVisible: false,
    });

    wrap(<DocumentViewer documentId={doc.id} onClose={() => {}} />);

    expect(await screen.findByText('Impfpass Mira')).toBeInTheDocument();
    expect(await screen.findByText('Seite 1 von 2')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Impfpass Mira' }),
    ).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('img', { name: 'Impfpass Mira, Seite 1 von 2' })).toBeInTheDocument();
  });

  it('bindet den Fokus modal und stellt ihn beim Schließen wieder her', async () => {
    const previous = document.createElement('button');
    previous.textContent = 'Hintergrund';
    document.body.append(previous);
    previous.focus();

    const view = wrap(
      <DocumentViewer pageIds={[]} title="Leerer Betrachter" onClose={() => {}} />,
    );

    const close = await screen.findByRole('button', { name: 'Betrachter schließen' });
    await waitFor(() => expect(close).toHaveFocus());

    view.unmount();
    expect(previous).toHaveFocus();
    previous.remove();
  });

  it('erklärt einen leeren Eintrag statt ihn nur weiß zu lassen', async () => {
    const doc = await insert(db.documents, {
      kind: 'other',
      title: 'Ohne Seiten',
      pageIds: [],
      customerVisible: false,
    });

    wrap(<DocumentViewer documentId={doc.id} onClose={() => {}} />);

    expect(await screen.findByText('Keine Seiten vorhanden')).toBeInTheDocument();
  });

  it('stellt einen Ladezustand nicht als leer dar', async () => {
    const a = await makeAttachment();
    const doc = await insert(db.documents, {
      kind: 'pedigree',
      title: 'Stammbaum',
      pageIds: [a],
      customerVisible: true,
    });

    wrap(<DocumentViewer documentId={doc.id} onClose={() => {}} />);

    // Direkt nach dem Rendern ist noch nichts geladen — trotzdem darf hier
    // kein Leerzustand stehen.
    expect(screen.queryByText('Keine Seiten vorhanden')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Stammbaum')).toBeInTheDocument());
  });
});

describe('QuickDocButton', () => {
  it('führt ohne Dokument zur Kamera statt in eine Sackgasse', async () => {
    wrap(<QuickDocButton catId="cat-1" kind="vaccination_card" />);
    expect(await screen.findByRole('button', { name: /Impfpass aufnehmen/ })).toBeInTheDocument();
  });

  it('bietet bei genau einem Dokument den direkten Weg an', async () => {
    const a = await makeAttachment();
    await insert(db.documents, {
      kind: 'vaccination_card',
      title: 'Impfpass Mira',
      catId: 'cat-1',
      pageIds: [a],
      customerVisible: false,
    });

    wrap(<QuickDocButton catId="cat-1" kind="vaccination_card" />);
    expect(await screen.findByRole('button', { name: /Impfpass zeigen/ })).toBeInTheDocument();
  });

  it('zeigt bei mehreren Dokumenten die Anzahl', async () => {
    const a = await makeAttachment();
    for (const title of ['Impfpass Seite A', 'Impfpass Seite B']) {
      await insert(db.documents, {
        kind: 'vaccination_card',
        title,
        catId: 'cat-1',
        pageIds: [a],
        customerVisible: false,
      });
    }

    wrap(<QuickDocButton catId="cat-1" kind="vaccination_card" />);
    expect(await screen.findByRole('button', { name: /Impfpass \(2\)/ })).toBeInTheDocument();
  });

  it('findet auch ein wurfweit abgelegtes Dokument', async () => {
    const a = await makeAttachment();
    await insert(db.documents, {
      kind: 'vaccination_card',
      title: 'Impfpass Wurf',
      litterId: 'litter-1',
      pageIds: [a],
      customerVisible: false,
    });

    wrap(<QuickDocButton kittenId="kitten-1" litterId="litter-1" kind="vaccination_card" />);
    expect(await screen.findByRole('button', { name: /Impfpass zeigen/ })).toBeInTheDocument();
  });

  it('verwechselt Arten nicht', async () => {
    const a = await makeAttachment();
    await insert(db.documents, {
      kind: 'invoice',
      title: 'Rechnung',
      catId: 'cat-1',
      pageIds: [a],
      customerVisible: false,
    });

    wrap(<QuickDocButton catId="cat-1" kind="pedigree" />);
    expect(await screen.findByRole('button', { name: /Stammbaum aufnehmen/ })).toBeInTheDocument();
  });
});
