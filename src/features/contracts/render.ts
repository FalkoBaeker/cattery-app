/**
 * Setzt aus Vorlage, Grammatik und eingetragenen Werten den fertigen
 * Vertragstext zusammen.
 *
 * Ergebnis ist eine reine Datenstruktur — daraus entsteht sowohl die
 * Live-Vorschau auf dem Bildschirm als auch das PDF. Beide zeigen
 * garantiert dasselbe.
 */

import { formatDate } from '../../lib/date';
import { formatMoney, joinAnd, numberWord } from '../../lib/format';
import type { ContractData, ISODate, SellerSettings } from '../../types';
import {
  ermaessigterPreisCents,
  hatAnzahlung,
  restsummeCents,
  verwendungszweck,
  VORGABE_DECKVERSUCHE,
  VORGABE_HERAUSGABETAGE,
  VORGABE_NACHZAHLUNGSTAGE,
  VORGABE_NUTZUNGSMONATE,
  VORGABE_VERLAENGERUNGSMONATE,
} from './calc';
import {
  baueVokabular,
  fuellePlatzhalter,
  grammatikBefund,
  loeseSchalter,
  LUECKE,
  offenePlatzhalter,
  type SchalterLage,
  type Vokabular,
} from './grammar';
import type { Absatz, Bedingung, Vertragsvorlage } from './templates/model';
import { VERTRAG_STANDARD } from './templates/standard';
import { VERTRAG_ZUCHTNUTZUNG } from './templates/breeding';

/* ------------------------------------------------------------------ */
/*  Ergebnis                                                           */
/* ------------------------------------------------------------------ */

export interface GesetzterAbsatz {
  text: string;
  block: boolean;
}

export interface GesetzterParagraf {
  nummer: number;
  /** "§ 3 Vorbehalt der einmaligen Zuchtnutzung" */
  ueberschrift: string;
  absaetze: GesetzterAbsatz[];
}

export interface Unterschrift {
  /** "Verkäuferin", "Käuferin", "Käufer 2" */
  rolle: string;
  name: string;
}

export interface GesetzterVertrag {
  titel: string;
  vorspann: GesetzterAbsatz[];
  paragrafen: GesetzterParagraf[];
  nachspann: GesetzterAbsatz[];
  unterschriften: Unterschrift[];
  /** Hinweise für die Oberfläche, nicht für das PDF. */
  hinweise: string[];
}

/* ------------------------------------------------------------------ */
/*  Bedingungen                                                        */
/* ------------------------------------------------------------------ */

export function bedingungen(data: ContractData, seller: SellerSettings): Set<Bedingung> {
  const s = new Set<Bedingung>();
  const kaeuferAnzahl = data.buyers.length;
  // Ohne eingetragenen Käufer wird wie bei einem Käufer gedruckt —
  // die Gesamtschuldner-Klausel wäre dann sinnlos.
  if (kaeuferAnzahl > 1) s.add('mehrereKaeufer');
  else s.add('einKaeufer');

  if (data.animals.length > 1) s.add('mehrereTiere');
  else s.add('einTier');

  if (data.type === 'standard' && hatAnzahlung(data.depositCents)) s.add('mitAnzahlung');
  else if (data.type === 'standard') s.add('ohneAnzahlung');

  if (data.additionalAgreement?.trim()) s.add('zusatz');
  if (seller.iban?.trim()) s.add('mitIban');

  return s;
}

function sichtbar(wenn: Bedingung[] | undefined, aktiv: Set<Bedingung>): boolean {
  if (!wenn || wenn.length === 0) return true;
  return wenn.every((b) => aktiv.has(b));
}

/* ------------------------------------------------------------------ */
/*  Werte                                                              */
/* ------------------------------------------------------------------ */

function oderLuecke(text: string | undefined | null): string {
  const t = text?.trim();
  return t ? t : LUECKE;
}

function geldOderLuecke(cents: number | null | undefined): string {
  return cents == null || !Number.isFinite(cents) ? `${LUECKE} €` : formatMoney(cents);
}

