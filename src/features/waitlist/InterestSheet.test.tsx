import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db, wipeDatabase } from '../../db/db';
import { ToastProvider } from '../../ui';
import { InterestSheet } from './InterestSheet';

beforeEach(async () => {
  await wipeDatabase();
});

describe('InterestSheet', () => {
  it('erfasst eine individuelle Folge aus mehreren Kittenwünschen', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <InterestSheet open onClose={vi.fn()} />
      </ToastProvider>,
    );

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Familie Mehr');
    await user.click(screen.getByRole('radio', { name: 'Kater' }));
    await user.click(screen.getByRole('button', { name: 'Weiteres Kitten gewünscht' }));
    await user.click(screen.getAllByRole('radio', { name: 'Katze' })[1]);
    await user.click(screen.getByRole('button', { name: 'Weiteres Kitten gewünscht' }));
    await user.click(screen.getAllByRole('radio', { name: 'Kater' })[2]);
    await user.click(screen.getByRole('button', { name: 'Sichern' }));

    await waitFor(async () => {
      const saved = await db.interests.toArray();
      expect(saved).toHaveLength(1);
      expect(saved[0].wishSex).toBe('male');
      expect(saved[0].wishSexes).toEqual(['male', 'female', 'male']);
    });
  });
});
