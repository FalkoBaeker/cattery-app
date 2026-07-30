# Anforderungen

Ergebnis des Fragenkatalogs (128 Fragen, beantwortet). Die Nummern in Klammern
verweisen auf die Frage in [FRAGENKATALOG.md](FRAGENKATALOG.md).

## Wer und wofür

Züchterin von **Russisch Blau**, Verband **WCF über den Verein Catmaniac**.
Etwa **4 Würfe pro Jahr** (F1), **5 Königinnen und 1 Kater** (F2/F3),
**1–9 Kitten pro Wurf** (F4). Bisher Papier, Stift und WhatsApp-Verlauf.

Das eigentliche Ziel, in ihren Worten:

> „Dass Notizen untergehen" ist das Problem (F6) — „fortlaufende Dokumentation"
> ist die Lösung (F7).

Daraus folgt die wichtigste Architekturentscheidung: **Jedes Objekt (Katze,
Wurf, Kitten, Interessent) hat einen durchgehenden Zeitstrahl**, in dem alles
zusammenläuft — Gewicht, Tierarzt, Telefonat, Besuch, Notiz. Nichts geht verloren.

## Gewicht (Kernbereich)

| Punkt | Wert | Frage |
| --- | --- | --- |
| Wiegen Woche 1–2 | 2× täglich | F8 |
| Wiegen Woche 3–4 | alle 2 Tage | F9 |
| Ab Woche 5 | gar nicht mehr | F10 |
| Wiegen endet | Woche 4–5 | F11 |
| Waage | 1-g-Schritte | F13 |
| Zunahme in Ordnung | ab 6–7 g/Tag | F14 |
| Zunahme kritisch | darunter | F15 |
| Typisches Geburtsgewicht | 90 g | F17 |
| Sorgenkind | unter **80 g** (absolut, nicht Prozent) | F18 |

- Unterscheidung der Kitten über die **Halsbandfarbe** (F21) — Rufnamen kommen
  erst später (F33). Die Halsbandfarbe ist die primäre Identität.
- Mehrfach am Tag wiegen kommt vor (F24), Tage werden auch mal übersprungen
  (F23). Zunahme deshalb **über echtes Zeitdelta** rechnen, nicht über
  Kalendertage.
