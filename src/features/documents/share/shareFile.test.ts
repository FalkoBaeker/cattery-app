/**
 * Prüft die Teilen-Weiche: Abbrechen ist kein Fehler, fehlendes
 * `navigator.share` führt in den Download, und Erfolg bleibt Erfolg.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { canShareFiles, shareOrDownload } from './shareFile';

function setNavigatorShare(share: unknown, canShare?: unknown) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true });
}

const blob = new Blob(['abc'], { type: 'image/jpeg' });

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  setNavigatorShare(undefined, undefined);
});

describe('canShareFiles', () => {
  it('verneint ohne navigator.share', () => {
    setNavigatorShare(undefined, undefined);
    expect(canShareFiles(new File([blob], 'a.jpg'))).toBe(false);
  });

  it('bejaht, wenn share da ist und canShare fehlt', () => {
    setNavigatorShare(() => Promise.resolve(), undefined);
    expect(canShareFiles(new File([blob], 'a.jpg'))).toBe(true);
  });

  it('folgt einem ablehnenden canShare', () => {
    setNavigatorShare(
      () => Promise.resolve(),
      () => false,
    );
    expect(canShareFiles(new File([blob], 'a.jpg'))).toBe(false);
  });

  it('verneint, wenn canShare wirft', () => {
    setNavigatorShare(
      () => Promise.resolve(),
      () => {
        throw new TypeError('kaputt');
      },
    );
    expect(canShareFiles(new File([blob], 'a.jpg'))).toBe(false);
  });
});

describe('shareOrDownload', () => {
  it('meldet Erfolg, wenn das Teilen-Blatt durchläuft', async () => {
    setNavigatorShare(vi.fn().mockResolvedValue(undefined), () => true);
    await expect(shareOrDownload(blob, 'bild.jpg')).resolves.toBe('shared');
  });

  it('wertet einen Abbruch nicht als Fehler und lädt nichts herunter', async () => {
    const abort = new Error('Abgebrochen');
    abort.name = 'AbortError';
    setNavigatorShare(vi.fn().mockRejectedValue(abort), () => true);
    await expect(shareOrDownload(blob, 'bild.jpg')).resolves.toBe('cancelled');
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('weicht bei anderen Fehlern auf den Download aus', async () => {
    setNavigatorShare(vi.fn().mockRejectedValue(new Error('kein Ziel')), () => true);
    await expect(shareOrDownload(blob, 'bild.jpg')).resolves.toBe('downloaded');
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it('lädt ohne navigator.share direkt herunter', async () => {
    setNavigatorShare(undefined, undefined);
    await expect(shareOrDownload(blob, 'bild.jpg')).resolves.toBe('downloaded');
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });
});
