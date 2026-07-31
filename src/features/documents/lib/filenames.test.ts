import { describe, it, expect } from 'vitest';
import { buildPageFileName, buildShareFileName, extensionFor, slugify } from './filenames';

describe('slugify', () => {
  it('macht aus einem Namen einen Dateinamen', () => {
    expect(slugify('Familie Schulz')).toBe('familie-schulz');
  });

  it('schreibt Umlaute aus', () => {
    expect(slugify('Müller-Schmidt')).toBe('mueller-schmidt');
    expect(slugify('Größe Straße')).toBe('groesse-strasse');
    expect(slugify('Öl Ähre Über')).toBe('oel-aehre-ueber');
  });

  it('entfernt Betonungszeichen', () => {
    expect(slugify('José Renée')).toBe('jose-renee');
  });

  it('wirft Sonderzeichen weg', () => {
    expect(slugify('Impfpass (2026) — Seite #1')).toBe('impfpass-2026-seite-1');
  });

  it('gibt bei leerer Eingabe einen leeren String zurück', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('!!!')).toBe('');
  });

  it('kürzt sehr lange Namen an der Wortgrenze', () => {
    const long = 'Sehr langer Zuchtname von der Grossen Blauen Wiese am Berg';
    const out = slugify(long, 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith('-')).toBe(false);
    expect(long.toLowerCase().replace(/\s+/g, '-').startsWith(out)).toBe(true);
  });

  it('kürzt auch ein einziges überlanges Wort', () => {
    const out = slugify('Donaudampfschifffahrtsgesellschaftskapitaenspatent', 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('extensionFor', () => {
  it('kennt die üblichen Typen', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('application/pdf')).toBe('pdf');
  });

  it('fällt bei Unbekanntem auf bin zurück', () => {
    expect(extensionFor('irgendwas/komisch')).toBe('bin');
    expect(extensionFor(undefined)).toBe('bin');
  });
});

describe('buildShareFileName', () => {
  it('baut Name und Tag zusammen', () => {
    expect(buildShareFileName({ kittenName: 'Mira', ageDays: 24 })).toBe('kitten-mira-tag-24.jpg');
  });

  it('benutzt die Halsbandfarbe, wenn es keinen Rufnamen gibt', () => {
    expect(buildShareFileName({ kittenName: 'Rot', ageDays: 3 })).toBe('kitten-rot-tag-3.jpg');
  });

  it('nimmt das Datum, wenn das Geburtsdatum fehlt', () => {
    expect(buildShareFileName({ kittenName: 'Mira', ageDays: null, date: '2026-07-31' })).toBe(
      'kitten-mira-2026-07-31.jpg',
    );
  });

  it('kommt ohne Namen aus', () => {
    expect(buildShareFileName({ kittenName: '', ageDays: 0 })).toBe('kitten-tag-0.jpg');
    expect(buildShareFileName({})).toBe('kitten.jpg');
  });

  it('verträgt Umlaute und lange Namen', () => {
    const out = buildShareFileName({ kittenName: 'Mürrische Mäusejägerin vom Blauen Berg', ageDays: 61 });
    expect(out.endsWith('-tag-61.jpg')).toBe(true);
    expect(out).toMatch(/^[a-z0-9.-]+$/);
  });

  it('ignoriert ein unsinniges Alter', () => {
    expect(buildShareFileName({ kittenName: 'Mira', ageDays: -5, date: '2026-01-01' })).toBe(
      'kitten-mira-2026-01-01.jpg',
    );
  });
});

describe('buildPageFileName', () => {
  it('lässt bei einer einzigen Seite die Nummer weg', () => {
    expect(buildPageFileName('Impfpass Mira', 0, 1)).toBe('impfpass-mira.jpg');
  });

  it('nummeriert mehrere Seiten', () => {
    expect(buildPageFileName('Impfpass Mira', 1, 3)).toBe('impfpass-mira-seite-2-von-3.jpg');
  });

  it('bleibt bei falschem Index im gültigen Bereich', () => {
    expect(buildPageFileName('Vertrag', -4, 2)).toBe('vertrag-seite-1-von-2.jpg');
    expect(buildPageFileName('Vertrag', 99, 2)).toBe('vertrag-seite-2-von-2.jpg');
  });

  it('nimmt bei fehlendem Titel einen Ersatznamen', () => {
    expect(buildPageFileName('', 0, 1)).toBe('dokument.jpg');
  });

  it('richtet sich nach dem MIME-Typ', () => {
    expect(buildPageFileName('Stammbaum', 0, 1, 'application/pdf')).toBe('stammbaum.pdf');
  });
});
