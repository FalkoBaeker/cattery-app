import { describe, expect, it } from 'vitest';
import type { Interest, InterestStatus, WishSex } from '../../types';
import {
  broadcastProgress,
  buildMailtoUrl,
  buildTelUrl,
  buildWhatsAppUrl,
  daysUntilPurge,
  duePurgeIds,
  fillTemplate,
  filterInterests,
  formatBroadcastProgress,
  formatPurgeHint,
  isPurgeDue,
  lastContactByInterest,
  markOpen,
  markSent,
  markSkipped,
  matchesQuery,
  matchesSex,
  moveAndResequence,
  moveItem,
  nextOpenRecipient,
  nextSortIndex,
  purgeDate,
  resequence,
  shortNote,
  sortWaitlist,
  type BroadcastRun,
  type Sortable,
} from './order';

/* ------------------------------------------------------------------ */
/*  Hilfen                                                             */
/* ------------------------------------------------------------------ */

function row(id: string, sortIndex: number, createdAt?: string): Sortable & { createdAt?: string } {
  return { id, sortIndex, createdAt };
}

function interest(partial: Partial<Interest> & { id: string; name: string }): Interest {
  return {
    wishSex: 'any',
    status: 'new',
    sortIndex: 0,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...partial,
  } as Interest;
}

/* ================================================================== */
/*  Reihenfolge                                                        */
/* ================================================================== */

