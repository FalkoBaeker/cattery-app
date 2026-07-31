/**
 * Kleine Bausteine, die nur das Wurf-Modul braucht.
 * Sobald ein zweites Modul einen davon benötigt, wandert er nach src/ui/.
 */

import type { ReactNode } from 'react';
import {
  Badge,
  ColorDot,
  Icon,
  Segmented,
  Spinner,
  type BadgeTone,
} from '../../ui';
import {
  COLLAR_COLORS,
  KITTEN_SALE_STATUS_LABEL,
  LITTER_STATUS_LABEL,
  SEX_LABEL,
  collarColor,
} from '../../types';
import type { CollarColorKey, KittenSaleStatus, LitterStatus, SexOrUnknown } from '../../types';
import { WEIGHT_LEVEL_LABEL, WEIGHT_LEVEL_TONE, type WeightLevel } from '../../domain/weight';

/* ------------------------------------------------------------------ */
/*  Ladezustand                                                        */
/* ------------------------------------------------------------------ */

/** useLiveQuery liefert anfangs undefined — das ist *nicht* „leer". */
export function Loading({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-text-dim">
      <Spinner />
      <span className="text-[0.9rem]">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kennzeichen                                                        */
/* ------------------------------------------------------------------ */

const LITTER_TONE: Record<LitterStatus, BadgeTone> = {
  planned: 'neutral',
  mated: 'accent',
  pregnant: 'accent',
  born: 'ok',
  completed: 'neutral',
  cancelled: 'neutral',
};

export function LitterStatusBadge({ status }: { status: LitterStatus }) {
  return <Badge tone={LITTER_TONE[status]}>{LITTER_STATUS_LABEL[status]}</Badge>;
}

const SALE_TONE: Record<KittenSaleStatus, BadgeTone> = {
  available: 'neutral',
  reserved: 'accent',
  sold: 'ok',
  sold_breeding_reserved: 'ok',
  kept: 'accent',
  deceased: 'neutral',
};

export function SaleStatusBadge({ status }: { status: KittenSaleStatus }) {
  return <Badge tone={SALE_TONE[status]}>{KITTEN_SALE_STATUS_LABEL[status]}</Badge>;
}

export function WeightLevelBadge({ level }: { level: WeightLevel }) {
  if (level === 'unknown') return null;
  return <Badge tone={WEIGHT_LEVEL_TONE[level]}>{WEIGHT_LEVEL_LABEL[level]}</Badge>;
}

/** Farbpunkt der Halsbandfarbe, mit Namen für Screenreader. */
export function CollarDot({ colorKey, size = 14 }: { colorKey: CollarColorKey; size?: number }) {
  const c = collarColor(colorKey);
  return (
    <span className="inline-flex items-center" title={`Halsband ${c.label}`}>
      <ColorDot hex={c.hex} size={size} />
      <span className="sr-only">Halsband {c.label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Datenzeilen                                                        */
/* ------------------------------------------------------------------ */

export function DataRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'dim' | 'normal';
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-[0.85rem] text-text-dim">{label}</span>
      <span
        className={[
          'min-w-0 text-right text-[0.95rem]',
          tone === 'dim' ? 'text-text-dim' : 'text-text',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Eingaben                                                           */
/* ------------------------------------------------------------------ */

/** Datumsfeld. Der Wert ist immer „YYYY-MM-DD" — genau wie in der Datenbank. */
export function DateInput({
  label,
  value,
  onChange,
  hint,
  max,
  min,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  hint?: string;
  max?: string;
  min?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-1 text-[0.85rem] font-medium text-text-dim">{label}</span>
      <input
        type="date"
        value={value ?? ''}
        max={max}
        min={min}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="min-h-11 w-full rounded-[var(--radius-field)] border border-border bg-surface px-3.5 py-2.5 text-text focus:border-accent"
      />
      {hint && <p className="px-1 text-[0.8rem] text-text-faint">{hint}</p>}
    </div>
  );
}

export function SexPicker({
  value,
  onChange,
  label = 'Geschlecht',
}: {
  value: SexOrUnknown;
  onChange: (v: SexOrUnknown) => void;
  label?: string;
}) {
  return (
    <Segmented<SexOrUnknown>
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { value: 'unknown', label: SEX_LABEL.unknown },
        { value: 'female', label: SEX_LABEL.female },
        { value: 'male', label: SEX_LABEL.male },
      ]}
    />
  );
}

/**
 * Auswahl der Halsbandfarbe. Bereits vergebene Farben bleiben wählbar —
 * manchmal wird ein Halsband neu vergeben —, sind aber gekennzeichnet.
 */
export function CollarPicker({
  value,
  onChange,
  used = [],
  label = 'Halsbandfarbe',
}: {
  value: CollarColorKey;
  onChange: (v: CollarColorKey) => void;
  used?: CollarColorKey[];
  label?: string;
}) {
  const taken = new Set(used);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-1 text-[0.85rem] font-medium text-text-dim">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-2">
        {COLLAR_COLORS.map((c) => {
          const active = c.key === value;
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(c.key)}
              className={[
                'flex min-h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border p-2 transition-colors',
                active
                  ? 'border-accent bg-accent-soft'
                  : 'border-border bg-surface active:bg-surface-2',
              ].join(' ')}
            >
              <span className="relative flex items-center justify-center">
                <ColorDot hex={c.hex} size={22} />
                {active && (
                  <Icon
                    name="check"
                    size={14}
                    strokeWidth={3}
                    className="absolute text-on-accent mix-blend-difference"
                  />
                )}
              </span>
              <span
                className={[
                  'text-[0.72rem] leading-tight',
                  active ? 'font-semibold text-accent' : 'text-text-dim',
                ].join(' ')}
              >
                {c.label}
                {taken.has(c.key) && c.key !== 'none' ? ' ·' : ''}
              </span>
            </button>
          );
        })}
      </div>
      {used.length > 0 && (
        <p className="px-1 text-[0.8rem] text-text-faint">
          Mit · gekennzeichnete Farben sind in diesem Wurf schon vergeben.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kleine Kurve                                                       */
/* ------------------------------------------------------------------ */

/** Schlichte Gewichtskurve ohne Bibliothek. Ab zwei Punkten sinnvoll. */
export function Sparkline({
  values,
  height = 44,
  label,
}: {
  values: number[];
  height?: number;
  label?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 100 / (values.length - 1);

  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(100 - ((v - min) / span) * 100).toFixed(2)}`)
    .join(' ');

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ height, width: '100%' }}
      className="text-accent"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
