import { describe, expect, it } from 'vitest';
import {
  ALLE_KASUS,
  baueVokabular,
  bestimmterArtikel,
  fuellePlatzhalter,
  grammatikBefund,
  grossAmAnfang,
  kaeuferBlock,
  loeseSchalter,
  LUECKE,
  offeneSchalter,
  mitArtikel,
  NOMEN,
  nomenForm,
  offenePlatzhalter,
  personalpronomen,
  relativpronomen,
  tierZeile,
  unbestimmterArtikel,
  verb,
  type Kasus,
} from './grammar';
import type { ContractAnimal, ContractParty, Sex } from '../../types';

/* ------------------------------------------------------------------ */
/*  Hilfen                                                             */
/* ------------------------------------------------------------------ */

function tier(sex: Sex, name = 'Mia', chipNo = '276093400000001'): ContractAnimal {
  return { name, sex, chipNo, birthDate: '2026-03-03' };
}

function kaeufer(sex: Sex | undefined, name = 'Anna Muster'): ContractParty {
  return { name, sex, address: 'Musterweg 1, 12345 Musterstadt', birthDate: '1990-01-31' };
}

function vok(animals: ContractAnimal[], buyers: ContractParty[]) {
  return baueVokabular({ animals, buyers });
}

/* ------------------------------------------------------------------ */
/*  Artikel in allen vier Fällen                                       */
/* ------------------------------------------------------------------ */

describe('bestimmter Artikel', () => {
  it('männlich Einzahl: der / den / dem / des', () => {
    const formen = ALLE_KASUS.map((k) => bestimmterArtikel(NOMEN.kater, 'sg', k));
    expect(formen).toEqual(['der', 'den', 'dem', 'des']);
  });

  it('weiblich Einzahl: die / die / der / der', () => {
    const formen = ALLE_KASUS.map((k) => bestimmterArtikel(NOMEN.katze, 'sg', k));
    expect(formen).toEqual(['die', 'die', 'der', 'der']);
  });

  it('sächlich Einzahl: das / das / dem / des', () => {
    const formen = ALLE_KASUS.map((k) => bestimmterArtikel(NOMEN.kitten, 'sg', k));
    expect(formen).toEqual(['das', 'das', 'dem', 'des']);
  });

  it('Mehrzahl unabhängig vom Geschlecht: die / die / den / der', () => {
    for (const n of [NOMEN.kater, NOMEN.katze, NOMEN.kitten, NOMEN.kaeufer, NOMEN.kaeuferin]) {
      expect(ALLE_KASUS.map((k) => bestimmterArtikel(n, 'pl', k))).toEqual([
        'die',
        'die',
        'den',
        'der',
      ]);
    }
  });
});

describe('unbestimmter Artikel', () => {
  it('männlich: ein / einen / einem / eines', () => {
    expect(ALLE_KASUS.map((k) => unbestimmterArtikel(NOMEN.kater, 'sg', k))).toEqual([
      'ein',
      'einen',
      'einem',
      'eines',
    ]);
  });

  it('weiblich: eine / eine / einer / einer', () => {
    expect(ALLE_KASUS.map((k) => unbestimmterArtikel(NOMEN.katze, 'sg', k))).toEqual([
      'eine',
      'eine',
      'einer',
      'einer',
    ]);
  });

  it('sächlich: ein / ein / einem / eines', () => {
    expect(ALLE_KASUS.map((k) => unbestimmterArtikel(NOMEN.kitten, 'sg', k))).toEqual([
      'ein',
      'ein',
      'einem',
      'eines',
    ]);
  });

  it('hat keine Mehrzahl — das Nomen steht dann allein', () => {
    expect(unbestimmterArtikel(NOMEN.katze, 'pl', 'nom')).toBe('');
    expect(mitArtikel(NOMEN.katze, 'pl', 'nom', 'unbestimmt')).toBe('Katzen');
  });
});

