/**
 * Grammatik-Maschine für die Vertragstexte.
 *
 * Der Rechtstext selbst wird nie umformuliert. Was sich ändert, sind
 * ausschließlich Artikel, Ein-/Mehrzahl und Verbformen. Die Vorlagen
 * enthalten dafür Platzhalter wie `{tier.nom}` oder `{kaeufer.hat}`,
 * die hier aufgelöst werden.
 *
 * Drei unabhängige Schalter bestimmen alles:
 *   a) Anzahl der Tiere        1 / mehrere
 *   b) Geschlecht der Tiere    nur Kater / nur Katzen / gemischt
 *   c) Käuferseite             1 männlich / 1 weiblich / mehrere
 *
 * Groß-/Kleinschreibung: `{tier.nom}` liefert "der Kater",
 * `{Tier.nom}` liefert "Der Kater" — praktisch am Satzanfang.
 */

import { joinAnd, numberWord } from '../../lib/format';
import { formatDate } from '../../lib/date';
import type { ContractAnimal, ContractParty, Sex } from '../../types';

/* ------------------------------------------------------------------ */
/*  Grundbegriffe                                                      */
/* ------------------------------------------------------------------ */

export type Kasus = 'nom' | 'akk' | 'dat' | 'gen';
export type Genus = 'm' | 'f' | 'n';
export type Numerus = 'sg' | 'pl';

export const ALLE_KASUS: Kasus[] = ['nom', 'akk', 'dat', 'gen'];

/** Welches Wort für die Tiere benutzt wird. */
export type TierWort = 'kater' | 'katze' | 'kitten';

/** Form der Käuferseite. */
export type KaeuferForm = 'm' | 'f' | 'pl';

/**
 * Platzhalter für noch nicht ausgefüllte Angaben. Der Vertrag wird
 * gedruckt und von Hand unterschrieben — eine Lücke ist dort besser
 * als ein leerer Fleck oder ein erfundener Wert.
 */
export const LUECKE = '__________';

/* ------------------------------------------------------------------ */
/*  Artikel                                                            */
/* ------------------------------------------------------------------ */

type ArtikelSchluessel = Genus | 'pl';

const BESTIMMT: Record<ArtikelSchluessel, Record<Kasus, string>> = {
  m: { nom: 'der', akk: 'den', dat: 'dem', gen: 'des' },
  f: { nom: 'die', akk: 'die', dat: 'der', gen: 'der' },
  n: { nom: 'das', akk: 'das', dat: 'dem', gen: 'des' },
  pl: { nom: 'die', akk: 'die', dat: 'den', gen: 'der' },
};

const UNBESTIMMT: Record<ArtikelSchluessel, Record<Kasus, string>> = {
  m: { nom: 'ein', akk: 'einen', dat: 'einem', gen: 'eines' },
  f: { nom: 'eine', akk: 'eine', dat: 'einer', gen: 'einer' },
  n: { nom: 'ein', akk: 'ein', dat: 'einem', gen: 'eines' },
  // Der unbestimmte Artikel hat im Deutschen keine Mehrzahl.
  pl: { nom: '', akk: '', dat: '', gen: '' },
};

const RELATIV: Record<ArtikelSchluessel, Record<Kasus, string>> = {
  m: { nom: 'der', akk: 'den', dat: 'dem', gen: 'dessen' },
  f: { nom: 'die', akk: 'die', dat: 'der', gen: 'deren' },
  n: { nom: 'das', akk: 'das', dat: 'dem', gen: 'dessen' },
  pl: { nom: 'die', akk: 'die', dat: 'denen', gen: 'deren' },
};

const PRONOMEN: Record<ArtikelSchluessel, Record<Kasus, string>> = {
  m: { nom: 'er', akk: 'ihn', dat: 'ihm', gen: 'seiner' },
  f: { nom: 'sie', akk: 'sie', dat: 'ihr', gen: 'ihrer' },
  n: { nom: 'es', akk: 'es', dat: 'ihm', gen: 'seiner' },
  pl: { nom: 'sie', akk: 'sie', dat: 'ihnen', gen: 'ihrer' },
};

