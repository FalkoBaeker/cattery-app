import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'ui-button-primary bg-accent text-on-accent active:brightness-95 disabled:bg-surface-3 disabled:text-text-faint',
  secondary:
    'ui-button-secondary bg-surface text-text border-border active:bg-surface-2 disabled:text-text-faint',
  ghost: 'ui-button-ghost bg-transparent text-accent border-transparent active:bg-accent-soft',
  danger: 'bg-alert text-white border-transparent active:brightness-95',
  quiet: 'ui-button-quiet bg-surface-2 text-text active:bg-surface-3',
};

const SIZES: Record<Size, string> = {
  // Mindestens 44 px hoch — Apples Vorgabe für sicher treffbare Ziele.
  sm: 'min-h-11 px-3 text-[0.9rem] gap-1.5 rounded-lg',
  md: 'min-h-11 px-4 text-[0.95rem] gap-2 rounded-lg',
  lg: 'min-h-13 px-5 text-base gap-2 rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  block,
  loading,
  children,
  className = '',
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'ui-button inline-flex items-center justify-center border font-medium select-none',
        'disabled:opacity-60 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        block ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <Spinner />
      ) : icon ? (
        <Icon name={icon} size={size === 'sm' ? 17 : 19} />
      ) : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={size === 'sm' ? 17 : 19} /> : null}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  variant?: Variant;
  size?: Size;
}

/** Symbolknopf. `label` ist Pflicht (Screenreader und Tooltip). */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: IconButtonProps) {
  const box = size === 'lg' ? 'size-12' : 'size-11';
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={[
        'ui-button inline-flex shrink-0 items-center justify-center rounded-lg border select-none',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant],
        box,
        className,
      ].join(' ')}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 18 : 21} />
    </button>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

/**
 * Dauerhafte Hauptaktion rechts in der Kopfzeile. Screen reserviert
 * dort Platz, damit die Aktion keine Inhalte oder anderen Knöpfe verdeckt.
 */
export function Fab({
  icon = 'plus',
  label,
  onClick,
}: {
  icon?: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="screen-fab ui-button ui-button-primary fixed right-3 z-30 flex size-11 items-center justify-center rounded-xl border bg-accent text-on-accent active:brightness-95"
      style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      <Icon name={icon} size={26} strokeWidth={2} />
    </button>
  );
}