describe('Beugung der Nomen', () => {
  it('Kitten: des Kittens im Genitiv Einzahl, endungslos in der Mehrzahl', () => {
    expect(mitArtikel(NOMEN.kitten, 'sg', 'gen', 'bestimmt')).toBe('des Kittens');
    expect(mitArtikel(NOMEN.kitten, 'pl', 'gen', 'bestimmt')).toBe('der Kitten');
    expect(mitArtikel(NOMEN.kitten, 'pl', 'dat', 'bestimmt')).toBe('den Kitten');
  });

  it('Kater: Dativ Mehrzahl auf -n', () => {
    expect(mitArtikel(NOMEN.kater, 'pl', 'dat', 'bestimmt')).toBe('den Katern');
    expect(mitArtikel(NOMEN.kater, 'sg', 'gen', 'bestimmt')).toBe('des Katers');
  });

  it('Katze: schwache Beugung, Mehrzahl auf -n', () => {
    expect(nomenForm(NOMEN.katze, 'pl', 'nom')).toBe('Katzen');
    expect(mitArtikel(NOMEN.katze, 'sg', 'dat', 'bestimmt')).toBe('der Katze');
  });

  it('Käufer: Dativ Mehrzahl auf -n, Genitiv Einzahl auf -s', () => {
    expect(mitArtikel(NOMEN.kaeufer, 'pl', 'dat', 'bestimmt')).toBe('den Käufern');
    expect(mitArtikel(NOMEN.kaeufer, 'sg', 'gen', 'bestimmt')).toBe('des Käufers');
  });

  it('Käuferin: Mehrzahl auf -innen, im Singular unveränderlich', () => {
    expect(mitArtikel(NOMEN.kaeuferin, 'pl', 'nom', 'bestimmt')).toBe('die Käuferinnen');
    for (const k of ALLE_KASUS) {
      expect(nomenForm(NOMEN.kaeuferin, 'sg', k)).toBe('Käuferin');
    }
  });
});

describe('Relativ- und Personalpronomen', () => {
  it('Relativpronomen folgen dem Geschlecht', () => {
    expect(relativpronomen(NOMEN.kitten, 'sg', 'nom')).toBe('das');
    expect(relativpronomen(NOMEN.kater, 'sg', 'akk')).toBe('den');
    expect(relativpronomen(NOMEN.katze, 'pl', 'dat')).toBe('denen');
  });

  it('Personalpronomen: er / sie / es / sie', () => {
    expect(personalpronomen(NOMEN.kater, 'sg', 'nom')).toBe('er');
    expect(personalpronomen(NOMEN.katze, 'sg', 'nom')).toBe('sie');
    expect(personalpronomen(NOMEN.kitten, 'sg', 'nom')).toBe('es');
    expect(personalpronomen(NOMEN.kitten, 'pl', 'nom')).toBe('sie');
  });
});

/* ------------------------------------------------------------------ */
/*  Verben                                                             */
/* ------------------------------------------------------------------ */

describe('Verbformen', () => {
  it('kennt die geforderten Formen in Ein- und Mehrzahl', () => {
    expect([verb('ist', 'sg'), verb('ist', 'pl')]).toEqual(['ist', 'sind']);
    expect([verb('wird', 'sg'), verb('wird', 'pl')]).toEqual(['wird', 'werden']);
    expect([verb('wurde', 'sg'), verb('wurde', 'pl')]).toEqual(['wurde', 'wurden']);
    expect([verb('hat', 'sg'), verb('hat', 'pl')]).toEqual(['hat', 'haben']);
    expect([verb('verpflichtetSich', 'sg'), verb('verpflichtetSich', 'pl')]).toEqual([
      'verpflichtet sich',
      'verpflichten sich',
    ]);
  });

  it('beugt auch die Umlautformen richtig', () => {
    expect(verb('erhaelt', 'sg')).toBe('erhält');
    expect(verb('erhaelt', 'pl')).toBe('erhalten');
    expect(verb('darf', 'pl')).toBe('dürfen');
    expect(verb('traegt', 'sg')).toBe('trägt');
  });
});

/* ------------------------------------------------------------------ */
/*  Die drei Schalter — alle Kombinationen                             */
/* ------------------------------------------------------------------ */

