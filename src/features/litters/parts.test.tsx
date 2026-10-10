import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CollarPicker, DateInput } from './parts';

describe('DateInput', () => {
  it('verknüpft die sichtbare Beschriftung mit dem Datumsfeld', () => {
    const onChange = vi.fn();
    render(<DateInput label="Geburtsdatum" value="2026-07-20" onChange={onChange} />);

    const input = screen.getByLabelText('Geburtsdatum');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveValue('2026-07-20');

    fireEvent.change(input, { target: { value: '2026-07-21' } });
    expect(onChange).toHaveBeenCalledWith('2026-07-21');
  });

  it('meldet ein geleertes Datum als nicht gesetzt', () => {
    const onChange = vi.fn();
    render(<DateInput label="Deckdatum" value="2026-05-16" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Deckdatum'), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe('CollarPicker', () => {
  it('bietet Grau als eigenständige Halsbandfarbe an', () => {
    const onChange = vi.fn();
    render(<CollarPicker value="red" onChange={onChange} />);
    const gray = screen.getByRole('radio', { name: 'Grau' });
    expect(gray).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(gray);
    expect(onChange).toHaveBeenCalledWith('gray');
    expect(screen.getByRole('radio', { name: 'ohne' })).toBeInTheDocument();
  });
});
