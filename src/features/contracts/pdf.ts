/**
 * Vertrag als PDF — A4, deutscher Satz, ohne Netzzugriff.
 *
 * jsPDF bringt die Standardschrift Helvetica mit. Sie wird in
 * WinAnsi (cp1252) kodiert und enthält damit ä ö ü Ä Ö Ü ß und das
 * €-Zeichen. Geprüft wird das in pdf.test.ts an den erzeugten Bytes,
 * nicht nur behauptet.
 */

import type { jsPDF } from 'jspdf';
import { db, patch, putAttachment } from '../../db/db';
import { todayISO } from '../../lib/date';
import type { Contract, ID } from '../../types';
import type { GesetzterVertrag } from './render';

/* ------------------------------------------------------------------ */
/*  Satzspiegel (alles in mm)                                          */
/* ------------------------------------------------------------------ */

const SEITE_BREITE = 210;
const SEITE_HOEHE = 297;
const RAND_LINKS = 22;
const RAND_RECHTS = 22;
const RAND_OBEN = 20;
const RAND_UNTEN = 22;
const SATZ_BREITE = SEITE_BREITE - RAND_LINKS - RAND_RECHTS;

const GROESSE_TITEL = 15;
const GROESSE_UEBERSCHRIFT = 11.5;
const GROESSE_TEXT = 10.5;
const GROESSE_FUSS = 8.5;

/** Zeilenabstand bei Fließtext. */
const ZEILE = 5.0;
const ABSATZ_ABSTAND = 2.6;
const PARAGRAF_ABSTAND = 4.5;

/** Länge der Unterschriftslinie. */
const LINIE_BREITE = 78;

/* ------------------------------------------------------------------ */
/*  Kleiner Satzhelfer                                                 */
/* ------------------------------------------------------------------ */

class Setzer {
  readonly doc: jsPDF;
  y: number;

  constructor(doc: jsPDF) {
    this.doc = doc;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(17, 17, 17);
    this.y = RAND_OBEN;
  }

  /** Verbleibender Platz bis zum unteren Rand. */
  get platz(): number {
    return SEITE_HOEHE - RAND_UNTEN - this.y;
  }

  neueSeite(): void {
    this.doc.addPage();
    this.y = RAND_OBEN;
  }

  /** Sorgt dafür, dass die angegebene Höhe noch auf die Seite passt. */
  brauche(hoehe: number): void {
    if (hoehe > this.platz) this.neueSeite();
  }

  zeilen(text: string, groesse: number, stil: 'normal' | 'bold' = 'normal'): string[] {
    this.doc.setFont('helvetica', stil);
    this.doc.setFontSize(groesse);
    // Eigene Zeilenumbrüche bleiben erhalten, der Rest wird umbrochen.
    return text
      .split('\n')
      .flatMap((z) => this.doc.splitTextToSize(z, SATZ_BREITE) as string[]);
  }

  /**
   * Schreibt einen Textblock mit automatischem Zeilen- und Seitenumbruch.
   * `zusammen` hält die ersten n Zeilen auf derselben Seite.
   */
  schreibe(
    text: string,
    optionen: {
      groesse?: number;
      stil?: 'normal' | 'bold';
      zentriert?: boolean;
      abstandDanach?: number;
    } = {},
  ): void {
    const groesse = optionen.groesse ?? GROESSE_TEXT;
    const stil = optionen.stil ?? 'normal';
    const zeilen = this.zeilen(text, groesse, stil);
    const hoehe = groesse >= GROESSE_TITEL ? ZEILE + 2 : ZEILE;

    for (const zeile of zeilen) {
      this.brauche(hoehe);
      this.doc.setFont('helvetica', stil);
      this.doc.setFontSize(groesse);
      if (optionen.zentriert) {
        this.doc.text(zeile, SEITE_BREITE / 2, this.y, { align: 'center' });
      } else {
        this.doc.text(zeile, RAND_LINKS, this.y);
      }
      this.y += hoehe;
    }
    this.y += optionen.abstandDanach ?? ABSATZ_ABSTAND;
  }

  linie(breite = LINIE_BREITE): void {
    this.brauche(ZEILE);
    this.doc.setDrawColor(120, 120, 120);
    this.doc.setLineWidth(0.25);
    this.doc.line(RAND_LINKS, this.y, RAND_LINKS + breite, this.y);
    this.y += 4;
  }
}

/* ------------------------------------------------------------------ */
/*  Erzeugen                                                           */
/* ------------------------------------------------------------------ */

/**
 * Baut das PDF. Überschriften rutschen mit den ersten beiden Zeilen des
 * folgenden Absatzes auf die nächste Seite, damit keine Überschrift
 * allein am Seitenende steht.
 */