/* ------------------------------------------------------------------ */
/*  Nomen                                                              */
/* ------------------------------------------------------------------ */

export interface Nomen {
  genus: Genus;
  sg: Record<Kasus, string>;
  pl: Record<Kasus, string>;
}

export const NOMEN = {
  /** das Kitten — sächlich, Mehrzahl endungslos. */
  kitten: {
    genus: 'n',
    sg: { nom: 'Kitten', akk: 'Kitten', dat: 'Kitten', gen: 'Kittens' },
    pl: { nom: 'Kitten', akk: 'Kitten', dat: 'Kitten', gen: 'Kitten' },
  },
  /** der Kater — starke Beugung, Dativ Mehrzahl auf -n. */
  kater: {
    genus: 'm',
    sg: { nom: 'Kater', akk: 'Kater', dat: 'Kater', gen: 'Katers' },
    pl: { nom: 'Kater', akk: 'Kater', dat: 'Katern', gen: 'Kater' },
  },
  /** die Katze — schwache Beugung. */
  katze: {
    genus: 'f',
    sg: { nom: 'Katze', akk: 'Katze', dat: 'Katze', gen: 'Katze' },
    pl: { nom: 'Katzen', akk: 'Katzen', dat: 'Katzen', gen: 'Katzen' },
  },
  kaeufer: {
    genus: 'm',
    sg: { nom: 'Käufer', akk: 'Käufer', dat: 'Käufer', gen: 'Käufers' },
    pl: { nom: 'Käufer', akk: 'Käufer', dat: 'Käufern', gen: 'Käufer' },
  },
  kaeuferin: {
    genus: 'f',
    sg: { nom: 'Käuferin', akk: 'Käuferin', dat: 'Käuferin', gen: 'Käuferin' },
    pl: {
      nom: 'Käuferinnen',
      akk: 'Käuferinnen',
      dat: 'Käuferinnen',
      gen: 'Käuferinnen',
    },
  },
  verkaeuferin: {
    genus: 'f',
    sg: { nom: 'Verkäuferin', akk: 'Verkäuferin', dat: 'Verkäuferin', gen: 'Verkäuferin' },
    pl: {
      nom: 'Verkäuferinnen',
      akk: 'Verkäuferinnen',
      dat: 'Verkäuferinnen',
      gen: 'Verkäuferinnen',
    },
  },
} satisfies Record<string, Nomen>;

export type NomenSchluessel = keyof typeof NOMEN;

function schluessel(nomen: Nomen, numerus: Numerus): ArtikelSchluessel {
  return numerus === 'pl' ? 'pl' : nomen.genus;
}

/** "der" / "den" / "dem" / "des" — passend zu Nomen, Zahl und Fall. */
export function bestimmterArtikel(nomen: Nomen, numerus: Numerus, kasus: Kasus): string {
  return BESTIMMT[schluessel(nomen, numerus)][kasus];
}

/** "ein" / "einen" / "einem" / "eines"; in der Mehrzahl leer. */
export function unbestimmterArtikel(nomen: Nomen, numerus: Numerus, kasus: Kasus): string {
  return UNBESTIMMT[schluessel(nomen, numerus)][kasus];
}

/** Relativpronomen: "der Kater, den …" */
export function relativpronomen(nomen: Nomen, numerus: Numerus, kasus: Kasus): string {
  return RELATIV[schluessel(nomen, numerus)][kasus];
}

/** Personalpronomen: er / sie / es / sie. */
export function personalpronomen(nomen: Nomen, numerus: Numerus, kasus: Kasus): string {
  return PRONOMEN[schluessel(nomen, numerus)][kasus];
}

/** Nacktes Nomen in der passenden Form: "Katern". */
export function nomenForm(nomen: Nomen, numerus: Numerus, kasus: Kasus): string {
  return numerus === 'pl' ? nomen.pl[kasus] : nomen.sg[kasus];
}