describe('Schalter a) Anzahl Tiere × b) Geschlecht', () => {
  const faelle: { name: string; tiere: ContractAnimal[]; nom: string; ist: string }[] = [
    { name: '1 Kater', tiere: [tier('male')], nom: 'der Kater', ist: 'ist' },
    { name: '1 Katze', tiere: [tier('female')], nom: 'die Katze', ist: 'ist' },
    {
      name: '2 Kater',
      tiere: [tier('male', 'Ben'), tier('male', 'Carl')],
      nom: 'die Kater',
      ist: 'sind',
    },
    {
      name: '2 Katzen',
      tiere: [tier('female', 'Mia'), tier('female', 'Nala')],
      nom: 'die Katzen',
      ist: 'sind',
    },
    {
      name: 'gemischt',
      tiere: [tier('male', 'Ben'), tier('female', 'Mia')],
      nom: 'die Kitten',
      ist: 'sind',
    },
    {
      name: '9 Kitten gemischt',
      tiere: [
        ...Array.from({ length: 5 }, (_, i) => tier('male', `Kater ${i + 1}`)),
        ...Array.from({ length: 4 }, (_, i) => tier('female', `Katze ${i + 1}`)),
      ],
      nom: 'die Kitten',
      ist: 'sind',
    },
  ];

  for (const f of faelle) {
    it(`${f.name}: „${f.nom} ${f.ist}"`, () => {
      const v = vok(f.tiere, [kaeufer('female')]);
      expect(v['tier.nom']).toBe(f.nom);
      expect(v['tier.ist']).toBe(f.ist);
    });
  }

  it('gemischt gilt auch bei 1 Kater + 1 Katze, nicht erst ab drei', () => {
    const v = vok([tier('male'), tier('female')], [kaeufer('male')]);
    expect(grammatikBefund({ animals: [tier('male'), tier('female')], buyers: [] }).tierWort).toBe(
      'kitten',
    );
    expect(v['tier.dat']).toBe('den Kitten');
  });

  it('ohne Tier wird von einem Kitten ausgegangen', () => {
    const v = vok([], [kaeufer('male')]);
    expect(v['tier.nom']).toBe('das Kitten');
    expect(v['tier.ist']).toBe('ist');
    expect(v['tier.namen']).toBe(LUECKE);
    expect(v['tier.liste']).toBe(LUECKE);
  });

  it('ein einzelnes Kitten bleibt Einzahl', () => {
    const v = vok([tier('female')], [kaeufer('female')]);
    expect(v['kitten.nom']).toBe('das Kitten');
    expect(v['kitten.ist']).toBe('ist');
  });
});

describe('Schalter c) Käuferseite', () => {
  it('1 männlich: der Käufer / den Käufer / dem Käufer / des Käufers', () => {
    const v = vok([tier('female')], [kaeufer('male', 'Ben Muster')]);
    expect(ALLE_KASUS.map((k: Kasus) => v[`kaeufer.${k}`])).toEqual([
      'der Käufer',
      'den Käufer',
      'dem Käufer',
      'des Käufers',
    ]);
    expect(v['kaeufer.hat']).toBe('hat');
  });

  it('1 weiblich: der/die Käuferin in allen Fällen', () => {
    const v = vok([tier('female')], [kaeufer('female')]);
    expect(ALLE_KASUS.map((k: Kasus) => v[`kaeufer.${k}`])).toEqual([
      'die Käuferin',
      'die Käuferin',
      'der Käuferin',
      'der Käuferin',
    ]);
    expect(v['kaeufer.verpflichtetSich']).toBe('verpflichtet sich');
  });

  it('mehrere: generisch männliche Mehrzahl', () => {
    const v = vok([tier('female')], [kaeufer('female', 'Anna'), kaeufer('male', 'Ben')]);
    expect(ALLE_KASUS.map((k: Kasus) => v[`kaeufer.${k}`])).toEqual([
      'die Käufer',
      'die Käufer',
      'den Käufern',
      'der Käufer',
    ]);
    expect(v['kaeufer.hat']).toBe('haben');
    expect(v['kaeufer.verpflichtetSich']).toBe('verpflichten sich');
  });

  it('auch zwei Frauen ergeben „die Käufer"', () => {
    const v = vok([tier('female')], [kaeufer('female', 'Anna'), kaeufer('female', 'Bea')]);
    expect(v['kaeufer.nom']).toBe('die Käufer');
  });

  it('ohne Geschlechtsangabe wird männlich gedruckt', () => {
    const v = vok([tier('female')], [kaeufer(undefined, 'A. Muster')]);
    expect(v['kaeufer.nom']).toBe('der Käufer');
  });

  it('ohne Käufer wird wie bei einer Person gedruckt', () => {
    const v = vok([tier('female')], []);
    expect(v['kaeufer.nom']).toBe('der Käufer');
    expect(v['kaeufer.namen']).toBe(LUECKE);
  });
});