function datumOderLuecke(d: ISODate | undefined | null): string {
  return d ? formatDate(d) : LUECKE;
}

/** Gemeinsames Geburtsdatum der Tiere; bei Abweichung „siehe oben". */
export function gemeinsamesGeburtsdatum(data: ContractData): string {
  const daten = data.animals.map((a) => a.birthDate).filter(Boolean) as ISODate[];
  if (daten.length === 0) return LUECKE;
  const einheitlich = daten.every((d) => d === daten[0]);
  if (!einheitlich) return 'den oben genannten Tagen';
  return formatDate(daten[0]);
}

/** Vertrag A, § 1: „Chipnummer: … (Name)" — eine Zeile je Kitten. */
export function tiereListe(data: ContractData): string {
  const tiere = data.animals.length ? data.animals : [{} as ContractData['animals'][number]];
  return tiere
    .map((t) => `Chipnummer: ${oderLuecke(t.chipNo)} (${oderLuecke(t.name)})`)
    .join('\n');
}

/** Vertrag B, § 1: der Datenblock je Katze, wie in der Textvorlage. */
export function katzenListe(data: ContractData): string {
  const tiere = data.animals.length ? data.animals : [{} as ContractData['animals'][number]];
  return tiere
    .map((t) =>
      [
        `Name: ${oderLuecke(t.name)}`,
        `Rasse: ${oderLuecke(data.breed)}`,
        'Geschlecht: weiblich',
        `Geburtsdatum: ${datumOderLuecke(t.birthDate)}`,
        `Chipnummer: ${oderLuecke(t.chipNo)}`,
      ].join('\n'),
    )
    .join('\n\n');
}

/** Mehrere Angaben zu einer: "A und B" bzw. "A, B und C". */
function verbunden(teile: (string | undefined)[]): string {
  // Doppelte Angaben (z. B. dieselbe Anschrift zweier Käufer) nur einmal.
  const liste = [...new Set(teile.map((t) => t?.trim()).filter(Boolean))] as string[];
  return liste.length ? joinAnd(liste) : LUECKE;
}

/**
 * Die Platzhalter tragen dieselben Namen wie in den Textvorlagen
 * docs/vertrag-a.txt und docs/vertrag-b.txt (dort mit doppelten
 * geschweiften Klammern geschrieben).
 */
export function werte(data: ContractData, seller: SellerSettings): Vokabular {
  return {
    'vk.name': oderLuecke(seller.name),
    'vk.anschrift': oderLuecke(seller.address),
    'vk.gebDatum': datumOderLuecke(seller.birthDate),
    'vk.iban': oderLuecke(seller.iban),

    'kaeufer.name': verbunden(data.buyers.map((b) => b.name)),
    'kaeufer.anschrift': verbunden(data.buyers.map((b) => b.address)),
    'kaeufer.gebDatum': verbunden(
      data.buyers.map((b) => (b.birthDate ? formatDate(b.birthDate) : undefined)),
    ),

    rasse: oderLuecke(data.breed),
    verein: oderLuecke(seller.clubName),
    tierzahlWort: numberWord(Math.max(1, data.animals.length)),
    gebDatum: gemeinsamesGeburtsdatum(data),

    /* Vertrag A */
    'tiere.liste': tiereListe(data),
    preis: geldOderLuecke(data.totalPriceCents),
    anzahlung: geldOderLuecke(data.depositCents),
    restsumme: geldOderLuecke(restsummeCents(data.totalPriceCents, data.depositCents)),
    uebergabeTermin: oderLuecke(data.handoverText),
    uebergabeOrt: oderLuecke(data.handoverPlace || seller.place),

    /* Vertrag B */
    'katzen.liste': katzenListe(data),
    'katzen.0.name': oderLuecke(data.animals[0]?.name),
    preisRegulaer: geldOderLuecke(data.regularPriceCents),
    nachlass: geldOderLuecke(data.discountCents),
    ermaessigt: geldOderLuecke(
      ermaessigterPreisCents(data.regularPriceCents, data.discountCents),
    ),
    verwendungszweck: verwendungszweck(data.animals, data.buyers),
    fristMonate: String(data.breedingUseMonths ?? VORGABE_NUTZUNGSMONATE),
    verlaengerungMonate: String(
      data.breedingUseExtensionMonths ?? VORGABE_VERLAENGERUNGSMONATE,
    ),
    herausgabeTage: String(data.handoverDeadlineDays ?? VORGABE_HERAUSGABETAGE),
    deckversuche: String(data.matingAttempts ?? VORGABE_DECKVERSUCHE),
    nachzahlungTage: String(data.backPaymentDays ?? VORGABE_NACHZAHLUNGSTAGE),

    /* Beide */
    zusatz: data.additionalAgreement?.trim() ?? '',
  };
}

