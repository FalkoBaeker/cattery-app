import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { BrandImage, type BrandImageName } from './BrandImage';

/* ------------------------------------------------------------------ */
/*  Karte / Abschnitt                                                  */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={[
        'pearl-panel rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]',
        padded ? 'p-4' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className = '',
  description,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={['flex flex-col gap-2', className].join(' ')}>
      {(title || action) && (
        <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-1">
          <div className="min-w-0 flex-[1_1_10rem]">
            {title && (
              <h2 className="section-title text-[0.8rem] font-semibold text-text-dim uppercase">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-sm text-text-faint">{description}</p>}
          </div>
          {action && <div className="flex max-w-full flex-wrap items-center gap-2">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Listen                                                             */
/* ------------------------------------------------------------------ */

/** Container mit Trennlinien zwischen den Zeilen. */
export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        'pearl-panel overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]',
        '[&>*+*]:border-t [&>*+*]:border-border',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export interface ListRowProps {
  /** Führendes Element — Symbol, Farbpunkt, Bild. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Rechte Seite, z. B. ein Wert. */
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  /** Pfeil rechts anzeigen (bei onClick/href automatisch an). */
  chevron?: boolean;
  className?: string;
  danger?: boolean;
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  chevron,
  className = '',
  danger,
}: ListRowProps) {
  const interactive = Boolean(onClick);
  const showChevron = chevron ?? interactive;

  const inner = (
    <>
      {leading && <span className="flex shrink-0 items-center justify-center">{leading}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span
          className={[
            'truncate text-[0.97rem] font-medium',
            danger ? 'text-alert' : 'text-text',
          ].join(' ')}
        >
          {title}
        </span>
        {subtitle != null && subtitle !== '' && (
          <span className="truncate text-[0.85rem] text-text-dim">{subtitle}</span>
        )}
      </span>
      {trailing != null && (
        <span className="shrink-0 text-right text-[0.9rem] text-text-dim tabular">{trailing}</span>
      )}
      {showChevron && (
        <Icon name="chevron-right" size={18} className="shrink-0 text-text-faint" />
      )}
    </>
  );

  const base = 'flex w-full items-center gap-3 px-4 py-3 min-h-14 text-left';

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={[base, 'list-row transition-colors active:bg-surface-2', className].join(' ')}>
        {inner}
      </button>
    );
  }
  return <div className={[base, className].join(' ')}>{inner}</div>;
}

/* ------------------------------------------------------------------ */
/*  Leerzustand                                                        */
/* ------------------------------------------------------------------ */

const EMPTY_ART: Partial<Record<IconName, BrandImageName>> = {
  cat: 'cat-family',
  paw: 'cat-family',
  home: 'today',
  users: 'waitlist',
  calendar: 'calendar',
  menu: 'more',
};

export function EmptyState({
  icon = 'paw',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const artwork = EMPTY_ART[icon];
  return (
    <div className="empty-state flex flex-col items-center gap-3 px-6 py-7 text-center">
      {artwork ? (
        <BrandImage name={artwork} className={artwork === 'cat-family' ? 'empty-art size-40' : 'empty-art size-24'} />
      ) : (
        <span className="pearl-panel flex size-14 items-center justify-center rounded-xl border border-border text-accent shadow-card">
          <Icon name={icon} size={26} />
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p className="font-medium text-text">{title}</p>
        {description && (
          <p className="max-w-xs text-sm leading-relaxed text-text-dim">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kennzeichen                                                        */
/* ------------------------------------------------------------------ */

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'alert';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-text-dim',
  accent: 'bg-accent-soft text-accent',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  alert: 'bg-alert-soft text-alert',
};

export function Badge({
  children,
  tone = 'neutral',
  icon,
  className = '',
}: {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: IconName;
  className?: string;
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.75rem] font-medium whitespace-nowrap',
        TONES[tone],
        className,
      ].join(' ')}
    >
      {icon && <Icon name={icon} size={13} strokeWidth={2} />}
      {children}
    </span>
  );
}

/** Farbpunkt für die Halsbandfarbe eines Kittens. */
export function ColorDot({ hex, size = 14, ring }: { hex: string; size?: number; ring?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={ring ? 'inline-block rounded-full ring-2 ring-surface' : 'inline-block rounded-full'}
      style={{
        width: size,
        height: size,
        background: hex,
        boxShadow: 'inset 0 0 0 1px oklch(0% 0 0 / 0.16)',
      }}
    />
  );
}

/** Hinweiskasten für Warnungen und Erklärungen. */
export function Callout({
  tone = 'neutral',
  icon,
  title,
  children,
}: {
  tone?: BadgeTone;
  icon?: IconName;
  title?: string;
  children?: ReactNode;
}) {
  const border: Record<BadgeTone, string> = {
    neutral: 'border-border bg-surface-2',
    accent: 'border-accent/25 bg-accent-soft',
    ok: 'border-ok/25 bg-ok-soft',
    warn: 'border-warn/30 bg-warn-soft',
    alert: 'border-alert/30 bg-alert-soft',
  };
  const text: Record<BadgeTone, string> = {
    neutral: 'text-text-dim',
    accent: 'text-accent',
    ok: 'text-ok',
    warn: 'text-warn',
    alert: 'text-alert',
  };
  return (
    <div className={['flex gap-2.5 rounded-[var(--radius-card)] border p-3', border[tone]].join(' ')}>
      {icon && <Icon name={icon} size={19} className={['mt-px shrink-0', text[tone]].join(' ')} />}
      <div className="min-w-0 text-[0.88rem] leading-relaxed">
        {title && <p className={['font-semibold', text[tone]].join(' ')}>{title}</p>}
        {children && <div className="text-text-dim">{children}</div>}
      </div>
    </div>
  );
}
