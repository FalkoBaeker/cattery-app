import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Cat, Kitten, Litter } from '../../types';
import { LitterArchive } from './LitterArchive';

const STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const cats: Cat[] = [
  { id: 'mira', callName: 'Mira', sex: 'female', breed: 'Russisch Blau', status: 'active', isOwn: true, ...STAMP },
  { id: 'luna', callName: 'Luna', sex: 'female', breed: 'Russisch Blau', status: 'active', isOwn: true, ...STAMP },
  { id: 'leo', callName: 'Leo', sex: 'male', breed: 'Russisch Blau', status: 'active', isOwn: false, ...STAMP },
];
const litters: Litter[] = [
  { id: 'mira-2026', motherId: 'mira', fatherId: 'leo', birthDate: '2026-03-01', matingDate: '2025-12-27', status: 'completed', ...STAMP },
  { id: 'mira-2025', motherId: 'mira', fatherId: 'leo', birthDate: '2025-03-01', status: 'completed', ...STAMP },
  { id: 'luna-2026', motherId: 'luna', fatherId: 'leo', matingDate: '2026-05-01', status: 'cancelled', ...STAMP },
  { id: 'unknown', motherId: 'missing', status: 'completed', ...STAMP },
  { id: 'active', motherId: 'mira', birthDate: '2026-08-01', status: 'born', ...STAMP },
];
const kittens: Kitten[] = [
  { id: 'kit-1', litterId: 'mira-2026', sex: 'female', collarColor: 'red', stillborn: false, saleStatus: 'sold', ...STAMP },
  { id: 'kit-2', litterId: 'mira-2026', sex: 'male', collarColor: 'blue', stillborn: true, saleStatus: 'deceased', ...STAMP },
];

describe('LitterArchive', () => {
  it('groups closed litters by mother by default and opens their full profiles', async () => {
    const onOpen = vi.fn();
    render(<LitterArchive cats={cats} litters={litters} kittens={kittens} onOpen={onOpen} />);

    expect(screen.getByRole('radio', { name: 'Katze' })).toBeChecked();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent))
      .toEqual(['Luna', 'Mira', 'Unbekannte Mutter']);
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByText('2 Kitten')).toBeInTheDocument();
    expect(screen.getByText('Abgebrochen')).toBeInTheDocument();
    expect(screen.getByText('Ohne Datumsangabe')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /Mira × Leo/ })[0]);
    expect(onOpen).toHaveBeenCalledWith('mira-2026');
  });

  it('combines parent and year filters, includes fathers, and keeps them when changing groups', async () => {
    render(<LitterArchive cats={cats} litters={litters} kittens={kittens} onOpen={vi.fn()} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Katze (Mutter oder Vater)' }), 'leo');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Jahr' }), '2026');

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Luna × Leo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mira × Leo/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Jahr' }));
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['2026']);
    expect(screen.getAllByRole('button')).toHaveLength(2);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Katze (Mutter oder Vater)' }), 'mira');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Mira × Leo/ })).toBeInTheDocument();
  });

  it('makes missing mothers and dates filterable and shows a no-results state', async () => {
    render(<LitterArchive cats={cats} litters={litters} kittens={kittens} onOpen={vi.fn()} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Katze (Mutter oder Vater)' }), 'unknown-mother');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Jahr' }), 'unknown-year');
    expect(screen.getByRole('button', { name: /Unbekannte Mutter/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Jahr' }), '2026');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Keine passenden Würfe')).toBeInTheDocument();
  });
});
