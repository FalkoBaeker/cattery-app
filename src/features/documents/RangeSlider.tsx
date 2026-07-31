/**
 * Schieberegler.
 *
 * In `src/ui` gibt es keinen — laut Arbeitsregeln entsteht ein fehlender
 * Baustein zunächst im eigenen Modulordner und wandert erst nach `src/ui`,
 * wenn ihn ein zweites Modul braucht. Farben ausschließlich über die
 * semantischen Marken, damit der dunkle Modus mitzieht.
 */

import { useId } from 'react';

export interface RangeSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Anzeige rechts neben der Beschriftung. */
  format?: (value: number) => string;
  /** Doppeltippen auf die Beschriftung setzt zurück. */
  onReset?: () => void;
  disabled?: boolean;
}

export function RangeSlider({
  label,
  value,
  onChange,
  min = -100,
  max = 100,
  step = 1,
  format,
  onReset,
  disabled,
}: RangeSliderProps) {
  const id = useId();
  const shown = format ? format(value) : String(Math.round(value));

  return (
    <div className={['flex flex-col gap-1', disabled ? 'opacity-50' : ''].join(' ')}>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <label htmlFor={id} className="text-[0.85rem] font-medium text-text-dim">
          {label}
        </label>
        <span className="flex items-center gap-2">
          <span className="text-[0.85rem] text-text-dim tabular">{shown}</span>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={disabled}
              className="min-h-11 px-1 text-[0.8rem] font-medium text-accent"
            >
              zurücksetzen
            </button>
          )}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-slider h-11 w-full bg-transparent"
      />
      <style>{`
        .range-slider { -webkit-appearance: none; appearance: none; }
        .range-slider::-webkit-slider-runnable-track {
          height: 6px; border-radius: 999px; background: var(--color-surface-3);
        }
        .range-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 28px; height: 28px; margin-top: -11px;
          border-radius: 999px; background: var(--color-surface);
          border: 1px solid var(--color-border-strong);
          box-shadow: var(--shadow-raised);
        }
        .range-slider::-moz-range-track {
          height: 6px; border-radius: 999px; background: var(--color-surface-3);
        }
        .range-slider::-moz-range-thumb {
          width: 26px; height: 26px; border-radius: 999px;
          background: var(--color-surface); border: 1px solid var(--color-border-strong);
        }
      `}</style>
    </div>
  );
}
