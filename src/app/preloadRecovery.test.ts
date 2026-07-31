import { describe, expect, it, vi } from 'vitest';
import { PRELOAD_RELOAD_KEY, recoverFromPreloadError } from './preloadRecovery';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(PRELOAD_RELOAD_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    value: () => values.get(PRELOAD_RELOAD_KEY),
  };
}

describe('recoverFromPreloadError', () => {
  it('verhindert die Fehlerseite und lädt den zusammengehörigen PWA-Stand neu', () => {
    const event = { preventDefault: vi.fn() } as unknown as Event;
    const storage = memoryStorage();
    const reload = vi.fn();

    expect(recoverFromPreloadError(event, storage, reload, 20_000)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(storage.value()).toBe('20000');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('verhindert eine schnelle Reload-Schleife und erlaubt später einen neuen Updatefall', () => {
    const storage = memoryStorage('20000');
    const reload = vi.fn();

    expect(
      recoverFromPreloadError(
        { preventDefault: vi.fn() } as unknown as Event,
        storage,
        reload,
        25_000,
      ),
    ).toBe(false);
    expect(reload).not.toHaveBeenCalled();

    expect(
      recoverFromPreloadError(
        { preventDefault: vi.fn() } as unknown as Event,
        storage,
        reload,
        31_000,
      ),
    ).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });
});