describe('alle 3 × 3 Kombinationen der Schalter', () => {
  const tierFaelle: [string, ContractAnimal[]][] = [
    ['1 Kater', [tier('male')]],
    ['1 Katze', [tier('female')]],
    ['1 Kitten (keine Angabe)', []],
    ['2 Kater', [tier('male', 'A'), tier('male', 'B')]],
    ['2 Katzen', [tier('female', 'A'), tier('female', 'B')]],
    ['gemischt', [tier('male', 'A'), tier('female', 'B')]],
  ];
  const kaeuferFaelle: [string, ContractParty[]][] = [
    ['1 männlich', [kaeufer('male')]],
    ['1 weiblich', [kaeufer('female')]],
    ['mehrere', [kaeufer('male', 'A'), kaeufer('female', 'B'), kaeufer('male', 'C')]],
  ];

  for (const [tName, tiere] of tierFaelle) {
    for (const [kName, kaeuferListe] of kaeuferFaelle) {
      it(`${tName} × ${kName} ergibt einen vollständigen, lesbaren Satz`, () => {
        const v = vok(tiere, kaeuferListe);
        const satz = fuellePlatzhalter(
          '{Vk.nom} verkauft {kaeufer.dat} {tier.zahlAkk} {tier.wortAkk}. ' +
            '{Tier.nom} {tier.wurde} übergeben. {Kaeufer.nom} {kaeufer.verpflichtetSich}, ' +
            '{tier.akk} artgerecht zu halten.',
          v,
        );
        expect(satz).not.toMatch(/[{}]/);
        expect(satz).not.toMatch(/\s{2,}/);
        expect(satz.startsWith('Die Verkäuferin verkauft ')).toBe(true);
      });
    }
  }

  it('deckt die Beispielsätze der Anforderungen ab', () => {
    const einKater = vok([tier('male')], [kaeufer('male')]);
    const zweiKatzen = vok([tier('female', 'A'), tier('female', 'B')], [kaeufer('female')]);
    const gemischt = vok([tier('male', 'A'), tier('female', 'B')], [kaeufer('male'), kaeufer('female')]);

    expect(fuellePlatzhalter('{Kitten.nom} {kitten.ist} da.', einKater)).toBe(
      'Das Kitten ist da.',
    );
    expect(fuellePlatzhalter('{Kitten.nom} {kitten.ist} da.', zweiKatzen)).toBe(
      'Die Kitten sind da.',
    );
    expect(fuellePlatzhalter('{Tier.nom}', einKater)).toBe('Der Kater');
    expect(fuellePlatzhalter('{Tier.nom}', zweiKatzen)).toBe('Die Katzen');
    expect(fuellePlatzhalter('{Tier.nom}', gemischt)).toBe('Die Kitten');
  });
});

/* ------------------------------------------------------------------ */
/*  Zahlwörter und Aufzählungen                                        */
/* ------------------------------------------------------------------ */

describe('Zahlwörter', () => {
  it('1 Tier: unbestimmter Artikel im jeweiligen Fall', () => {
    const kater = vok([tier('male')], []);
    expect(kater['tier.zahlNom']).toBe('ein');
    expect(kater['tier.zahlAkk']).toBe('einen');
    expect(kater['tier.zahlDat']).toBe('einem');

    const katze = vok([tier('female')], []);
    expect(katze['tier.zahlAkk']).toBe('eine');
  });

  it('mehrere Tiere: ausgeschriebenes Zahlwort', () => {
    const zwei = vok([tier('male', 'A'), tier('male', 'B')], []);
    expect(zwei['tier.zahlAkk']).toBe('zwei');
    expect(zwei['tier.anzahl']).toBe('2');

    const neun = vok(
      Array.from({ length: 9 }, (_, i) => tier('female', `K${i}`)),
      [],
    );
    expect(neun['tier.zahlNom']).toBe('neun');
    expect(neun['tier.wortAkk']).toBe('Katzen');
  });

  it('setzt Zahlwort und Nomen zu einem Satz zusammen', () => {
    expect(
      fuellePlatzhalter('verkauft {tier.zahlAkk} {tier.wortAkk}', vok([tier('male')], [])),
    ).toBe('verkauft einen Kater');
    expect(
      fuellePlatzhalter(
        'verkauft {tier.zahlAkk} {tier.wortAkk}',
        vok([tier('female', 'A'), tier('female', 'B')], []),
      ),
    ).toBe('verkauft zwei Katzen');
  });
});

