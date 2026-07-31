/**
 * Kleine Bausteine, die nur die Warteliste braucht.
 * Wandert etwas davon in ein zweites Modul, gehört es nach src/ui.
 */

import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../ui';

/* ------------------------------------------------------------------ */
/*  Filterknopf                                                        */
/* ------------------------------------------------------------------ */

/**
 * Runder Filterknopf. Mindestens 44 px hoch, damit er einhändig sicher
 * zu treffen ist.
 */
export function Chip({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={[
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5',
        'text-[0.88rem] font-medium whitespace-nowrap transition-colors',
        active
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-border bg-surface text-text-dim active:bg-surface-2',
      ].join(' ')}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

/** Waagerechte, scrollbare Reihe von Filterknöpfen. */
export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="scroll-x no-scrollbar flex gap-1.5 py-0.5">
      {children}
    </div>
  );
}

/** Dünner Trenner zwischen zwei Filtergruppen. */
export function ChipDivider() {
  return <span aria-hidden="true" className="my-2 w-px shrink-0 bg-border" />;
}

/* ------------------------------------------------------------------ */
/*  Beschriftete Zeile in einer Karte                                  */
/* ------------------------------------------------------------------ */

export function DataRow({ label, value }: { label: string; value?: ReactNode }) {
  const empty = value == null || value === '' || value === '—';
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-[0.85rem] text-text-dim">{label}</span>
      <span
        className={[
          'min-w-0 text-right text-[0.92rem] break-words',
          empty ? 'text-text-faint' : 'text-text',
        ].join(' ')}
      >
        {empty ? 'nicht erfasst' : value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ladezustand                                                        */
/* ------------------------------------------------------------------ */

/**
 * useLiveQuery liefert beim ersten Rendern `undefined`. Das ist „wird noch
 * geladen" und darf nie als „nichts vorhanden" aussehen.
 */
export function LoadingList({
  rows = 3,
  label = 'Wird geladen …',
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface"
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
        >
          <span className="size-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="h-3.5 w-1/3 animate-pulse rounded bg-surface-2" />
            <span className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
          </span>
        </div>
      ))}
    </div>
  );
}