- Prozentuale Zunahme seit Geburt anzeigen (F20).
- Warnungen **nur in der App**, keine Benachrichtigung (F22).
- Königin wird während der Trächtigkeit gewogen (F31), nach der Geburt nicht (F19).
- **Kein Tierarzt-Ratschlag.** Auf F16 („wann würdest du zum Tierarzt?")
  antwortete sie: „Gar nicht, weil die nicht helfen." Die App zeigt Zahlen und
  Farben und drängt zu nichts.
- Nach Woche 5 wird nicht mehr gewogen, Medikamente werden aber nach Gewicht
  dosiert (F45). Wiegen muss deshalb **jederzeit möglich** bleiben, und vor
  Chippen (W8) und Kastration (W10) fragt die App einmal nach einem Gewicht.

## Wurf und Geburt

- Deckdatum wird notiert, wenn beobachtet (F25); Geburtstermin = Deckdatum
  **+ 65 Tage** (F26/F27).
- Geburtsprotokoll mit Uhrzeit je Kitten (F28) und **Wehen-Timer** (F29).
- Totgeburten werden erfasst (F30).
- Kein Wurfbuchstabe, keine Wurfnamen (F32).
- Kitten werden nur in Ausnahmefällen behalten (F34).

## Fahrplan — aus dem Geburtsdatum erzeugt

| Woche | Was | Frage |
| --- | --- | --- |
| 4 | Entwurmung 1 (Fenbendazol) | F35/F38 |
| 6 | Entwurmung 2 | F35 |
| 8 | Entwurmung 3 · **Impfung 1** · **Chippen** | F35/F39/F42 |
| 10 | **Kastration** · **Wurfmeldung fällig** | F127/F111 |
| 12 | **Impfung 2** · Abgabe frühestens erlaubt | F40/F109 |

- Erinnerung **3–4 Tage vorher** (F43/F44).
- Keine dritte Impfung (F41).
- **Kastration entfällt**, wenn das Kitten mit Zuchtnutzungsvorbehalt abgegeben
  wird — Vertrag B untersagt sie ausdrücklich.
- Verbandsregel: **max. 3 Würfe je Königin in 2 Jahren** (F112). Warnung beim
  Planen einer Verpaarung, die das reißen würde.

## Zuchttiere

- Felder: Zuchtname, Rufname, Zuchtbuchnummer, Chip, EMS, Wurfdatum, Züchter,
  Farbe (F52).
- Rolligkeit wird erfasst, Zyklus soll ausgewertet werden (F53/F54).
- Fremde Deckkater nur in Ausnahmefällen (F55).
- Stammbaum: **Foto genügt** (F56), 4 Generationen interessant (F57).
  Ahnenverlust ist wichtig (F58), wird aber **extern über PawPeds** gerechnet —
  die App speichert nur das Ergebnis als Prozentzahl.
- Gesundheitstests: **HCM** und **PKD** per Ultraschall, **halbjährlich** (F47,
  F127), dazu FeLV/FIV und ein freies Feld für weitere Tests.
- Anfangs einzupflegen: 5 Königinnen + 1 Kater (F60).

## Warteliste

- Meist **3–4 Interessenten** gleichzeitig (F61) — also eine kurze, überschaubare
  Liste, kein Massenwerkzeug.
- Keine feste Warteschlange: „wir gucken schon, was passt, wir reden viel mit den
  Interessenten" (F62). Die Reihenfolge ist ein Hinweis, kein Versprechen.
- **Keine Anzahlungen** im Regelfall (F63) — das Feld existiert aber, weil im
  vorliegenden Standardvertrag eine Anzahlung von 560 € steht. Optional.
- Preis nicht fix, **etwa 2.500 € je Kitten** (F65/F66). Preisnotizen pro
  Interessent sind ausdrücklich erwünscht (F68).
- Zu erfassen: Allergiker, Geschlechterwunsch, familiäre Besonderheiten (F69),
  dazu der volle Fragebogen (F77).
- **Kein Bewertungs-Widget** (F70) — nur ein freies Notizfeld. (Der Wunsch nach
  „wirkte unsympathisch" kam vom Ehemann, sie hat verneint; das freie Feld
  bedient beides.)
- Reihenfolge **von Hand verschiebbar** (F72).
- Keine Erinnerung „lange nicht gemeldet" (F73).
- Kontakt über **WhatsApp und E-Mail** (F75).
- Sammelnachricht an mehrere, aber **als Einzelnachrichten, kein Gruppenchat**
  (F76).
- Interessenten melden sich auch vor geplanten Würfen (F78); Quelle meist die
  **eigene Homepage** (F79).
- Absagen kommen vor (F80), werden aber nicht archiviert (F71) — Papierkorb mit
  30 Tagen als Schutz vor Vertippen.

## Termine

- Vier Besuchsgründe (F82): **Kennenlernen**, **Allergietest**,
  **Kitten kennenlernen**, **Abholung**. Tierarzttermine sind eine eigene
  Kategorie, kein Besuch.
- Etwa so viele Abholtermine wie Kitten, plus 5–6 Kennenlerntermine je Wurf (F81).
- Erinnerung **24 h** und zusätzlich **1 h** vorher (F83/F84).
- Nach dem Termin fragt die App einmal nach, die Antwort landet im Verlauf des
  Interessenten (F85).
- Keine Abhol-Checkliste (F86).
- Hausregeln: Schuhe aus, Hygiene vor Ort (F88).
- **Keine Anbindung an den iPhone-Kalender** (F89) — die Erinnerungen kommen aus
  der App selbst und setzen deshalb die Installation auf dem Home-Bildschirm voraus.
- Nie mehrere Interessenten gleichzeitig (F90).

## Dokumente

- Alles wird abfotografiert (F91): Stammbäume, Impfpässe, Testergebnisse,
  Verträge, Rechnungen.
- Interessenten dürfen die Stammbäume der Elterntiere sehen (F92).
- **Impfpass offline in Vollbild zeigen ist wichtig** (F93) — Szenario: beim
  Tierarzt, Pass zu Hause vergessen.
- Kein Übergabeprotokoll; ein Gesundheitszeugnis wird zur Einsicht vorgelegt (F96).

## Fotos und Kundenkontakt

- Fotos bleiben in der **iPhone-Galerie**, nicht in der App (F99).
- **Kein Kunden-Link.** Sie schickt fast täglich persönliche Updates (F103) und
  will persönlich bleiben (F101). Stattdessen: die App erzeugt ein **fertiges
  Bild** (Foto + Name + Alter + Gewicht + kleine Kurve + persönliche Anrede),
  das über die Teilen-Funktion in WhatsApp geht.

## Kosten

- Kosten je Wurf werden erfasst (F104): Tierarzt, Notfälle, Medikamente,
  Impfungen, Kastration, Anschaffungen, Sonstiges (F105).
- **Nicht fürs Finanzamt** (F106), aber mit Auswertung „hat sich der Wurf
  gerechnet" (F107).

## Verband

- Abgabe ab **12 Wochen** (F109), **2 Impfungen** vorher (F110).
- **Wurfmeldung bis zur 10. Woche** (F111).
- **3 Würfe in 2 Jahren** (F112). Erinnerung an diese Fristen erwünscht (F113).
- **Keine Ausstellungen** (F114/F115/F126).

## Technik und Alltag

- iPhone 17, iOS 26 (F116/F117), nur dieses eine Gerät (F118).
- Der Ehemann nutzt gelegentlich **dasselbe** Gerät — **kein zweiter Zugang,
  keine Synchronisierung** (Klarstellung im Verlauf).
- Datenhaltung egal (F120), Oberfläche deutsch (F121), **dunkler Modus** nötig
  (F122).
- **Keine Altdaten** werden nachgetragen (F123) — die App startet leer. Eine
  eigene Referenzkurve aus früheren Würfen entsteht erst mit der Zeit.
- Sicherung: **Datei nach iCloud Drive**, Erinnerung alle 14 Tage.
- Auslieferung über **GitHub Pages**, danach „Zum Home-Bildschirm hinzufügen".
  Weil das Repository öffentlich ist, dürfen **Name, Anschrift und IBAN niemals
  im Quellcode stehen** — sie werden einmalig in den Einstellungen erfasst und
  liegen nur auf dem Gerät.

## Verträge

Zwei Vertragsarten, beide als Vorlage hinterlegt und als PDF erzeugt.
Erzeugte Verträge werden **gespeichert** (Antwort 6).

### Grammatik

Der Text passt sich an drei unabhängigen Schaltern an:

| Schalter | Werte | Wirkung |
| --- | --- | --- |
| Anzahl Tiere | 1 / mehrere | „zwei Kitten" ↔ „ein Kitten"; „Die Kitten sind" ↔ „Das Kitten ist" |
| Geschlecht | Kater / Katze / gemischt | „der Kater" ↔ „die Katze" ↔ „die Kitten" |
| Anzahl Käufer | 1 männlich / 1 weiblich / mehrere | „der Käufer" ↔ „die Käuferin" ↔ „die Käufer" |

Bei **einem** Käufer entfallen die Gesamtschuldner-Klauseln vollständig
(Vertrag B, § 2 Ende und § 16 Ende) — sie ergeben mit einer Person keinen Sinn.
Solche Absätze werden ganz zu- oder abgeschaltet, nicht nur umformuliert.

**Der Rechtstext wird nicht verändert.** Es werden ausschließlich Felder gefüllt
und Artikel sowie Ein-/Mehrzahl angepasst. Keine Klausel wird umformuliert.

### Vertrag A — Standardkaufvertrag

Kurz, 8 Paragrafen, mehrere Kitten möglich.
Variable Felder: Anzahl Kitten · Käufer (Name, Anschrift, Geburtsdatum) ·
je Kitten Rufname, Geschlecht und Chipnummer · Geburtsdatum · Gesamtpreis ·
optionale Anzahlung · Restsumme (gerechnet) · Übergabetermin als **freier Text**
(„Anfang Juni 2026") · Ort und Datum der Unterschrift.
Feste Angaben aus den Einstellungen: Verkäuferin, Anschrift, Geburtsdatum, IBAN,
Übergabeort. § 8 (Unterlagen) ist immer gleich.

### Vertrag B — mit vorbehaltener einmaliger Zuchtnutzung

17 Paragrafen. **Ein bis zwei Katzen, immer weiblich** (Antwort 1).
Beliebig viele Käufer, Grammatik passt sich an (Antwort 2).
Variable Felder: Käufer · Katze (Name, Geschlecht, Geburtsdatum, Chipnummer) ·
regulärer Kaufpreis · Preisnachlass · ermäßigter Betrag (gerechnet) ·
Verwendungszweck (automatisch: „Kaufvertrag {Katze} / {Käufer}").
**Alle Fristen individuell einstellbar** (Antwort 3), Vorgaben aus dem
vorliegenden Vertrag: 18 Monate Nutzungsfrist, 6 Monate Verlängerung,
3 Kalendertage Herausgabe, 2 Deckversuche, 14 Tage Nachzahlung.

**Ort und Datum werden immer von Hand ausgefüllt** (Antwort 4) — bei beiden
Vertragsarten eine Leerzeile im PDF.

Am Ende beider Verträge ein **optionaler Schlussparagraf** für individuelle
Vereinbarungen, der nur gedruckt wird, wenn er gefüllt ist.

### Zuchtnutzungs-Vorgang

Vertrag B erzeugt einen laufenden Vorgang mit Frist. Fristbeginn wird als
Baustein eingetragen (Antwort 5).

Statuskette: `Katze beim Käufer` → `zur Deckung angefordert` → `bei uns` →
`gedeckt` → `trächtig` → `Wurf da` → `kastriert` → `Eigentum übertragen` →
`abgeschlossen`.

Restlaufzeit sichtbar („noch 7 Monate"), Erinnerungen bei 6, 3 und 1 Monat vor
Fristablauf. Hintergrund: Wird die Frist verpasst, entfällt der Preisnachlass
von 1.380 € und wird binnen 14 Tagen fällig.