describe('Aufzählung der Namen', () => {
  it('einer, zwei, drei Käufer', () => {
    expect(vok([], [kaeufer('male', 'A')])['kaeufer.namen']).toBe('A');
    expect(vok([], [kaeufer('male', 'A'), kaeufer('male', 'B')])['kaeufer.namen']).toBe('A und B');
    expect(
      vok([], [kaeufer('male', 'A'), kaeufer('male', 'B'), kaeufer('male', 'C')])['kaeufer.namen'],
    ).toBe('A, B und C');
  });

  it('überspringt leere Namen, statt Kommas zu häufen', () => {
    const v = vok([], [kaeufer('male', 'A'), kaeufer('male', '   '), kaeufer('male', 'C')]);
    expect(v['kaeufer.namen']).toBe('A und C');
  });

  it('verträgt sehr lange Namen unverändert', () => {
    const lang = 'Maximiliane Charlotte von und zu Hohenlohe-Schillingsfürst-Waldenburg';
    expect(vok([], [kaeufer('female', lang)])['kaeufer.namen']).toBe(lang);
  });
});

describe('Tier- und Käuferblöcke', () => {
  it('eine Tierzeile enthält Rufname, Geschlecht, Chip und Geburtsdatum', () => {
    expect(tierZeile(tier('female', 'Mia', '276093400000001'))).toBe(
      'Mia, Katze, Chipnummer 276093400000001, geboren am 03.03.2026',
    );
  });

  it('lässt fehlende Angaben als ausfüllbare Lücke stehen', () => {
    expect(tierZeile({ name: '', sex: 'male' })).toBe(
      `${LUECKE}, Kater, Chipnummer ${LUECKE}`,
    );
  });

  it('nummeriert mehrere Tiere, ein einzelnes nicht', () => {
    const eins = vok([tier('female', 'Mia')], []);
    expect(eins['tier.liste'].startsWith('Mia,')).toBe(true);

    const zwei = vok([tier('female', 'Mia'), tier('female', 'Nala')], []);
    expect(zwei['tier.liste'].split('\n')[0].startsWith('1. Mia')).toBe(true);
    expect(zwei['tier.liste'].split('\n')[1].startsWith('2. Nala')).toBe(true);
  });

  it('druckt Käufer mit Anschrift und Geburtsdatum', () => {
    expect(kaeuferBlock(kaeufer('female', 'Anna Muster'))).toBe(
      'Anna Muster\nMusterweg 1, 12345 Musterstadt\ngeboren am 31.01.1990',
    );
  });

  it('trennt mehrere Käufer durch eine Leerzeile', () => {
    const v = vok([], [kaeufer('female', 'Anna'), kaeufer('male', 'Ben')]);
    expect(v['kaeufer.liste'].split('\n\n')).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Textersetzung                                                      */
/* ------------------------------------------------------------------ */

describe('Platzhalter auflösen', () => {
  const v = vok([tier('female')], [kaeufer('male')]);

  it('schreibt bei großem Anfangsbuchstaben groß', () => {
    expect(fuellePlatzhalter('{tier.nom}', v)).toBe('die Katze');
    expect(fuellePlatzhalter('{Tier.nom}', v)).toBe('Die Katze');
  });

  it('lässt unbekannte Platzhalter stehen, statt sie zu schlucken', () => {
    expect(fuellePlatzhalter('Hallo {gibtesnicht}.', v)).toBe('Hallo {gibtesnicht}.');
    expect(offenePlatzhalter('{gibtesnicht} und {tier.nom}', v)).toEqual(['gibtesnicht']);
  });

  it('durchsucht eingesetzte Werte nicht erneut', () => {
    const boese = { a: '{b}', b: 'sollte nicht erscheinen' };
    expect(fuellePlatzhalter('{a}', boese)).toBe('{b}');
  });

  it('verträgt Umlaute, ß und Anführungszeichen in den Werten', () => {
    const w = { 'x.y': 'Grüße — „Straße" & Söhne, 100 % ß' };
    expect(fuellePlatzhalter('Wert: {x.y}', w)).toBe('Wert: Grüße — „Straße" & Söhne, 100 % ß');
  });

  it('erkennt Platzhalter mit Umlaut im Namen', () => {
    expect(fuellePlatzhalter('{käufer}', { 'käufer': 'ok' })).toBe('ok');
  });

  it('lässt Zeilenumbrüche unangetastet', () => {
    expect(fuellePlatzhalter('{kaeufer.liste}', v).split('\n')).toHaveLength(3);
  });

  it('grossAmAnfang lässt leere Texte in Ruhe', () => {
    expect(grossAmAnfang('')).toBe('');
    expect(grossAmAnfang('ärztlich')).toBe('Ärztlich');
  });
});

describe('Befund', () => {
  it('meldet Zahl und Form der Beteiligten', () => {
    const b = grammatikBefund({
      animals: [tier('female', 'A'), tier('female', 'B')],
      buyers: [kaeufer('female')],
    });
    expect(b.tierAnzahl).toBe(2);
    expect(b.tierNumerus).toBe('pl');
    expect(b.tierWort).toBe('katze');
    expect(b.kaeuferForm).toBe('f');
    expect(b.kaeuferNumerus).toBe('sg');
  });
});

describe('Grammatik-Schalter der Vorlagen', () => {
  it('löst [EZ:…|MZ:…] nach der Tierzahl auf', () => {
    expect(loeseSchalter('[EZ:Das Kitten ist|MZ:Die Kitten sind] geimpft', { tierNumerus: 'sg', kaeuferForm: 'm' })).toBe(
      'Das Kitten ist geimpft',
    );
    expect(loeseSchalter('[EZ:Das Kitten ist|MZ:Die Kitten sind] geimpft', { tierNumerus: 'pl', kaeuferForm: 'm' })).toBe(
      'Die Kitten sind geimpft',
    );
  });

  it('löst [T1:…|TN:…] wie [EZ:…|MZ:…] auf und lässt Platzhalter stehen', () => {
    expect(
      loeseSchalter('[T1:eine {rasse}-Katze|TN:{tierzahlWort} {rasse}-Katzen]', {
        tierNumerus: 'sg',
        kaeuferForm: 'pl',
      }),
    ).toBe('eine {rasse}-Katze');
  });

  it('löst [K1M:…|K1W:…|KN:…] nach der Käuferseite auf', () => {
    const t = '[K1M:Der Käufer erwirbt|K1W:Die Käuferin erwirbt|KN:Die Käufer erwerben] kein Zuchtrecht';
    expect(loeseSchalter(t, { tierNumerus: 'sg', kaeuferForm: 'm' })).toBe('Der Käufer erwirbt kein Zuchtrecht');
    expect(loeseSchalter(t, { tierNumerus: 'sg', kaeuferForm: 'f' })).toBe('Die Käuferin erwirbt kein Zuchtrecht');
    expect(loeseSchalter(t, { tierNumerus: 'sg', kaeuferForm: 'pl' })).toBe('Die Käufer erwerben kein Zuchtrecht');
  });

  it('verträgt Anführungszeichen und mehrere Schalter je Satz', () => {
    expect(
      loeseSchalter('nachfolgend [K1M:„Käufer"|K1W:„Käuferin"|KN:gemeinsam „Käufer"] genannt. [K1M:Er|K1W:Sie|KN:Sie] zahlt.', {
        tierNumerus: 'sg',
        kaeuferForm: 'f',
      }),
    ).toBe('nachfolgend „Käuferin" genannt. Sie zahlt.');
  });

  it('offeneSchalter findet stehengebliebene Schalter', () => {
    expect(offeneSchalter('alles gut')).toEqual([]);
    expect(offeneSchalter('kaputt [EZ:a|MZZZ:b]')).toHaveLength(1);
  });
});