describe('sortWaitlist', () => {
  it('sortiert nach sortIndex', () => {
    const list = sortWaitlist([row('c', 2), row('a', 0), row('b', 1)]);
    expect(list.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('entscheidet bei gleichen Indizes in Altdaten stabil nach Anlagezeit', () => {
    const list = sortWaitlist([
      row('spaet', 0, '2026-03-02T10:00:00.000Z'),
      row('frueh', 0, '2026-03-01T10:00:00.000Z'),
    ]);
    expect(list.map((r) => r.id)).toEqual(['frueh', 'spaet']);
  });

  it('entscheidet bei gleicher Anlagezeit nach Kennung — nie zufällig', () => {
    const input = [row('b', 0, '2026-03-01T10:00:00.000Z'), row('a', 0, '2026-03-01T10:00:00.000Z')];
    expect(sortWaitlist(input).map((r) => r.id)).toEqual(['a', 'b']);
    expect(sortWaitlist([...input].reverse()).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('schiebt kaputte Indizes ans Ende statt abzustürzen', () => {
    const list = sortWaitlist([
      row('kaputt', Number.NaN),
      row('erst', 0),
      row('zweit', 1),
    ]);
    expect(list.map((r) => r.id)).toEqual(['erst', 'zweit', 'kaputt']);
  });

  it('verändert die Eingabeliste nicht', () => {
    const input = [row('b', 1), row('a', 0)];
    sortWaitlist(input);
    expect(input.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('kommt mit leerer Liste zurecht', () => {
    expect(sortWaitlist([])).toEqual([]);
  });
});

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd'];

  it('verschiebt nach unten', () => {
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('verschiebt nach oben', () => {
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('erstes Element nach oben ändert nichts', () => {
    expect(moveItem(list, 0, 0)).toEqual(list);
    expect(moveItem(list, 0, -3)).toEqual(list);
  });

  it('letztes Element nach unten ändert nichts', () => {
    expect(moveItem(list, 3, 3)).toEqual(list);
    expect(moveItem(list, 3, 99)).toEqual(list);
  });

  it('einzelnes Element bleibt einzeln', () => {
    expect(moveItem(['a'], 0, 5)).toEqual(['a']);
  });

  it('leere Liste bleibt leer', () => {
    expect(moveItem([], 0, 1)).toEqual([]);
  });

  it('ignoriert unsinnige Startpositionen', () => {
    expect(moveItem(list, 9, 0)).toEqual(list);
    expect(moveItem(list, -1, 0)).toEqual(list);
  });
});

describe('resequence', () => {
  it('meldet nichts, wenn die Indizes schon lückenlos sind', () => {
    expect(resequence([row('a', 0), row('b', 1), row('c', 2)])).toEqual([]);
  });

  it('schließt Lücken', () => {
    expect(resequence([row('a', 5), row('b', 12)])).toEqual([
      { id: 'a', sortIndex: 0 },
      { id: 'b', sortIndex: 1 },
    ]);
  });

  it('repariert doppelte Indizes aus Altdaten', () => {
    expect(resequence([row('a', 0), row('b', 0), row('c', 0)])).toEqual([
      { id: 'b', sortIndex: 1 },
      { id: 'c', sortIndex: 2 },
    ]);
  });
});

describe('moveAndResequence', () => {
  const list = [row('a', 0), row('b', 1), row('c', 2), row('d', 3)];

  it('vergibt nach dem Verschieben lückenlose Werte', () => {
    expect(moveAndResequence(list, 0, 2)).toEqual([
      { id: 'b', sortIndex: 0 },
      { id: 'c', sortIndex: 1 },
      { id: 'a', sortIndex: 2 },
    ]);
  });

  it('schreibt nur, was sich wirklich ändert', () => {
    // d nach oben: a, b, c rutschen je eine Position nach unten.
    expect(moveAndResequence(list, 3, 0)).toEqual([
      { id: 'd', sortIndex: 0 },
      { id: 'a', sortIndex: 1 },
      { id: 'b', sortIndex: 2 },
      { id: 'c', sortIndex: 3 },
    ]);
  });

  it('erstes Element nach oben: keine Änderung', () => {
    expect(moveAndResequence(list, 0, 0)).toEqual([]);
  });

  it('letztes Element nach unten: keine Änderung', () => {
    expect(moveAndResequence(list, 3, 3)).toEqual([]);
  });

  it('einzelnes Element mit falschem Index wird trotzdem begradigt', () => {
    expect(moveAndResequence([row('a', 7)], 0, 0)).toEqual([{ id: 'a', sortIndex: 0 }]);
  });

  it('leere Liste liefert nichts', () => {
    expect(moveAndResequence([], 0, 1)).toEqual([]);
  });

  it('räumt gleiche Indizes beim Verschieben mit auf', () => {
    const alt = [row('a', 3), row('b', 3), row('c', 3)];
    expect(moveAndResequence(alt, 2, 0)).toEqual([
      { id: 'c', sortIndex: 0 },
      { id: 'a', sortIndex: 1 },
      { id: 'b', sortIndex: 2 },
    ]);
  });
});

describe('nextSortIndex', () => {
  it('hängt neue Einträge unten an', () => {
    expect(nextSortIndex([row('a', 0), row('b', 4)])).toBe(5);
  });

  it('startet bei leerer Liste mit 0', () => {
    expect(nextSortIndex([])).toBe(0);
  });

  it('ignoriert kaputte Werte', () => {
    expect(nextSortIndex([row('a', Number.NaN), row('b', 2)])).toBe(3);
  });
});

/* ================================================================== */
/*  Papierkorb                                                         */
/* ================================================================== */

describe('Papierkorb-Frist', () => {
  it('rechnet 30 Tage ab dem Löschtag', () => {
    expect(purgeDate('2026-03-01T12:00:00.000Z')).toBe('2026-03-31');
  });

  it('übersteht den Monatswechsel (31.01. + 30 Tage)', () => {
    expect(purgeDate('2026-01-31T12:00:00.000Z')).toBe('2026-03-02');
  });

  it('rechnet im Schaltjahr den 29. Februar mit', () => {
    expect(purgeDate('2024-01-31T12:00:00.000Z')).toBe('2024-03-01');
  });

  it('übersteht den Wechsel auf Sommerzeit', () => {
    // 29.03.2026 ist der Sommerzeitbeginn in Deutschland.
    expect(purgeDate('2026-03-15T12:00:00.000Z')).toBe('2026-04-14');
  });

  it('übersteht den Jahreswechsel', () => {
    expect(purgeDate('2026-12-20T12:00:00.000Z')).toBe('2027-01-19');
  });

  it('zählt die verbleibenden Tage', () => {
    expect(daysUntilPurge('2026-03-01T12:00:00.000Z', '2026-03-01')).toBe(30);
    expect(daysUntilPurge('2026-03-01T12:00:00.000Z', '2026-03-20')).toBe(11);
    expect(daysUntilPurge('2026-03-01T12:00:00.000Z', '2026-03-31')).toBe(0);
  });

  it('ist am 30. Tag noch nicht fällig, am Stichtag schon', () => {
    expect(isPurgeDue('2026-03-01T12:00:00.000Z', '2026-03-30')).toBe(false);
    expect(isPurgeDue('2026-03-01T12:00:00.000Z', '2026-03-31')).toBe(true);
    expect(isPurgeDue('2026-03-01T12:00:00.000Z', '2026-04-05')).toBe(true);
  });

  it('formuliert den Hinweis deutsch und in Einzahl', () => {
    expect(formatPurgeHint('2026-03-01T12:00:00.000Z', '2026-03-20')).toBe(
      'wird in 11 Tagen endgültig gelöscht',
    );
    expect(formatPurgeHint('2026-03-01T12:00:00.000Z', '2026-03-30')).toBe(
      'wird morgen endgültig gelöscht',
    );
    expect(formatPurgeHint('2026-03-01T12:00:00.000Z', '2026-04-01')).toBe(
      'wird jetzt endgültig gelöscht',
    );
  });

  it('findet genau die fälligen Einträge', () => {
    const items = [
      { id: 'frisch', deletedAt: '2026-03-25T12:00:00.000Z' },
      { id: 'faellig', deletedAt: '2026-02-01T12:00:00.000Z' },
      { id: 'aktiv', deletedAt: undefined },
    ];
    expect(duePurgeIds(items, '2026-03-31')).toEqual(['faellig']);
  });

  it('liefert bei leerer Liste nichts', () => {
    expect(duePurgeIds([], '2026-03-31')).toEqual([]);
  });
});

/* ================================================================== */
/*  Verweise                                                           */
/* ================================================================== */

describe('buildWhatsAppUrl', () => {
  it('wandelt die deutsche 0 in 49 um', () => {
    expect(buildWhatsAppUrl('0170 1234567')).toBe('https://wa.me/491701234567');
  });

  it('entfernt die in internationaler Schreibweise eingeklammerte deutsche 0', () => {
    expect(buildWhatsAppUrl('+49 (0)171 1234567')).toBe('https://wa.me/491711234567');
  });

  it('kodiert Umlaute als UTF-8', () => {
    expect(buildWhatsAppUrl('+49 170 1234567', 'Grüße, Jörg!')).toBe(
      'https://wa.me/491701234567?text=Gr%C3%BC%C3%9Fe%2C%20J%C3%B6rg!',
    );
  });

  it('kodiert Zeilenumbrüche', () => {
    const url = buildWhatsAppUrl('01701234567', 'Hallo Anna,\n\nbei uns sind Kitten da.');
    expect(url).toBe(
      'https://wa.me/491701234567?text=Hallo%20Anna%2C%0A%0Abei%20uns%20sind%20Kitten%20da.',
    );
  });

  it('lässt den Text weg, wenn er leer ist', () => {
    expect(buildWhatsAppUrl('01701234567', '   ')).toBe('https://wa.me/491701234567');
  });

  it('liefert nichts ohne brauchbare Nummer', () => {
    expect(buildWhatsAppUrl('', 'Hallo')).toBeNull();
    expect(buildWhatsAppUrl(undefined, 'Hallo')).toBeNull();
    expect(buildWhatsAppUrl('123', 'Hallo')).toBeNull();
    expect(buildWhatsAppUrl('bitte anrufen')).toBeNull();
  });
});

describe('buildTelUrl', () => {
  it('schreibt international', () => {
    expect(buildTelUrl('0170 123 4567')).toBe('tel:+491701234567');
    expect(buildTelUrl('+43 664 1234567')).toBe('tel:+436641234567');
    expect(buildTelUrl('0049 (0)171 1234567')).toBe('tel:+491711234567');
  });

  it('behält kurze Nummern unverändert bei', () => {
    expect(buildTelUrl('110')).toBe('tel:110');
  });

  it('liefert nichts ohne Nummer', () => {
    expect(buildTelUrl('')).toBeNull();
    expect(buildTelUrl(undefined)).toBeNull();
    expect(buildTelUrl('   ')).toBeNull();
  });
});

describe('buildMailtoUrl', () => {
  it('baut den einfachen Verweis', () => {
    expect(buildMailtoUrl('anna@example.de')).toBe('mailto:anna@example.de');
  });

  it('hängt Betreff und Text kodiert an', () => {
    expect(buildMailtoUrl('anna@example.de', 'Kitten für Sie', 'Grüße')).toBe(
      'mailto:anna@example.de?subject=Kitten%20f%C3%BCr%20Sie&body=Gr%C3%BC%C3%9Fe',
    );
  });

  it('weist unbrauchbare Adressen ab', () => {
    expect(buildMailtoUrl('anna')).toBeNull();
    expect(buildMailtoUrl('anna@example')).toBeNull();
    expect(buildMailtoUrl('')).toBeNull();
    expect(buildMailtoUrl(undefined)).toBeNull();
  });
});

describe('fillTemplate', () => {
  it('ersetzt {name}', () => {
    expect(fillTemplate('Hallo {name}, …', 'Anna')).toBe('Hallo Anna, …');
  });

  it('ersetzt jedes Vorkommen, auch mit Leerzeichen und groß geschrieben', () => {
    expect(fillTemplate('{name}, {Name} und { name }', 'Anna')).toBe('Anna, Anna und Anna');
  });

  it('behandelt Ersetzungsmuster im Namen als reinen Text', () => {
    expect(fillTemplate('Hallo {name}!', 'A$&B')).toBe('Hallo A$&B!');
  });

  it('kommt mit sehr langen Namen zurecht', () => {
    const long = 'Maximiliane-Charlotte von und zu Hohenlohe-Langenburg'.repeat(3);
    expect(fillTemplate('Hallo {name}', long)).toBe(`Hallo ${long}`);
  });

  it('lässt Vorlagen ohne Platzhalter unverändert', () => {
    expect(fillTemplate('Hallo zusammen', 'Anna')).toBe('Hallo zusammen');
  });
});

/* ================================================================== */
/*  Sammelnachricht                                                    */
/* ================================================================== */

function run(): BroadcastRun {
  return {
    startedAt: '2026-03-01T10:00:00.000Z',
    text: 'Hallo {name}',
    recipients: [
      { interestId: 'a', name: 'Anna', phone: '0170 1111111' },
      { interestId: 'b', name: 'Bernd', phone: '0170 2222222' },
      { interestId: 'c', name: 'Clara' },
    ],
  };
}

describe('Sammelnachricht', () => {
  it('zählt am Anfang alles als offen', () => {
    expect(broadcastProgress(run())).toEqual({
      total: 3,
      sent: 0,
      skipped: 0,
      open: 3,
      finished: false,
    });
  });

  it('nennt den Nächsten in der Reihenfolge', () => {
    expect(nextOpenRecipient(run())?.name).toBe('Anna');
  });

  it('geht nach dem Verschicken zum Nächsten weiter', () => {
    const after = markSent(run(), 'a', '2026-03-01T10:01:00.000Z');
    expect(nextOpenRecipient(after)?.name).toBe('Bernd');
    expect(broadcastProgress(after)).toMatchObject({ sent: 1, open: 2, finished: false });
  });

  it('überspringt, ohne zu verschicken', () => {
    const after = markSkipped(run(), 'c', '2026-03-01T10:02:00.000Z');
    expect(broadcastProgress(after)).toMatchObject({ sent: 0, skipped: 1, open: 2 });
  });

  it('ist fertig, wenn nichts mehr offen ist', () => {
    let r = run();
    r = markSent(r, 'a', '2026-03-01T10:01:00.000Z');
    r = markSent(r, 'b', '2026-03-01T10:02:00.000Z');
    r = markSkipped(r, 'c', '2026-03-01T10:03:00.000Z');
    expect(broadcastProgress(r).finished).toBe(true);
    expect(nextOpenRecipient(r)).toBeUndefined();
  });

  it('kann einen Empfänger wieder öffnen', () => {
    const sent = markSent(run(), 'a', '2026-03-01T10:01:00.000Z');
    const open = markOpen(sent, 'a');
    expect(nextOpenRecipient(open)?.interestId).toBe('a');
  });

  it('überspringt nichts, was schon verschickt wurde', () => {
    const sent = markSent(run(), 'a', '2026-03-01T10:01:00.000Z');
    const after = markSkipped(sent, 'a', '2026-03-01T10:05:00.000Z');
    expect(after.recipients[0].sentAt).toBe('2026-03-01T10:01:00.000Z');
    expect(after.recipients[0].skippedAt).toBeUndefined();
  });

  it('verändert den übergebenen Vorgang nicht', () => {
    const original = run();
    markSent(original, 'a', '2026-03-01T10:01:00.000Z');
    expect(original.recipients[0].sentAt).toBeUndefined();
  });

  it('formuliert den Fortschritt deutsch', () => {
    let r = run();
    expect(formatBroadcastProgress(r)).toBe('0 von 3 verschickt');
    r = markSent(r, 'a', '2026-03-01T10:01:00.000Z');
    r = markSkipped(r, 'c', '2026-03-01T10:02:00.000Z');
    expect(formatBroadcastProgress(r)).toBe('1 von 3 verschickt, 1 übersprungen');
  });

  it('kommt mit einem einzigen Empfänger zurecht', () => {
    const single: BroadcastRun = {
      startedAt: '2026-03-01T10:00:00.000Z',
      text: 'Hallo {name}',
      recipients: [{ interestId: 'a', name: 'Anna', phone: '0170 1111111' }],
    };
    const after = markSent(single, 'a', '2026-03-01T10:01:00.000Z');
    expect(broadcastProgress(after).finished).toBe(true);
  });

  it('kommt mit leerer Empfängerliste zurecht', () => {
    const empty: BroadcastRun = { startedAt: '2026-03-01T10:00:00.000Z', text: '', recipients: [] };
    expect(broadcastProgress(empty)).toEqual({
      total: 0,
      sent: 0,
      skipped: 0,
      open: 0,
      finished: true,
    });
  });
});

/* ================================================================== */
/*  Suchen und Filtern                                                 */
/* ================================================================== */

describe('matchesQuery', () => {
  const anna = { name: 'Anna Müller', notes: 'Hat zwei Kinder, wohnt in Köln.', householdNote: '' };

  it('findet ohne Suchbegriff alles', () => {
    expect(matchesQuery(anna, '')).toBe(true);
    expect(matchesQuery(anna, '   ')).toBe(true);
  });

  it('sucht im Namen, unabhängig von Groß- und Kleinschreibung', () => {
    expect(matchesQuery(anna, 'müller')).toBe(true);
    expect(matchesQuery(anna, 'MÜLLER')).toBe(true);
  });

  it('sucht in den Notizen', () => {
    expect(matchesQuery(anna, 'köln')).toBe(true);
  });

  it('verlangt, dass alle Wörter vorkommen', () => {
    expect(matchesQuery(anna, 'anna köln')).toBe(true);
    expect(matchesQuery(anna, 'anna hamburg')).toBe(false);
  });

  it('kommt ohne Notizen aus', () => {
    expect(matchesQuery({ name: 'Bernd' }, 'bernd')).toBe(true);
    expect(matchesQuery({ name: 'Bernd' }, 'köln')).toBe(false);
  });
});

describe('matchesSex', () => {
  const cases: [WishSex, 'all' | WishSex, boolean][] = [
    ['male', 'all', true],
    ['male', 'male', true],
    ['male', 'female', false],
    ['female', 'female', true],
    ['any', 'male', true],
    ['any', 'female', true],
    ['any', 'any', true],
    ['male', 'any', false],
  ];
  it.each(cases)('Wunsch %s bei Filter %s -> %s', (wish, filter, expected) => {
    expect(matchesSex(wish, filter)).toBe(expected);
  });
});

describe('filterInterests', () => {
  const items: Interest[] = [
    interest({ id: 'a', name: 'Anna', wishSex: 'female', status: 'new', notes: 'Allergie' }),
    interest({ id: 'b', name: 'Bernd', wishSex: 'male', status: 'reserved' }),
    interest({ id: 'c', name: 'Clara', wishSex: 'any', status: 'contacted' }),
  ];

  it('lässt ohne Filter alles durch', () => {
    expect(filterInterests(items, { query: '', sex: 'all', status: 'all' })).toHaveLength(3);
  });

  it('filtert nach Status', () => {
    const found = filterInterests(items, {
      query: '',
      sex: 'all',
      status: 'reserved' as InterestStatus,
    });
    expect(found.map((i) => i.id)).toEqual(['b']);
  });

  it('kombiniert Geschlecht und Suche', () => {
    const found = filterInterests(items, { query: 'a', sex: 'female', status: 'all' });
    expect(found.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('behält die Reihenfolge bei', () => {
    const found = filterInterests(items, { query: '', sex: 'male', status: 'all' });
    expect(found.map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('liefert eine leere Liste, wenn nichts passt', () => {
    expect(filterInterests(items, { query: 'xyz', sex: 'all', status: 'all' })).toEqual([]);
  });
});

/* ================================================================== */
/*  Anzeige-Kleinkram                                                  */
/* ================================================================== */

describe('shortNote', () => {
  it('lässt kurze Notizen unverändert', () => {
    expect(shortNote('Kurz')).toBe('Kurz');
  });

  it('macht aus Zeilenumbrüchen Leerzeichen', () => {
    expect(shortNote('Zeile eins\nZeile zwei')).toBe('Zeile eins Zeile zwei');
  });

  it('kürzt lange Notizen mit Auslassungszeichen', () => {
    const result = shortNote('a'.repeat(200), 20);
    expect(result).toHaveLength(20);
    expect(result.endsWith('…')).toBe(true);
  });

  it('kommt ohne Notiz zurecht', () => {
    expect(shortNote(undefined)).toBe('');
  });
});

describe('lastContactByInterest', () => {
  it('findet je Interessent den jüngsten Eintrag, egal in welcher Reihenfolge', () => {
    const map = lastContactByInterest([
      { interestId: 'a', at: '2026-03-01T10:00:00.000Z' },
      { interestId: 'b', at: '2026-03-02T09:00:00.000Z' },
      { interestId: 'a', at: '2026-03-05T08:00:00.000Z' },
      { interestId: 'a', at: '2026-02-01T10:00:00.000Z' },
    ]);
    expect(map.get('a')).toBe('2026-03-05T08:00:00.000Z');
    expect(map.get('b')).toBe('2026-03-02T09:00:00.000Z');
  });

  it('liefert eine leere Zuordnung bei leerem Verlauf', () => {
    expect(lastContactByInterest([]).size).toBe(0);
  });

  it('kennt Interessenten ohne Verlauf schlicht nicht', () => {
    const map = lastContactByInterest([{ interestId: 'a', at: '2026-03-01T10:00:00.000Z' }]);
    expect(map.get('ohne')).toBeUndefined();
  });
});