/** Nomen mit Artikel: "den Katern", "eine Katze", "Kitten". */
export function mitArtikel(
  nomen: Nomen,
  numerus: Numerus,
  kasus: Kasus,
  art: 'bestimmt' | 'unbestimmt' | 'ohne',
): string {
  const wort = nomenForm(nomen, numerus, kasus);
  if (art === 'ohne') return wort;
  const a = art === 'bestimmt'
    ? bestimmterArtikel(nomen, numerus, kasus)
    : unbestimmterArtikel(nomen, numerus, kasus);
  return a ? `${a} ${wort}` : wort;
}

/* ------------------------------------------------------------------ */
/*  Verben                                                             */
/* ------------------------------------------------------------------ */

/** [Einzahl, Mehrzahl] in der 3. Person. */
export const VERBEN = {
  ist: ['ist', 'sind'],
  wird: ['wird', 'werden'],
  wurde: ['wurde', 'wurden'],
  hat: ['hat', 'haben'],
  verpflichtetSich: ['verpflichtet sich', 'verpflichten sich'],
  erhaelt: ['erhält', 'erhalten'],
  darf: ['darf', 'dürfen'],
  kann: ['kann', 'können'],
  muss: ['muss', 'müssen'],
  bleibt: ['bleibt', 'bleiben'],
  zahlt: ['zahlt', 'zahlen'],
  traegt: ['trägt', 'tragen'],
  versichert: ['versichert', 'versichern'],
  haftet: ['haftet', 'haften'],
  schuldet: ['schuldet', 'schulden'],
} as const;

export type VerbSchluessel = keyof typeof VERBEN;

export function verb(key: VerbSchluessel, numerus: Numerus): string {
  return VERBEN[key][numerus === 'pl' ? 1 : 0];
}

/* ------------------------------------------------------------------ */
/*  Die drei Schalter                                                  */
/* ------------------------------------------------------------------ */

export interface GrammatikEingabe {
  animals: Pick<ContractAnimal, 'name' | 'sex' | 'chipNo' | 'birthDate'>[];
  buyers: Pick<ContractParty, 'name' | 'sex' | 'address' | 'birthDate'>[];
}

export interface GrammatikBefund {
  tierAnzahl: number;
  tierNumerus: Numerus;
  /** Welches Wort benutzt wird: nur Kater, nur Katzen oder gemischt → Kitten. */
  tierWort: TierWort;
  tierNomen: Nomen;
  kaeuferAnzahl: number;
  kaeuferNumerus: Numerus;
  kaeuferForm: KaeuferForm;
  kaeuferNomen: Nomen;
}

/**
 * Wertet die drei Schalter aus.
 *
 * Randfälle: Ohne Tiere wird von einem Kitten ausgegangen, ohne Käufer von
 * einer männlichen Einzelperson — sonst stünde in der Vorschau Unsinn.
 * Die Oberfläche weist getrennt darauf hin, dass Angaben fehlen.
 */
export function grammatikBefund(eingabe: GrammatikEingabe): GrammatikBefund {
  const tiere = eingabe.animals ?? [];
  const kaeufer = eingabe.buyers ?? [];

  const tierAnzahl = tiere.length;
  const tierNumerus: Numerus = tierAnzahl > 1 ? 'pl' : 'sg';

  const hatKater = tiere.some((t) => t.sex === 'male');
  const hatKatze = tiere.some((t) => t.sex === 'female');
  const tierWort: TierWort =
    tierAnzahl === 0 ? 'kitten' : hatKater && hatKatze ? 'kitten' : hatKater ? 'kater' : 'katze';

  const kaeuferAnzahl = kaeufer.length;
  const kaeuferNumerus: Numerus = kaeuferAnzahl > 1 ? 'pl' : 'sg';
  const ersterSex: Sex = kaeufer[0]?.sex ?? 'male';
  const kaeuferForm: KaeuferForm =
    kaeuferAnzahl > 1 ? 'pl' : ersterSex === 'female' ? 'f' : 'm';

  return {
    tierAnzahl,
    tierNumerus,
    tierWort,
    tierNomen: NOMEN[tierWort],
    kaeuferAnzahl,
    kaeuferNumerus,
    kaeuferForm,
    // Mehrere Käufer werden generisch männlich geführt ("die Käufer"),
    // auch wenn alle weiblich sind — so steht es im vorliegenden Vertrag.
    kaeuferNomen: kaeuferForm === 'f' ? NOMEN.kaeuferin : NOMEN.kaeufer,
  };
}

