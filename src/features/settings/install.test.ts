import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INSTALL_HINT_KEY,
  dismissInstallHint,
  isInstallHintDismissed,
  isStandalone,
  resetInstallHint,
  shouldOfferInstall,
} from './install';

/** Tut so, als liefe die App vom Home-Bildschirm (oder eben nicht). */
function setDisplayMode(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  localStorage.clear();
  setDisplayMode(false);
  delete (window.navigator as Navigator & { standalone?: boolean }).standalone;
});

afterEach(() => {
  localStorage.clear();
});

describe('isStandalone', () => {
  it('erkennt den Browser', () => {
    expect(isStandalone()).toBe(false);
  });

  it('erkennt die App vom Home-Bildschirm über display-mode', () => {
    setDisplayMode(true);
    expect(isStandalone()).toBe(true);
  });

  it('erkennt das alte Safari-Merkmal navigator.standalone', () => {
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      configurable: true,
    });
    expect(isStandalone()).toBe(true);
  });

  it('stürzt nicht ab, wenn matchMedia streikt', () => {
    window.matchMedia = vi.fn().mockImplementation(() => {
      throw new Error('nicht unterstützt');
    });
    expect(isStandalone()).toBe(false);
  });
});

describe('Weggeklickter Hinweis', () => {
  it('ist am Anfang nicht weggeklickt', () => {
    expect(isInstallHintDismissed()).toBe(false);
  });

  it('bleibt weggeklickt', () => {
    dismissInstallHint();
    expect(localStorage.getItem(INSTALL_HINT_KEY)).toBe('1');
    expect(isInstallHintDismissed()).toBe(true);
  });

  it('lässt sich zurücksetzen', () => {
    dismissInstallHint();
    resetInstallHint();
    expect(isInstallHintDismissed()).toBe(false);
  });
});

describe('shouldOfferInstall', () => {
  it('bietet die Anleitung im Browser an', () => {
    expect(shouldOfferInstall()).toBe(true);
  });

  it('schweigt, wenn die App schon installiert ist', () => {
    setDisplayMode(true);
    expect(shouldOfferInstall()).toBe(false);
  });

  it('schweigt, wenn der Hinweis einmal weggeklickt wurde', () => {
    dismissInstallHint();
    expect(shouldOfferInstall()).toBe(false);
  });
});
