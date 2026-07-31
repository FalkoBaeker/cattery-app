import {
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from './Icon';
import { formatMoney, parseMoneyToCents } from '../lib/format';

/* ------------------------------------------------------------------ */
/*  Rahmen                                                             */
/* ------------------------------------------------------------------ */

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className = '' }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      {label && (
        <label htmlFor={id} className="px-1 text-[0.85rem] font-medium text-text-dim">
          {label}
          {required && <span className="ml-0.5 text-alert">*</span>}
        </label>
      )}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} role="alert" className="px-1 text-[0.8rem] text-alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="px-1 text-[0.8rem] text-text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  'w-full rounded-[var(--radius-field)] border bg-surface px-3.5 py-2.5 text-text ' +
  'placeholder:text-text-faint transition-colors ' +
  'disabled:bg-surface-2 disabled:text-text-faint';

function controlClass(invalid: boolean, extra = '') {
  return [
    CONTROL_BASE,
    invalid ? 'border-alert' : 'border-border focus:border-accent',
    'min-h-11',
    extra,
  ].join(' ');
}

/* ------------------------------------------------------------------ */
/*  Steuerelemente                                                     */
/* ------------------------------------------------------------------ */

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export function TextInput({
  label,
  hint,
  error,
  required,
  containerClassName,
  className = '',
  ...rest
}: TextInputProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={controlClass(invalid, className)}
          {...rest}
        />
      )}
    </Field>
  );
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function TextArea({ label, hint, error, required, className = '', rows = 4, ...rest }: TextAreaProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={controlClass(invalid, ['resize-y leading-relaxed', className].join(' '))}
          {...rest}
        />
      )}
    </Field>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export function Select({
  label,
  hint,
  error,
  required,
  options,
  placeholder,
  className = '',
  ...rest
}: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={required}
            className={controlClass(invalid, ['appearance-none pr-10', className].join(' '))}
            {...rest}
          >
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
          <Icon
            name="chevron-down"
            size={17}
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-faint"
          />
        </div>
      )}
    </Field>
  );
}

/** Zahlenfeld mit numerischer Tastatur auf dem iPhone. */
export interface NumberInputProps extends Omit<TextInputProps, 'value' | 'onChange' | 'type'> {
  value: number | null;
  onValueChange: (v: number | null) => void;
  suffix?: string;
  decimal?: boolean;
}

export function NumberInput({
  value,
  onValueChange,
  suffix,
  decimal = false,
  label,
  hint,
  error,
  required,
  containerClassName,
  className = '',
  ...rest
}: NumberInputProps) {
  const [raw, setRaw] = useState<string | null>(null);
  const shown = raw ?? (value == null ? '' : String(value).replace('.', ','));

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <input
            id={id}
            type="text"
            inputMode={decimal ? 'decimal' : 'numeric'}
            value={shown}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={required}
            onChange={(e) => {
              const next = e.target.value;
              setRaw(next);
              const cleaned = next.replace(',', '.').replace(/[^\d.-]/g, '');
              if (cleaned === '' || cleaned === '-') {
                onValueChange(null);
                return;
              }
              const n = Number(cleaned);
              if (Number.isFinite(n)) onValueChange(decimal ? n : Math.round(n));
            }}
            onBlur={() => setRaw(null)}
            className={controlClass(invalid, [suffix ? 'pr-12' : '', 'tabular', className].join(' '))}
            {...rest}
          />
          {suffix && (
            <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[0.9rem] text-text-faint">
              {suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}

/** Geldfeld — speichert Cent, zeigt Euro. */
export function MoneyInput({
  valueCents,
  onValueChange,
  label,
  hint,
  error,
  required,
  placeholder = '0,00',
}: {
  valueCents: number | null;
  onValueChange: (cents: number | null) => void;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const shown =
    raw ?? (valueCents == null ? '' : formatMoney(valueCents).replace(/\s?€$/, '').trim());

  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={shown}
            placeholder={placeholder}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(e) => {
              setRaw(e.target.value);
              onValueChange(parseMoneyToCents(e.target.value));
            }}
            onBlur={() => setRaw(null)}
            className={controlClass(invalid, 'pr-9 tabular')}
          />
          <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-text-faint">
            €
          </span>
        </div>
      )}
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/*  Schalter und Umschalter                                            */
/* ------------------------------------------------------------------ */

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        'flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.97rem] font-medium text-text">{label}</span>
        {description && <span className="text-[0.82rem] text-text-dim">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={[
          'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-ok' : 'bg-surface-3',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </span>
    </label>
  );
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label?: string;
  className?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className = '',
}: SegmentedProps<T>) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  function selectWithKeyboard(index: number, key: string) {
    const last = options.length - 1;
    let next = index;
    if (key === 'ArrowRight' || key === 'ArrowDown') next = index === last ? 0 : index + 1;
    else if (key === 'ArrowLeft' || key === 'ArrowUp') next = index === 0 ? last : index - 1;
    else if (key === 'Home') next = 0;
    else if (key === 'End') next = last;
    else return false;

    onChange(options[next].value);
    buttonsRef.current[next]?.focus();
    return true;
  }

  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      {label && <span className="px-1 text-[0.85rem] font-medium text-text-dim">{label}</span>}
      <div
        role="radiogroup"
        aria-label={label ?? 'Auswahl'}
        className="flex gap-1 rounded-[var(--radius-field)] bg-surface-2 p-1"
      >
        {options.map((o, index) => {
          const active = o.value === value;
          return (
            <button
              ref={(node) => {
                buttonsRef.current[index] = node;
              }}
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(o.value)}
              onKeyDown={(event) => {
                if (selectWithKeyboard(index, event.key)) event.preventDefault();
              }}
              className={[
                'min-h-11 flex-1 rounded-[calc(var(--radius-field)-0.25rem)] px-2 text-[0.88rem] font-medium transition-colors',
                active
                  ? 'bg-surface text-text shadow-[var(--shadow-card)]'
                  : 'text-text-dim active:bg-surface-3',
              ].join(' ')}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Auswahl aus Kacheln — für Termintypen, Kostenarten usw. */
export function ChoiceGrid<T extends string>({
  value,
  onChange,
  options,
  label,
  columns = 2,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode; description?: string }[];
  label?: string;
  columns?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="px-1 text-[0.85rem] font-medium text-text-dim">{label}</span>}
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={[
                'flex min-h-16 flex-col items-start justify-center gap-1 rounded-[var(--radius-card)] border p-3 text-left transition-colors',
                active
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border bg-surface text-text active:bg-surface-2',
              ].join(' ')}
            >
              {o.icon}
              <span className="text-[0.9rem] font-medium">{o.label}</span>
              {o.description && (
                <span className="text-[0.78rem] text-text-dim">{o.description}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