/* ------------------------------------------------------------------ */
/*  Vokabular                                                          */
/* ------------------------------------------------------------------ */

export type Vokabular = Record<string, string>;

/** Zahlwort in der jeweiligen Fallform: "einen Kater", "zwei Katern". */
function zahlwort(nomen: Nomen, numerus: Numerus, kasus: Kasus, anzahl: number): string {
  if (numerus === 'sg') return unbestimmterArtikel(nomen, 'sg', kasus);
  return numberWord(anzahl);
}

/** Legt alle Formen eines Beteiligten unter `<praefix>.<schluessel>` ab. */
function beteiligter(
  ziel: Vokabular,
  praefix: string,
  nomen: Nomen,
  numerus: Numerus,
  anzahl: number,
  namen: string[],
): void {
  for (const kasus of ALLE_KASUS) {
    ziel[`${praefix}.${kasus}`] = mitArtikel(nomen, numerus, kasus, 'bestimmt');
    ziel[`${praefix}.${kasus}U`] = mitArtikel(nomen, numerus, kasus, 'unbestimmt');
    ziel[`${praefix}.wort${kasus[0].toUpperCase()}${kasus.slice(1)}`] = nomenForm(
      nomen,
      numerus,
      kasus,
    );
    ziel[`${praefix}.artikel${kasus[0].toUpperCase()}${kasus.slice(1)}`] = bestimmterArtikel(
      nomen,
      numerus,
      kasus,
    );
    ziel[`${praefix}.rel${kasus[0].toUpperCase()}${kasus.slice(1)}`] = relativpronomen(
      nomen,
      numerus,
      kasus,
    );
    ziel[`${praefix}.pron${kasus[0].toUpperCase()}${kasus.slice(1)}`] = personalpronomen(
      nomen,
      numerus,
      kasus,
    );
    ziel[`${praefix}.zahl${kasus[0].toUpperCase()}${kasus.slice(1)}`] = zahlwort(
      nomen,
      numerus,
      kasus,
      anzahl,
    );
  }
  ziel[`${praefix}.wort`] = nomenForm(nomen, numerus, 'nom');
  ziel[`${praefix}.zahl`] = zahlwort(nomen, numerus, 'nom', anzahl);
  ziel[`${praefix}.anzahl`] = String(anzahl);
  ziel[`${praefix}.zahlwort`] = numberWord(anzahl);
  ziel[`${praefix}.namen`] = namen.length ? joinAnd(namen) : LUECKE;

  for (const key of Object.keys(VERBEN) as VerbSchluessel[]) {
    ziel[`${praefix}.${key}`] = verb(key, numerus);
  }
}

/** Ein Tier als eine Zeile: "Mia, Katze, Chipnummer 276…, geboren am …". */
export function tierZeile(tier: GrammatikEingabe['animals'][number]): string {
  const name = tier.name?.trim() || LUECKE;
  const geschlecht = tier.sex === 'male' ? 'Kater' : 'Katze';
  const chip = tier.chipNo?.trim() || LUECKE;
  const teile = [name, geschlecht, `Chipnummer ${chip}`];
  if (tier.birthDate) teile.push(`geboren am ${formatDate(tier.birthDate)}`);
  return teile.join(', ');
}

/** Ein Käufer als Block: Name, Anschrift, Geburtsdatum. */
export function kaeuferBlock(partei: GrammatikEingabe['buyers'][number]): string {
  const zeilen = [partei.name?.trim() || LUECKE];
  zeilen.push(partei.address?.trim() || LUECKE);
  zeilen.push(partei.birthDate ? `geboren am ${formatDate(partei.birthDate)}` : `geboren am ${LUECKE}`);
  return zeilen.join('\n');
}

