/**
 * Oberflächentests der Bausteine, die andere Module mitbenutzen:
 * Kurve, Verlauf mit Korrigieren/Löschen, Warnstufen-Kennzeichen.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { db, wipeDatabase } from '../../db/db';
import { ConfirmProvider, ToastProvider } from '../../ui';
import { WeightChart } from './WeightChart';
import { WeightHistory } from './WeightHistory';
import { WeightBadge } from './WeightBadge';
import type { ChartSeriesInput } from './chart';

function at(y: number, m: number, d: number, h = 8): string {
  return new Date(y, m - 1, d, h, 0, 0).toISOString();
}

function wrap(node: ReactNode) {
  return render(
    <ToastProvider>
      <ConfirmProvider>{node}</ConfirmProvider>
    </ToastProvider>,
  );
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

/* ------------------------------------------------------------------ */

describe('WeightChart', () => {
  it('zeigt einen freundlichen Leerzustand ohne Messungen', () => {
    render(<WeightChart series={[]} birthDate="2026-03-03" />);
    expect(screen.getByText('Noch keine Wiegung')).toBeInTheDocument();
  });

  it('zeichnet bei einer einzigen Messung einen Punkt und keine Linie', () => {
    const series: ChartSeriesInput[] = [
      { kittenId: 'a', label: 'Rot', hex: '#e5484d', entries: [{ at: at(2026, 3, 3), grams: 95 }] },
    ];
    const { container } = render(<WeightChart series={series} birthDate="2026-03-03" />);
    expect(container.querySelectorAll('path')).toHaveLength(0);
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0);
  });

  it('zeichnet ab zwei Tagen eine Linie', () => {
    const series: ChartSeriesInput[] = [
      {
        kittenId: 'a',
        label: 'Rot',
        hex: '#e5484d',
        entries: [
          { at: at(2026, 3, 3), grams: 95 },
          { at: at(2026, 3, 4), grams: 108 },
        ],
      },
    ];
    const { container } = render(<WeightChart series={series} birthDate="2026-03-03" />);
    expect(container.querySelectorAll('path')).toHaveLength(1);
  });

  it('bleibt mit neun Kitten lesbar und beschriftet die Legende', () => {
    const series: ChartSeriesInput[] = Array.from({ length: 9 }, (_, i) => ({
      kittenId: `k${i}`,
      label: `Kitten ${i}`,
      hex: '#3b82f6',
      entries: [
        { at: at(2026, 3, 3), grams: 90 + i },
        { at: at(2026, 3, 5), grams: 120 + i },
      ],
    }));
    const { container } = render(
      <WeightChart series={series} focusKittenId="k4" birthDate="2026-03-03" />,
    );
    // Neun Linien plus der helle Saum unter dem betrachteten Kitten.
    expect(container.querySelectorAll('path')).toHaveLength(10);
    expect(screen.getAllByRole('listitem')).toHaveLength(9);
    expect(screen.getByText('Alter in Tagen')).toBeInTheDocument();
  });

  it('nennt die Achse ohne Geburtsdatum anders', () => {
    const series: ChartSeriesInput[] = [
      {
        kittenId: 'a',
        label: 'Rot',
        hex: '#e5484d',
        entries: [
          { at: at(2026, 3, 3), grams: 95 },
          { at: at(2026, 3, 4), grams: 108 },
        ],
      },
    ];
    render(<WeightChart series={series} />);
    expect(screen.getByText('Tage seit der ersten Wiegung')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */

describe('WeightBadge', () => {
  it('nennt die Warnstufe und die Begründung, ohne einen Rat zu geben', () => {
    render(<WeightBadge level="concern" reasons={['Zunahme 4,0 g/Tag liegt unter 6 g.']} showReasons />);
    expect(screen.getByText('Auffällig')).toBeInTheDocument();
    expect(screen.getByText(/liegt unter 6 g/)).toBeInTheDocument();
    expect(screen.queryByText(/Tierarzt/i)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe('WeightHistory', () => {
  beforeEach(async () => {
    await wipeDatabase();
    await db.weights.bulkPut([
      { id: 'w1', kittenId: 'k1', at: at(2026, 3, 3, 8), grams: 95 },
      { id: 'w2', kittenId: 'k1', at: at(2026, 3, 3, 20), grams: 101 },
      { id: 'w3', kittenId: 'k1', at: at(2026, 3, 4, 8), grams: 110 },
    ]);
  });

  it('zeigt die Messungen neueste zuerst mit Unterschied zur Vorgängerin', async () => {
    wrap(<WeightHistory kittenId="k1" birthDate="2026-03-03" />);
    const rows = await screen.findAllByText(/\d+ g/);
    expect(rows[0]).toHaveTextContent('110 g');
    expect(await screen.findByText('+9 g')).toBeInTheDocument();
    expect(await screen.findByText('erste')).toBeInTheDocument();
  });

  it('erklärt einen leeren Verlauf', async () => {
    wrap(<WeightHistory kittenId="ohne" />);
    expect(await screen.findByText('Noch keine Wiegung')).toBeInTheDocument();
  });

  it('korrigiert eine Messung', async () => {
    const user = userEvent.setup();
    wrap(<WeightHistory kittenId="k1" birthDate="2026-03-03" />);

    await user.click(await screen.findByText('110 g'));
    const dialog = await screen.findByRole('dialog');
    const feld = within(dialog).getByLabelText('Gewicht');
    await user.clear(feld);
    await user.type(feld, '112');
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));

    await waitFor(async () => expect((await db.weights.get('w3'))?.grams).toBe(112));
  });

  it('löscht eine Messung erst nach Rückfrage', async () => {
    const user = userEvent.setup();
    wrap(<WeightHistory kittenId="k1" birthDate="2026-03-03" />);

    await user.click(await screen.findByText('110 g'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Messung löschen' }));

    const frage = await screen.findByRole('alertdialog');
    expect(within(frage).getByText('Messung löschen?')).toBeInTheDocument();
    await user.click(within(frage).getByRole('button', { name: 'Löschen' }));

    await waitFor(async () => expect(await db.weights.get('w3')).toBeUndefined());
  });
});
