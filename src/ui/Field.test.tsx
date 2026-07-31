import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NumberInput, Segmented } from './Field';

function TestSegmented() {
  const [value, setValue] = useState('a');
  return (
    <Segmented
      label="Testauswahl"
      value={value}
      onChange={setValue}
      options={[
        { value: 'a', label: 'Erste' },
        { value: 'b', label: 'Zweite' },
        { value: 'c', label: 'Dritte' },
      ]}
    />
  );
}

describe('Segmented', () => {
  it('verhält sich wie eine Radiogruppe mit wanderndem Tastaturfokus', async () => {
    const user = userEvent.setup();
    render(<TestSegmented />);

    const first = screen.getByRole('radio', { name: 'Erste' });
    const second = screen.getByRole('radio', { name: 'Zweite' });
    const third = screen.getByRole('radio', { name: 'Dritte' });

    expect(first).toHaveAttribute('aria-checked', 'true');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');

    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('aria-checked', 'true');
    expect(second).toHaveAttribute('tabindex', '0');

    await user.keyboard('{End}');
    expect(third).toHaveFocus();
    expect(third).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{ArrowRight}');
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('aria-checked', 'true');
  });
});

describe('NumberInput', () => {
  it('setzt die Containerklasse am Feldrahmen statt am DOM-Eingabefeld', () => {
    render(
      <NumberInput
        label="Anzahl"
        value={2}
        onValueChange={() => undefined}
        containerClassName="grow"
      />,
    );

    const input = screen.getByLabelText('Anzahl');
    expect(input.parentElement?.parentElement).toHaveClass('grow');
    expect(input).not.toHaveAttribute('containerclassname');
  });
});