/* ------------------------------------------------------------------ */
/*  Vorlage wählen                                                     */
/* ------------------------------------------------------------------ */

export function vorlageFuer(data: ContractData): Vertragsvorlage {
  return data.type === 'breeding_reserved' ? VERTRAG_ZUCHTNUTZUNG : VERTRAG_STANDARD;
}

/* ------------------------------------------------------------------ */
/*  Unterschriften                                                     */
/* ------------------------------------------------------------------ */

function unterschriften(data: ContractData, seller: SellerSettings): Unterschrift[] {
  const liste: Unterschrift[] = [{ rolle: 'Verkäuferin', name: oderLuecke(seller.name) }];
  if (data.buyers.length === 0) {
    liste.push({ rolle: 'Käufer', name: LUECKE });
    return liste;
  }
  data.buyers.forEach((k, i) => {
    const rolle = k.sex === 'female' ? 'Käuferin' : 'Käufer';
    liste.push({
      rolle: data.buyers.length > 1 ? `${rolle} ${i + 1}` : rolle,
      name: oderLuecke(k.name),
    });
  });
  return liste;
}

/* ------------------------------------------------------------------ */
/*  Hinweise für die Oberfläche                                        */
/* ------------------------------------------------------------------ */

function hinweise(data: ContractData, seller: SellerSettings): string[] {
  const h: string[] = [];
  if (!seller.name?.trim() || !seller.address?.trim()) {
    h.push('In den Einstellungen fehlen Name oder Anschrift der Verkäuferin.');
  }
  if (!seller.iban?.trim()) {
    h.push('Die IBAN fehlt in den Einstellungen — im Vertrag bleibt dort eine Lücke.');
  }
  if (data.buyers.length === 0) h.push('Es ist noch kein Käufer eingetragen.');
  if (data.animals.length === 0) h.push('Es ist noch kein Tier eingetragen.');
  if (data.animals.some((a) => !a.name?.trim())) h.push('Ein Tier hat noch keinen Rufnamen.');
  if (data.animals.some((a) => !a.chipNo?.trim())) h.push('Eine Chipnummer fehlt noch.');

  if (data.type === 'standard') {
    if (data.totalPriceCents == null) h.push('Der Kaufpreis fehlt noch.');
    if (!data.handoverText?.trim()) h.push('Der Übergabetermin fehlt noch.');
  } else {
    if (data.regularPriceCents == null) h.push('Der reguläre Kaufpreis fehlt noch.');
    if (data.discountCents == null) h.push('Der Preisnachlass fehlt noch.');
    if (!data.breedingUseStartDate) {
      h.push('Ohne Datum der erstmaligen Überlassung lässt sich die Frist nicht berechnen.');
    }
    if (data.animals.some((a) => a.sex !== 'female')) {
      h.push('Vertrag B gilt nur für weibliche Tiere.');
    }
    if (data.animals.length > 2) h.push('Vertrag B ist für ein bis zwei Katzen gedacht.');
  }
  return h;
}

/* ------------------------------------------------------------------ */
/*  Rendern                                                            */
/* ------------------------------------------------------------------ */

