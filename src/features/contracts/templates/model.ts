/**
 * Bauplan der Vertragsvorlagen.
 *
 * Eine Vorlage ist eine Liste von Paragrafen, ein Paragraf eine Liste von
 * Absätzen. Jeder Absatz und jeder Paragraf kann Bedingungen tragen —
 * so wird ein Absatz ganz zu- oder abgeschaltet, statt im Code als
 * Sonderfall behandelt zu werden.
 *
 * Der Rechtstext steht wortgetreu in den Vorlagen. Verändert werden
 * ausschließlich die Platzhalter (siehe grammar.ts).
 */

/** Schalter, die einzelne Absätze ein- oder ausblenden. */
export type Bedingung =
  /** Genau ein Käufer — Gesamtschuldner-Klauseln entfallen dann. */
  | 'einKaeufer'
  /** Mehr als ein Käufer. */
  | 'mehrereKaeufer'
  /** Eine Anzahlung ist eingetragen (kommt selten vor). */
  | 'mitAnzahlung'
  /** Keine Anzahlung. */
  | 'ohneAnzahlung'
  /** Der optionale Schlussparagraf ist gefüllt. */
  | 'zusatz'
  /** Genau ein Tier. */
  | 'einTier'
  /** Mehrere Tiere. */
  | 'mehrereTiere'
  /** Eine IBAN ist in den Einstellungen hinterlegt. */
  | 'mitIban';

export interface Absatz {
  /** Text mit Platzhaltern. Zeilenumbrüche bleiben erhalten. */
  text: string;
  /** Absatz erscheint nur, wenn ALLE Bedingungen erfüllt sind. */
  wenn?: Bedingung[];
  /**
   * Absatz ohne Blocksatz-Einzug drucken (Anschriften, Kontodaten).
   * Rein typografisch, ändert den Text nicht.
   */
  block?: boolean;
}

export interface Paragraf {
  /** Überschrift ohne Nummer — die Nummer entsteht beim Rendern. */
  titel: string;
  absaetze: Absatz[];
  wenn?: Bedingung[];
}

export interface Vertragsvorlage {
  /** Überschrift des Vertrages. */
  titel: string;
  /** Vorspann mit den Parteien. */
  vorspann: Absatz[];
  paragrafen: Paragraf[];
  /** Text unmittelbar vor dem Unterschriftenblock. */
  nachspann: Absatz[];
}