export interface VokabularEingabe extends GrammatikEingabe {
  /** Weitere Werte: Preise, Fristen, freie Texte. */
  werte?: Vokabular;
}

/**
 * Baut das vollständige Vokabular. Enthält für Tiere (`tier`), Käufer
 * (`kaeufer`), die Verkäuferin (`vk`) und die neutrale Bezeichnung
 * (`kitten`) jeweils alle Artikel-, Fall- und Verbformen.
 */
export function baueVokabular(eingabe: VokabularEingabe): Vokabular {
  const b = grammatikBefund(eingabe);
  const v: Vokabular = {};

  const tierNamen = eingabe.animals.map((t) => t.name?.trim()).filter(Boolean) as string[];
  const kaeuferNamen = eingabe.buyers.map((k) => k.name?.trim()).filter(Boolean) as string[];

  beteiligter(v, 'tier', b.tierNomen, b.tierNumerus, b.tierAnzahl, tierNamen);
  beteiligter(v, 'kitten', NOMEN.kitten, b.tierNumerus, b.tierAnzahl, tierNamen);
  beteiligter(v, 'kaeufer', b.kaeuferNomen, b.kaeuferNumerus, b.kaeuferAnzahl, kaeuferNamen);
  beteiligter(v, 'vk', NOMEN.verkaeuferin, 'sg', 1, []);

  // Aufzählungen
  v['tier.liste'] =
    eingabe.animals.length === 0
      ? LUECKE
      : eingabe.animals.length === 1
        ? tierZeile(eingabe.animals[0])
        : eingabe.animals.map((t, i) => `${i + 1}. ${tierZeile(t)}`).join('\n');

  v['kaeufer.liste'] =
    eingabe.buyers.length === 0
      ? `${LUECKE}\n${LUECKE}\ngeboren am ${LUECKE}`
      : eingabe.buyers.map(kaeuferBlock).join('\n\n');

  return { ...v, ...(eingabe.werte ?? {}) };
}

/* ------------------------------------------------------------------ */
/*  Platzhalter auflösen                                               */
/* ------------------------------------------------------------------ */

const PLATZHALTER = /\{([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9_]*(?:\.[A-Za-zÄÖÜäöüß0-9_]+)*)\}/g;

/**
 * Ersetzt `{schluessel}` durch den Wert aus dem Vokabular — in einem
 * einzigen Durchgang, damit eingesetzte Werte nicht erneut durchsucht
 * werden. Beginnt der Schlüssel mit einem Großbuchstaben, wird der Wert
 * groß geschrieben: `{Tier.nom}` → "Der Kater".
 *
 * Unbekannte Schlüssel bleiben unverändert stehen — so fallen sie beim
 * Korrekturlesen sofort auf, statt still zu verschwinden.
 */
export function fuellePlatzhalter(text: string, vokabular: Vokabular): string {
  return text.replace(PLATZHALTER, (treffer, schluessel: string) => {
    const direkt = vokabular[schluessel];
    if (direkt !== undefined) return direkt;

    const ersterBuchstabe = schluessel[0];
    if (ersterBuchstabe !== ersterBuchstabe.toLowerCase()) {
      const klein = ersterBuchstabe.toLowerCase() + schluessel.slice(1);
      const wert = vokabular[klein];
      if (wert !== undefined) return grossAmAnfang(wert);
    }
    return treffer;
  });
}

/** "der Kater" → "Der Kater". Lässt Leerzeichen und Ziffern in Ruhe. */
export function grossAmAnfang(text: string): string {
  if (!text) return text;
  return text[0].toUpperCase() + text.slice(1);
}

/** Findet Platzhalter, die kein Vokabular auflösen konnte. */
export function offenePlatzhalter(text: string, vokabular: Vokabular): string[] {
  const offen: string[] = [];
  for (const treffer of text.matchAll(PLATZHALTER)) {
    const schluessel = treffer[1];
    const klein = schluessel[0].toLowerCase() + schluessel.slice(1);
    if (vokabular[schluessel] === undefined && vokabular[klein] === undefined) {
      offen.push(schluessel);
    }
  }
  return [...new Set(offen)];
}
