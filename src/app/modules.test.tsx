import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';

import { db, wipeDatabase } from '../db/db';
import { DEFAULT_SETTINGS } from '../types';
import { ModuleGuard } from './ModuleGuard';
import { TabBar } from './TabBar';

beforeEach(async () => {
  await wipeDatabase();
});

describe('ausgeschaltete Bereiche', () => {
  it('verschwinden aus der Hauptnavigation', async () => {
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      modules: {
        ...DEFAULT_SETTINGS.modules,
        cats: false,
        litters: false,
        waitlist: false,
        appointments: true,
      },
    });
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <TabBar />,
        },
      ],
      { initialEntries: ['/'] },
    );

    render(<RouterProvider router={router} />);

    // „Kalender" erscheint erst, nachdem die gespeicherten Einstellungen
    // geladen wurden; damit prüfen die folgenden Erwartungen den echten Stand.
    expect(await screen.findByRole('link', { name: /Kalender/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Zucht/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Warteliste/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Heute/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mehr/ })).toBeInTheDocument();
  });

  it('leitet auch alte Direktlinks aus einem ausgeschalteten Bereich heraus', async () => {
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      modules: { ...DEFAULT_SETTINGS.modules, waitlist: false },
    });
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <p>Heute sichtbar</p>,
        },
        {
          path: '/warteliste',
          element: (
            <ModuleGuard modules={['waitlist']}>
              <p>Warteliste sichtbar</p>
            </ModuleGuard>
          ),
        },
      ],
      { initialEntries: ['/warteliste'] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText('Heute sichtbar')).toBeInTheDocument();
    expect(screen.queryByText('Warteliste sichtbar')).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('lässt einen eingeschalteten Direktlink unverändert passieren', async () => {
    await db.settings.put(DEFAULT_SETTINGS);
    const router = createMemoryRouter(
      [
        {
          path: '/warteliste',
          element: (
            <ModuleGuard modules={['waitlist']}>
              <p>Warteliste sichtbar</p>
            </ModuleGuard>
          ),
        },
      ],
      { initialEntries: ['/warteliste'] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText('Warteliste sichtbar')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/warteliste');
  });
});
