import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { db, wipeDatabase } from '../../db/db';
import { WeightBackfillScreen } from './WeightBackfillScreen';

describe('WeightBackfillScreen compatibility', () => {
  it('leitet alte Kitten-Lesezeichen zum gemeinsamen Wiegebildschirm des Wurfes um', async () => {
    await wipeDatabase();
    await db.kittens.put({ id: 'k1', litterId: 'l1', collarColor: 'red', sex: 'unknown', stillborn: false, saleStatus: 'available', createdAt: '2026-03-03T06:00:00Z', updatedAt: '2026-03-03T06:00:00Z' });
    render(<MemoryRouter initialEntries={['/zucht/kitten/k1/gewicht-nachtragen']}><Routes>
      <Route path="/zucht/kitten/:kittenId/gewicht-nachtragen" element={<WeightBackfillScreen />} />
      <Route path="/wiegen/:litterId" element={<p>Gemeinsames Wiegen</p>} />
    </Routes></MemoryRouter>);
    expect(await screen.findByText('Gemeinsames Wiegen')).toBeInTheDocument();
  });
});
