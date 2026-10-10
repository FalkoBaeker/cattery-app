import { addDays, todayISO } from '../lib/date';
import { Button } from './Button';
import { TextInput } from './Field';

export interface EventDateFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}

export function EventDateField({
  value, onChange, label = 'Datum', min, max, disabled, required, error,
}: EventDateFieldProps) {
  const today = todayISO();
  const yesterday = addDays(today, -1);
  const unavailable = (date: string) => Boolean(disabled || (min && date < min) || (max && date > max));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <TextInput
        label={label}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={min}
        max={max}
        disabled={disabled}
        required={required}
        error={error}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" aria-pressed={value === today} disabled={unavailable(today)} onClick={() => onChange(today)}>Heute</Button>
        <Button size="sm" variant="ghost" aria-pressed={value === yesterday} disabled={unavailable(yesterday)} onClick={() => onChange(yesterday)}>Gestern</Button>
      </div>
    </div>
  );
}

export function EventDateTimeField({
  value, onChange, label = 'Datum', min, max, disabled, required, error,
}: EventDateFieldProps) {
  const [date = '', time = ''] = value.split('T');
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
      <EventDateField
        label={label}
        value={date}
        onChange={(next) => onChange(next ? `${next}T${time || '12:00'}` : '')}
        min={min?.slice(0, 10)}
        max={max?.slice(0, 10)}
        disabled={disabled}
        required={required}
        error={error}
      />
      <TextInput label="Uhrzeit" type="time" value={time} disabled={disabled} onChange={(event) => onChange(`${date || todayISO()}T${event.target.value}`)} />
    </div>
  );
}