export function baueVertragsPdf(vertrag: GesetzterVertrag, doc: jsPDF): jsPDF {
  const s = new Setzer(doc);

  s.schreibe(vertrag.titel, {
    groesse: GROESSE_TITEL,
    stil: 'bold',
    zentriert: true,
    abstandDanach: 7,
  });

  for (const a of vertrag.vorspann) {
    s.schreibe(a.text, { abstandDanach: a.block ? 4 : ABSATZ_ABSTAND });
  }

  s.y += 2;

  for (const p of vertrag.paragrafen) {
    // Überschrift plus zwei Zeilen des ersten Absatzes müssen zusammen passen.
    const ersteZeilen = Math.min(2, s.zeilen(p.absaetze[0]?.text ?? '', GROESSE_TEXT).length);
    s.brauche(ZEILE + 2 + ersteZeilen * ZEILE);

    s.schreibe(p.ueberschrift, {
      groesse: GROESSE_UEBERSCHRIFT,
      stil: 'bold',
      abstandDanach: 1.8,
    });

    for (const a of p.absaetze) {
      s.schreibe(a.text, { abstandDanach: a.block ? 3.4 : ABSATZ_ABSTAND });
    }
    s.y += PARAGRAF_ABSTAND - ABSATZ_ABSTAND;
  }

  for (const a of vertrag.nachspann) s.schreibe(a.text);

  /* Unterschriften — Ort und Datum bleiben absichtlich leer. */
  const hoeheUnterschriften = 14 + vertrag.unterschriften.length * 18;
  s.brauche(hoeheUnterschriften);
  s.y += 6;
  s.schreibe('Ort, Datum', { abstandDanach: 8 });
  s.linie();
  s.y += 6;

  for (const u of vertrag.unterschriften) {
    s.brauche(18);
    s.y += 7;
    s.linie();
    s.schreibe(`${u.rolle}: ${u.name}`, { groesse: GROESSE_FUSS, abstandDanach: 4 });
  }

  /* Seitenzahlen — erst jetzt, weil die Gesamtzahl vorher unbekannt ist. */
  const seiten = s.doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    s.doc.setPage(i);
    s.doc.setFont('helvetica', 'normal');
    s.doc.setFontSize(GROESSE_FUSS);
    s.doc.setTextColor(110, 110, 110);
    s.doc.text(`Seite ${i} von ${seiten}`, SEITE_BREITE / 2, SEITE_HOEHE - 12, {
      align: 'center',
    });
  }

  return s.doc;
}

/**
 * Legt ein leeres A4-Dokument an. jsPDF wird dabei erst nachgeladen —
 * die Bibliothek ist groß und wird nur beim Drucken gebraucht.
 */
export async function leeresDokument(): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
}

export async function vertragsPdfBlob(vertrag: GesetzterVertrag): Promise<Blob> {
  const doc = baueVertragsPdf(vertrag, await leeresDokument());
  return doc.output('blob');
}

/* ------------------------------------------------------------------ */
/*  Dateiname                                                          */
/* ------------------------------------------------------------------ */

/**
 * Macht aus Titel und Betreff einen Dateinamen, der auf iOS nicht stört.
 * Zeichen, die Dateisysteme nicht mögen, werden zu Leerzeichen.
 */
export function dateiname(titel: string, betreff = '', datum = todayISO()): string {
  const sauber = `${titel} ${betreff} ${datum}`
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Sehr lange Namen kürzen, sonst scheitert das Speichern auf manchen Geräten.
  const gekuerzt = sauber.length > 120 ? `${sauber.slice(0, 117).trimEnd()}…` : sauber;
  return `${gekuerzt}.pdf`;
}

/* ------------------------------------------------------------------ */
/*  Speichern und Teilen                                               */
/* ------------------------------------------------------------------ */

/**
 * Speichert das PDF als Anhang und verknüpft es mit dem Vertrag.
 * Ein früher erzeugtes PDF wird ersetzt — es gibt immer genau eines,
 * das zum gespeicherten Stand passt.
 */
export async function pdfAmVertragSpeichern(contract: Contract, blob: Blob): Promise<ID> {
  const anhang = await putAttachment(blob);
  const alt = contract.pdfAttachmentId;
  await patch(db.contracts, contract.id, { pdfAttachmentId: anhang.id });
  if (alt && alt !== anhang.id) {
    await db.attachments.delete(alt);
  }
  return anhang.id;
}

export type Teilergebnis = 'geteilt' | 'heruntergeladen' | 'abgebrochen';

/**
 * Teilt das PDF über die iOS-Teilen-Funktion. Wo das nicht geht,
 * wird es heruntergeladen.
 */
export async function teilenOderHerunterladen(
  blob: Blob,
  name: string,
): Promise<Teilergebnis> {
  const datei = new File([blob], name, { type: 'application/pdf' });
  const teilen = navigator.share?.bind(navigator);
  const kannTeilen = navigator.canShare?.({ files: [datei] }) ?? false;

  if (teilen && kannTeilen) {
    try {
      await teilen({ files: [datei], title: name });
      return 'geteilt';
    } catch (fehler) {
      // Abbrechen ist kein Fehler — dann passiert einfach nichts.
      if (fehler instanceof DOMException && fehler.name === 'AbortError') return 'abgebrochen';
      // Sonst der Rückfallweg.
    }
  }

  herunterladen(blob, name);
  return 'heruntergeladen';
}

/** Rückfallweg: Datei über einen unsichtbaren Verweis speichern. */
export function herunterladen(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Erst nach dem Klick freigeben, sonst bricht Safari den Download ab.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Öffnet ein gespeichertes PDF in einem neuen Tab. */
export async function pdfOeffnen(attachmentId: ID): Promise<boolean> {
  const anhang = await db.attachments.get(attachmentId);
  if (!anhang) return false;
  const url = URL.createObjectURL(anhang.blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
