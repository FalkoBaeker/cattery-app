/**
 * Heilt den kurzen Mischzustand während eines PWA-Updates: Eine bereits
 * offene Startdatei kann noch einen alten Lazy-Chunk anfordern, nachdem der
 * neue Service Worker dessen Cache ersetzt hat.
 */

export const PRELOAD_RELOAD_KEY = 'cattery:preload-reload-at';
const RELOAD_GUARD_MS = 10_000;

export function recoverFromPreloadError(
  event: Event,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  reload: () => void,
  now = Date.now(),
): boolean {
  event.preventDefault();

  let last = 0;
  try {
    last = Number(storage.getItem(PRELOAD_RELOAD_KEY) ?? 0);
  } catch {
    // Ohne Session-Speicher bleibt das einmalige Neuladen trotzdem der
    // sinnvollste Rettungsweg.
  }
  if (Number.isFinite(last) && now - last < RELOAD_GUARD_MS) return false;

  try {
    storage.setItem(PRELOAD_RELOAD_KEY, String(now));
  } catch {
    // Siehe oben: Das Neuladen selbst funktioniert auch ohne Speicher.
  }
  reload();
  return true;
}