export interface RenderEingabe {
  data: ContractData;
  seller: SellerSettings;
}

export function rendereVertrag({ data, seller }: RenderEingabe): GesetzterVertrag {
  const vorlage = vorlageFuer(data);
  const aktiv = bedingungen(data, seller);
  const befund = grammatikBefund({ animals: data.animals, buyers: data.buyers });
  const lage: SchalterLage = {
    tierNumerus: befund.tierNumerus,
    kaeuferForm: befund.kaeuferForm,
  };
  const vokabular = baueVokabular({
    animals: data.animals,
    buyers: data.buyers,
    werte: werte(data, seller),
  });

  // Erst die Grammatik-Schalter, dann die Platzhalter — die Schalter
  // dürfen Platzhalter enthalten ("[T1:eine {rasse}-Katze|TN:…]").
  const fuelle = (text: string): string =>
    fuellePlatzhalter(loeseSchalter(text, lage), vokabular).trim();

  const setze = (a: Absatz): GesetzterAbsatz => ({
    text: fuelle(a.text),
    block: Boolean(a.block),
  });

  const nurSichtbare = (liste: Absatz[]) =>
    liste.filter((a) => sichtbar(a.wenn, aktiv)).map(setze).filter((a) => a.text.length > 0);

  // Die Nummerierung entsteht erst hier — ein abgeschalteter Paragraf
  // hinterlässt keine Lücke.
  let nummer = 0;
  const paragrafen: GesetzterParagraf[] = [];
  for (const p of vorlage.paragrafen) {
    if (!sichtbar(p.wenn, aktiv)) continue;
    const absaetze = nurSichtbare(p.absaetze);
    if (absaetze.length === 0) continue;
    nummer += 1;
    paragrafen.push({
      nummer,
      ueberschrift: `§ ${nummer} ${fuelle(p.titel)}`,
      absaetze,
    });
  }

  return {
    titel: fuelle(vorlage.titel),
    vorspann: nurSichtbare(vorlage.vorspann),
    paragrafen,
    nachspann: nurSichtbare(vorlage.nachspann),
    unterschriften: unterschriften(data, seller),
    hinweise: hinweise(data, seller),
  };
}

/* ------------------------------------------------------------------ */
/*  Reiner Text — für die Vorschau und zum Prüfen                      */
/* ------------------------------------------------------------------ */

export function vertragAlsText(v: GesetzterVertrag): string {
  const teile: string[] = [v.titel, ''];
  for (const a of v.vorspann) teile.push(a.text, '');
  for (const p of v.paragrafen) {
    teile.push(p.ueberschrift);
    for (const a of p.absaetze) teile.push(a.text, '');
  }
  for (const a of v.nachspann) teile.push(a.text, '');
  teile.push('Ort, Datum');
  teile.push('');
  for (const u of v.unterschriften) {
    teile.push('______________________________');
    teile.push(`${u.rolle}: ${u.name}`);
    teile.push('');
  }
  return teile.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * Prüfhilfe: findet Platzhalter, die keine Entsprechung im Vokabular
 * haben. Wird in den Tests über beide Vorlagen laufen gelassen, damit
 * ein Tippfehler in einer Vorlage nicht erst im gedruckten Vertrag
 * auffällt.
 */
export function unaufgeloestePlatzhalter({ data, seller }: RenderEingabe): string[] {
  const vorlage = vorlageFuer(data);
  const vokabular = baueVokabular({
    animals: data.animals,
    buyers: data.buyers,
    werte: werte(data, seller),
  });
  const alleTexte = [
    vorlage.titel,
    ...vorlage.vorspann.map((a) => a.text),
    ...vorlage.paragrafen.flatMap((p) => [p.titel, ...p.absaetze.map((a) => a.text)]),
    ...vorlage.nachspann.map((a) => a.text),
  ];
  const offen = alleTexte.flatMap((t) => offenePlatzhalter(t, vokabular));
  return [...new Set(offen)];
}
