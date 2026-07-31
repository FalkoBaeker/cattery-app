# Übergabe — Cattery App

Dieses Dokument ist der vollständige Wissensstand des Projekts. Wer hier
weiterarbeitet, soll **nichts raten müssen**.

Stand: 31.07.2026 · 164 Dateien · 42.177 Zeilen · 1.020 Tests grün ·
Typprüfung und Produktionsbau fehlerfrei.

---

# TEIL 1 — Was die App ist und können soll

## 1.1 Wer sie benutzt

Eine Züchterin von **Russisch-Blau-Katzen**, Mitglied im Verband **WCF über den
Verein Catmaniac**. Etwa **4 Würfe pro Jahr**, **5 Königinnen und 1 Kater**,
**1–9 Kitten pro Wurf**. Bisher arbeitet sie mit Papier, Stift und dem
WhatsApp-Verlauf als Gedächtnis. Ihr Mann (der Auftraggeber) nutzt gelegentlich
**dasselbe** Gerät — es gibt **keinen zweiten Zugang und keine Synchronisierung**.

Sie bewertet sich selbst als sicher im Umgang mit Apps.

## 1.2 Das eigentliche Ziel

Auf die Frage, was am jetzigen Zettel-System am meisten nervt, kam:

> „Dass Notizen untergehen."

Auf die Frage, was die App können müsste, wenn sie nur eine Sache könnte:

> „Fortlaufende Dokumentation."

**Daraus folgt die wichtigste Entwurfsentscheidung:** Jedes Objekt — Katze,
Wurf, Kitten, Interessent — hat einen **durchgehenden Zeitstrahl**, in dem alles
zusammenläuft: Gewicht, Tierarzt, Telefonat, Besuch, Notiz. Die App ist kein
Werkzeugkasten aus Einzelfunktionen, sondern ein Gedächtnis.

## 1.3 Rahmenbedingungen, die nicht verhandelbar sind

| Bedingung | Grund |
| --- | --- |
| **PWA auf einem iPhone 17, iOS 26** | ihr einziges Gerät |
| **Zum Home-Bildschirm hinzufügen** | ohne das liefert iOS keine Benachrichtigungen aus |
| **Vollständig offline** | im Wurfzimmer und beim Tierarzt ist das Netz mau |
| **Kein Server, keine Cloud, kein Konto** | ausdrücklich so gewünscht |
| **Auslieferung über GitHub Pages** | kostenlos, statisch |
| **Oberfläche vollständig deutsch** | inklusive Fehlermeldungen und Leerzuständen |
| **Dunkler Modus** | Nachtschichten am Wurfkasten |
| **Einhändig bedienbar** | die andere Hand hält ein Kitten |

**Sicherheitskritisch:** GitHub Pages liefert bei kostenlosen Konten nur aus
**öffentlichen** Repositories aus. Name, Anschrift und **IBAN** der Züchterin
dürfen deshalb **niemals im Quellcode stehen**. Sie werden einmalig in den
Einstellungen erfasst und liegen ausschließlich auf dem Gerät. Die
Vertragsvorlagen in `docs/vertrag-a.txt` und `docs/vertrag-b.txt` enthalten
deshalb nur Platzhalter.

## 1.4 Grundregeln der Fachlichkeit

**Alles ist optional.** Pro Objekt gibt es genau ein Pflichtfeld, meist der
Name. Kein Formular darf mehr erzwingen.

**Module setzen einander nicht voraus.** Ein Termin geht ohne Interessent, ein
Kitten ohne Wurf-Fahrplan, ein Wurf ohne Vater. Module lassen sich in den
Einstellungen einzeln abschalten; die Daten bleiben erhalten.

**Die App gibt keine Ratschläge.** Auf die Frage „ab wann würdest du zum
Tierarzt fahren?" kam: *„Gar nicht, weil die nicht helfen."* Die App zeigt
Zahlen und Warnfarben und drängt zu nichts. Kein „bitte kontaktieren Sie einen
Tierarzt", nirgends.

---

## 1.5 Fachbereich: Gewicht (das Herzstück)

Hier entscheidet sich, ob die App benutzt wird oder der Zettel gewinnt.

### Wiegerhythmus in der Praxis

| Zeitraum | Häufigkeit |
| --- | --- |
| Woche 1–2 | **2× täglich** |
| Woche 3–4 | alle 2 Tage |
| ab Woche 5 | gar nicht mehr |

Die Waage zeigt **1-g-Schritte**. Tage werden auch mal übersprungen (ungewollt).
Mehrere Messungen am selben Tag sind der Normalfall, nicht die Ausnahme.

**Deshalb:** Die Zunahme wird **immer über den echten Zeitabstand** gerechnet,
nie über Kalendertage. Alles andere bricht bei zwei Messungen am selben Tag oder
bei Lücken.

### Warnstufen

| Stufe | Bedingung |
| --- | --- |
| **in Ordnung** | Zunahme ≥ 7 g/Tag |
| **beobachten** | Zunahme 6–7 g/Tag |
| **auffällig** | Zunahme < 6 g/Tag · Geburtsgewicht < 80 g · ≥ 15 % unter dem Wurfdurchschnitt |
| **kritisch** | Gewichtsverlust · keine Zunahme · Geburtsgewicht nach 48 h nicht wieder erreicht |

Typisches Geburtsgewicht bei ihr: **90 g**. Ein Kitten unter **80 g** gilt als
Sorgenkind (absoluter Wert, nicht prozentual — das war eine ausdrückliche
Rückfrage).

Alle Schwellen sind in den Einstellungen änderbar.

**Warnungen erscheinen nur in der App**, nicht als Benachrichtigung.

### Kitten-Identität

Kitten werden über die **Halsbandfarbe** unterschieden, nicht über Namen —
Rufnamen werden erst später vergeben. Die Halsbandfarbe ist die primäre
Identität und wird als Farbpunkt dargestellt. Zwölf Farben sind hinterlegt.

### Der Wiege-Modus

Ein Bildschirm, eine Liste aller lebenden Kitten, je Zeile ein großes
Zahlenfeld. Nach Eingabe springt der Fokus automatisch zum nächsten Kitten.
Kein Speichern-Knopf je Zeile. Sofortige Rückmeldung („+11 g"), eingefärbt nach
Warnstufe.

**Wichtig:** Die Fokuskette orientiert sich am **laufenden Durchgang**, niemals
am Tagesfortschritt. Sonst wäre beim abendlichen Durchgang jedes Kitten schon
„erledigt" und die Kette bräche sofort ab.

### Nachtrag

Ab Woche 5 wird nicht mehr routinemäßig gewogen, Medikamente werden aber nach
Gewicht dosiert. Wiegen muss deshalb **jederzeit möglich** bleiben, und vor
Chippen (Woche 8) und Kastration (Woche 10) weist die App auf ein aktuelles
Gewicht hin.

Die **Königin** wird während der Trächtigkeit gewogen, nach der Geburt nicht.

---

## 1.6 Fachbereich: Wurf und Geburt

- Deckdatum wird notiert, wenn der Deckakt beobachtet wurde.
- **Geburtstermin = Deckdatum + 65 Tage** (einstellbar).
- **Geburtsprotokoll**: Uhrzeit je Kitten, **Wehen-Timer** mit Abständen,
  Nachgeburt, freie Notizen. Muss Bildschirmsperre und Neuladen überleben —
  alles gehört sofort in die Datenbank, nichts nur in den Speicher.
- **Totgeburten** werden erfasst. Zurückhaltend gestaltet, ohne Zynismus.
- Kein Wurfbuchstabe, keine Wurfnamen.
- Kitten werden nur in Ausnahmefällen behalten.

---

## 1.7 Fachbereich: Der 12-Wochen-Fahrplan

Das größte Entlastungs-Feature. Aus **einem einzigen Datum** — dem Geburtstag —
entsteht der komplette Ablauf:

| Woche | Was |
| --- | --- |
| 4 | Entwurmung 1 (Fenbendazol) |
| 6 | Entwurmung 2 |
| 8 | Entwurmung 3 · **Impfung 1** · **Chippen** |
| 10 | **Kastration** · **Wurfmeldung an den Verein fällig** |
| 12 | **Impfung 2** · Abgabe frühestens erlaubt |

Erinnerung **4 Tage vorher** (einstellbar). Keine dritte Impfung.

**Zwei Besonderheiten, die man kennen muss:**

1. **Die Kastration entfällt**, wenn ein Kitten mit Zuchtnutzungsvorbehalt
   abgegeben wird — Vertrag B untersagt sie ausdrücklich. Der Fahrplan muss
   deshalb pro Kitten wissen, wohin es geht, und sich beim Umstellen des
   Verkaufsstatus sofort neu berechnen.
2. **Bereits erledigte Punkte werden nie angetastet**, auch wenn sie aus dem
   Plan fallen. Wer die Kastration abgehakt hat und danach auf Zuchtvorbehalt
   umstellt, verliert den Eintrag nicht.

**Verbandsregel:** höchstens **3 Würfe je Königin in 24 Monaten**. Beim Anlegen
eines Wurfes wird gewarnt — gewarnt, nicht gesperrt.

---

## 1.8 Fachbereich: Zuchttiere

- Stammdaten: Rufname (Pflicht), Zuchtname, Geschlecht, Wurfdatum, Rasse,
  EMS-Code (Vorgabe „RUS a"), Zuchtbuchnummer, Chipnummer, Blutgruppe, Züchter,
  Status, eigenes Tier ja/nein, Notizen.
- **Rolligkeitskalender** mit Zyklusauswertung: Abstände, Mittelwert,
  Vorhersage. Bei weniger als drei Zyklen **keine** Vorhersage, sondern der
  ehrliche Hinweis, dass es zu wenig Daten sind.
- **Gesundheitstests**: HCM und PKD per Ultraschall, **halbjährlich**, dazu
  FeLV/FIV, Gentests und ein freies Feld. Je Eintrag Datum, Ergebnis,
  Gültigkeit in Monaten und die **gerechnete nächste Fälligkeit**, die in der
  Übersicht sichtbar sein muss.
- **Stammbaum: Foto genügt.** Kein digitaler Stammbaum.
- **Ahnenverlust** wird extern über **PawPeds** gerechnet und nur als
  Prozentzahl gespeichert. Anleitung dazu: `docs/pawpeds-anleitung.md`.
  Kurzfassung: pawpeds.com/db/?p=rus → oben „Test Mating" → bei „Cat 2" (Kater)
  und „Cat 3" (Königin) je „Add" → oben steht „Inbreeding = X,X %". Die Zeile
  darunter („… complete generations out of …") ist wichtiger als die Zahl —
  ein unvollständiger Stammbaum liefert einen zu niedrigen Wert.

---

## 1.9 Fachbereich: Warteliste

Meist nur **3–4 Interessenten gleichzeitig**. Also **kein Massenwerkzeug**,
sondern eine ruhige, überschaubare Liste.

- **Keine feste Warteschlange.** O-Ton: *„Wir gucken schon, was passt, wir reden
  viel mit den Interessenten."* Die Reihenfolge ist ein Hinweis, kein
  Versprechen. Sie wird **von Hand per Halten-und-Ziehen** sortiert.
- **Kontaktverlauf ist der Kern**: chronologische Einträge mit Kanal (Anruf,
  WhatsApp, E-Mail, Besuch) und Text. Das ersetzt das Nachlesen im
  WhatsApp-Verlauf.
- Zu erfassen: Allergiker, Geschlechterwunsch, familiäre Besonderheiten, andere
  Tiere, Kinder, Freigang geplant.
- **Kein Bewertungs-Widget, keine Sterne, keine Stimmungs-Tags.** Das wurde
  ausdrücklich verneint. Stattdessen ein großzügiges freies Notizfeld.
  (Hintergrund: Der Ehemann hatte „wirkte unsympathisch" gewünscht, sie hat
  verneint. Das freie Feld bedient beide.)
- **Preisnotizen sind ausdrücklich erwünscht.** Kittenpreis etwa **2.500 €**,
  nicht fix.
- **Anzahlungen im Regelfall nicht** — das Feld existiert aber, weil im
  vorliegenden Standardvertrag eine Anzahlung von 560 € steht.
- **Sammelnachricht**: mehrere auswählen, Text einmal verfassen, dann öffnet
  die App für **jeden einzeln nacheinander** WhatsApp über einen wa.me-Link.
  **Ausdrücklich kein Gruppenchat.** Der Fortschritt muss in der Datenbank
  stehen, weil iOS zwischendurch die App wechselt.
- Kontakt läuft über **WhatsApp und E-Mail**, Anfragen kommen meist über die
  **eigene Homepage**.
- Absagen kommen vor, werden aber nicht archiviert. Papierkorb mit **30 Tagen**
  als Schutz vor Vertippen. **Wichtig:** Wird der Status wieder aus „Abgesagt"
  herausgesetzt, muss der Eintrag den Papierkorb verlassen.
- **Keine** Erinnerung „lange nicht gemeldet" (wurde verneint).

---

## 1.10 Fachbereich: Termine

**Vier Besuchsgründe:** Kennenlernen · Allergietest · Kitten kennenlernen ·
Abholung. Tierarzttermine und Deckbesuche sind eigene Kategorien, keine Besuche.

Etwa so viele Abholtermine wie Kitten, plus 5–6 Kennenlerntermine je Wurf.

- **Erinnerung 24 h und zusätzlich 1 h vorher**, beide einzeln abschaltbar.
- **Nachbereitung**: Ist ein Termin vorbei, fragt die App **einmal** „Wie
  war's?". Die Antwort landet als Notiz im Verlauf des Interessenten. Nicht
  aufdringlich, wegwischbar.
- **Keine Abhol-Checkliste** (wurde verneint).
- **Keine Anbindung an den iPhone-Kalender** (wurde verneint).
- Hausregeln: Schuhe aus, Hygiene vor Ort.
- Nie mehrere Interessenten gleichzeitig.

**Zur Ehrlichkeit bei Benachrichtigungen:** Eine reine PWA ohne Server bekommt
keine echten geplanten Push-Nachrichten. Die App prüft beim Öffnen und im
Minutentakt, welche Erinnerungen fällig sind, und löst sie über die
Notification-API aus. Bereits ausgelöste werden vermerkt, damit nichts doppelt
kommt. **Das muss dem Nutzer klar gesagt werden** — inklusive der Tatsache,
dass ohne Installation auf dem Home-Bildschirm gar nichts ankommt. Zusätzlich
zeigt der Kalender fällige Erinnerungen immer auch als Karte in der App, damit
nichts allein von der Zustellung abhängt.

---

## 1.11 Fachbereich: Dokumente

- **Alles wird abfotografiert**: Stammbäume, Impfpässe, Testergebnisse,
  Verträge, Rechnungen.
- Kamera über `<input type="file" accept="image/*" capture>` — auf iOS der
  verlässliche Weg. Mehrere Seiten je Dokument.
- Nachbearbeitung mit Canvas: Zuschneiden, Drehen, Kontrast. Keine Bibliothek,
  kein maschinelles Lernen.
- **Vor dem Speichern verkleinern** (längste Kante ~2000 px, JPEG ~0,8) — ein
  iPhone-Foto hat sonst 4–5 MB.
- **Impfpass offline in Vollbild zeigen ist wichtig.** Szenario: beim Tierarzt,
  Pass zu Hause vergessen. Der Weg dorthin muss sehr kurz sein.
- Schalter „für Interessenten sichtbar" (vor allem Stammbäume der Elterntiere).

---

## 1.12 Fachbereich: Fotos und Kundenkontakt

**Kein Kunden-Link.** Das war ursprünglich geplant und wurde nach Rückfrage
verworfen: Ein Link, den ein Interessent öffnet, braucht einen Server — genau
das war nicht gewollt. Außerdem schickt sie fast täglich persönliche Updates
und will persönlich bleiben.

**Stattdessen:** Die App erzeugt auf Canvas ein **fertiges Bild** zum
Verschicken — Foto aus der iPhone-Galerie, darunter persönliche Anrede
(„Hallo Familie Schulz,"), Name bzw. Halsbandfarbe, Alter („Tag 24"), aktuelles
Gewicht, kleine Gewichtskurve, kurzer freier Text. Teilen über
`navigator.share`, Rückfallweg Herunterladen.

**Fotos werden nicht in der App archiviert** — die iPhone-Galerie reicht.

---

## 1.13 Fachbereich: Kosten

- Kosten je Wurf: Tierarzt, Notfall, Medikamente, Impfungen, Kastration,
  Deckgebühr, Futter, Zuchtbuch/Verein, Anschaffungen, Sonstiges.
- Erlöse je Kitten, Auswertung „hat sich der Wurf gerechnet".
- **Nicht fürs Finanzamt.** Schlicht halten: keine Steuerlogik, keine
  Umsatzsteuer, keine Belegpflicht-Anmutung.

---

## 1.14 Fachbereich: Verträge (der anspruchsvollste Teil)

Die Originaltexte liegen wortgetreu in `docs/vertrag-a.txt` und
`docs/vertrag-b.txt`, mit Platzhaltern statt echter Personendaten.

**Eiserne Regel:** Der Rechtstext wird **nicht verändert**. Es werden
ausschließlich Felder gefüllt und Artikel sowie Ein-/Mehrzahl angepasst. Keine
Klausel wird umformuliert, gekürzt oder „verbessert".

### Die Grammatik-Maschine

Drei unabhängige Schalter bestimmen den Text:

| Schalter | Werte | Wirkung |
| --- | --- | --- |
| Anzahl Tiere | 1 / mehrere | „zwei Kitten" ↔ „ein Kitten"; „Die Kitten sind" ↔ „Das Kitten ist" |
| Geschlecht | Kater / Katze / gemischt | „der Kater" ↔ „die Katze" ↔ „die Kitten" |
| Anzahl Käufer | 1 männlich / 1 weiblich / mehrere | „der Käufer" ↔ „die Käuferin" ↔ „die Käufer" |

**Bedingte Absätze:** Bei genau **einem** Käufer entfallen die
Gesamtschuldner-Klauseln vollständig (Vertrag B, Ende von § 2 und Ende von
§ 16) — sie ergeben mit einer Person keinen Sinn. Absätze werden also ganz
zu- oder abgeschaltet, nicht nur umformuliert.

### Vertrag A — Standardkaufvertrag

8 Paragrafen, **mehrere Kitten möglich**.

Variabel: Anzahl · Käufer (Name, Anschrift, Geburtsdatum) · je Tier Rufname,
Geschlecht, Chipnummer · Geburtsdatum · Gesamtpreis · optionale Anzahlung ·
Restsumme (gerechnet) · Übergabetermin als **freier Text** („Anfang Juni 2026",
kein Datumsfeld!) · Übergabeort.

Fest aus den Einstellungen: Verkäuferin, Anschrift, Geburtsdatum, IBAN.
§ 8 (Unterlagen) ist immer gleich.

### Vertrag B — mit vorbehaltener einmaliger Zuchtnutzung

17 Paragrafen. **Ein bis zwei Katzen, immer weiblich.** Beliebig viele Käufer.

Der wirtschaftliche Kern: Die Katze wird **günstiger** abgegeben, dafür behält
sich die Züchterin **eine einmalige Zuchtnutzung** vor.

Variabel: regulärer Kaufpreis · Preisnachlass · ermäßigter Betrag (gerechnet) ·
Verwendungszweck (automatisch: „Kaufvertrag {Katze} / {Käufer}") · **alle
Fristen einzeln einstellbar**.

Vorgaben aus dem vorliegenden Vertrag: 18 Monate Nutzungsfrist, 6 Monate
Verlängerung, 3 Kalendertage Herausgabe, 2 Deckversuche, 14 Tage Nachzahlung.

### Beide Verträge

- **Ort und Datum der Unterschrift werden immer von Hand ausgefüllt** — im PDF
  eine Leerzeile, kein vorgedrucktes Datum.
- Am Ende ein **optionaler Schlussparagraf** für individuelle Vereinbarungen,
  der nur gedruckt wird, wenn er gefüllt ist.
- Erzeugte Verträge werden **gespeichert** (PDF als Anhang in der Datenbank).
- Der Editor zeigt eine **Live-Vorschau** des erzeugten Textes.

### Der Zuchtnutzungs-Vorgang

Vertrag B ist kein Dokument, sondern ein **18-Monats-Vorgang mit Geld dran**.
Wird die Frist verpasst, entfällt der Preisnachlass (im vorliegenden Fall
1.380 €) und wird binnen 14 Tagen fällig.

Statuskette:
`Katze beim Käufer` → `zur Deckung angefordert` → `bei uns` → `gedeckt` →
`trächtig` → `Wurf da` → `kastriert` → `Eigentum übertragen` → `abgeschlossen`

Restlaufzeit groß sichtbar („noch 7 Monate"), Erinnerungen bei 6, 3 und 1 Monat
vor Fristablauf, Verlängerung um 6 Monate als Aktion. Fristbeginn ist die
erstmalige Überlassung und wird als eigenes Feld eingetragen.

---

## 1.15 Was ausdrücklich NICHT gebaut wird

Diese Punkte wurden geprüft und verworfen — nicht neu aufrollen:

Ausstellungen · Anzahlungs-Pflicht · Abhol-Checkliste · Erinnerung „lange nicht
gemeldet" · iPhone-Kalender-Anbindung · Fotoarchiv in der App · Handaufzucht ·
Übergabeprotokoll · Import alter Daten · Bewertungs-Widget für Interessenten ·
Kunden-Link · digitaler Stammbaum · Farbvererbungsrechner (Russisch Blau ist
einfarbig, es gibt nichts zu rechnen).

---

# TEIL 2 — Wie die App gebaut ist

## 2.1 Umgebung — WICHTIG

**Node liegt nicht im Standardpfad.** Es wurde lokal installiert
(v24.18.1 LTS, Prüfsumme verifiziert, kein Systemeingriff). **Jeder
Shell-Aufruf braucht:**

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

Wer das vergisst, bekommt `command not found: npm` und denkt, nichts sei
installiert.

**Zustand der Arbeitsumgebung (Stand 31.07.2026):**

| Punkt | Zustand |
| --- | --- |
| `node_modules` | **installiert** (320 MB), `npm install` ist nicht nötig |
| Git | **initialisiert**, 5 Commits, sauberer Baum |
| Git-Remote | **keiner** — GitHub-Repository existiert noch nicht |
| Node / npm | v24.18.1 / 11.16.0 unter `~/.local/node` |
| Homebrew, nvm | **nicht vorhanden** — der Rechner hat sonst keine Entwicklerwerkzeuge |
| Python 3 | vorhanden (3.9.6), wurde nur für Hilfsskripte gebraucht |

**Was zum Testen NICHT zur Verfügung steht:** ein echtes iPhone und ein
iOS-Simulator. Alles bisher Verifizierte lief im Desktop-Browser mit
Mobilgrößen-Ansichtsfenster. Damit **nicht** prüfbar sind: Kamera-Aufnahme,
die Installation auf dem Home-Bildschirm, die Notification-API im
Standalone-Kontext, `navigator.share` mit Dateien und das Verhalten der
iOS-Tastatur. Diese Dinge müssen auf dem Gerät der Züchterin geprüft werden.

| Befehl | Zweck |
| --- | --- |
| `npm run build` | Typprüfung **und** Produktionsbau |
| `npm run test` | Vitest, einmalig |
| `npm run lint` | oxlint |
| `npm run dev` | Entwicklungsserver |
| `npx tsc --noEmit -p tsconfig.app.json` | Typprüfung allein (schneller) |

Der Entwicklungsserver wird über `.claude/launch.json` gestartet
(Wrapper `.claude/dev.sh` setzt den PATH), Port **5180**.

## 2.2 Technik

React 19 · TypeScript 6 · Vite 8 · Tailwind 4 · Dexie (IndexedDB) ·
react-router mit **Hash-Routing** · dnd-kit · jsPDF · vite-plugin-pwa

**Hash-Routing ist Absicht:** GitHub Pages liefert bei `/zucht` einen 404, weil
dort keine Datei liegt. Mit `#/zucht` funktioniert Neuladen überall.

`base: './'` in `vite.config.ts` erzeugt relative Pfade, damit die App sowohl
unter `name.github.io/repo/` als auch lokal läuft.

## 2.3 Verzeichnisaufteilung und Eigentum

Beim parallelen Arbeiten mit mehreren Agenten gilt: **jede Datei hat genau
einen Besitzer.** Fremde Verzeichnisse werden gelesen, nie verändert.

| Pfad | Inhalt | Zeilen |
| --- | --- | --- |
| `src/types/` | Domänenmodell — der Vertrag zwischen allen Modulen | 806 |
| `src/db/` | Dexie-Schema, Schreibhelfer, Anhänge | 272 |
| `src/lib/` | Datum, Formatierung, Kennungen | 385 |
| `src/ui/` | gemeinsame Bausteine | 1.486 |
| `src/app/` | Hülle, Tab-Leiste, Routen | 150 |
| `src/domain/` | geteilte Fachlogik (Fahrplan, Gewicht) | 1.134 |
| `src/features/<modul>/` | ein Fachbereich je Ordner | — |

**Gilt die Eigentumsregel auch für eine einzelne Person?** Die Regel entstand
für parallel arbeitende Agenten. Wer allein arbeitet, darf die gemeinsamen
Verzeichnisse selbstverständlich ändern — aber mit Bedacht: `src/types/` und
`src/db/` sind der Vertrag, an dem elf Module hängen. Änderungen dort brauchen
einen vollständigen `npm run build` **und** `npm run test`, bevor weitergearbeitet
wird. Umgekehrt gilt weiterhin: Braucht ein Modul einen neuen Baustein,
entsteht er im Modulordner. Erst wenn ihn ein zweites Modul braucht, wandert er
nach `src/ui/`.

**Wird das Schema geändert**, muss `DB_VERSION` in `src/db/db.ts` erhöht und
eine Dexie-Migration ergänzt werden — sonst verlieren bestehende Geräte ihre
Daten. Da die App noch nicht ausgeliefert ist, ist das aktuell noch gefahrlos;
**nach der Auslieferung nicht mehr.**

## 2.4 Die Module

| Modul | Dateien | davon Tests | Zeilen |
| --- | --- | --- | --- |
| `contracts` | 21 | 9 | 6.075 |
| `litters` | 17 | 3 | 5.084 |
| `documents` | 22 | 5 | 4.696 |
| `cats` | 24 | 8 | 4.574 |
| `waitlist` | 12 | 4 | 4.185 |
| `appointments` | 12 | 4 | 3.808 |
| `weights` | 12 | 4 | 3.017 |
| `settings` | 10 | 4 | 2.916 |
| `dashboard` | 4 | 2 | 1.738 |
| `costs` | 4 | 2 | 1.605 |
| `more` | 2 | 1 | 154 |

## 2.5 Navigation

Fünf Tabs: **Heute · Zucht · Warteliste · Kalender · Mehr**

```
/                              Dashboard „Heute"
/zucht                         Würfe + Zuchttiere (Einstieg)
/zucht/katze/:catId            Katzenprofil
/zucht/wurf/:litterId          Wurf mit Fahrplan und Geburtsprotokoll
/zucht/kitten/:kittenId        Kitten-Akte
/wiegen/:litterId              Wiege-Modus
/warteliste                    Interessentenliste (sortierbar)
/warteliste/:interestId        Interessent mit Kontaktverlauf
/kalender                      Termine, zusammengeführt aus allen Quellen
/kalender/:appointmentId       Termin anlegen/bearbeiten
/mehr                          Einstiegsliste
/mehr/dokumente                Scanner und Betrachter
/mehr/vertraege                Vertragsliste
/mehr/vertraege/neu            Vertragseditor
/mehr/vertraege/:contractId    Vertragseditor
/mehr/zuchtnutzung/:id         Zuchtnutzungs-Vorgang
/mehr/kosten                   Kosten und Erlöse
/mehr/einstellungen            Einstellungen und Sicherung
```

**Neue Routen sind teuer**, weil sie in `src/app/routes.tsx` (gemeinsames
Eigentum) eingetragen werden müssen. Innerhalb eines Bildschirms wird mit
Blättern (`Sheet`) gearbeitet.

## 2.6 Datenmodell

20 Tabellen in `src/db/db.ts`, alle Typen in `src/types/index.ts`:

```
cats · heatCycles · healthTests
litters · birthEvents · kittens
weights · catWeights
careTasks
interests · interestNotes
appointments
documents · attachments
contracts · breedingUses
costs · revenues
settings · notificationLog
```

**Konventionen im Datenmodell:**

- `ISODate` = `"2026-03-03"` (reines Datum, lokale Zeitzone gemeint)
- `ISODateTime` = ISO-String mit `Z` (echter Zeitpunkt)
- **Geld immer in Cent als Ganzzahl.** Niemals Fließkomma-Euro.
- **Gewicht immer in Gramm als Ganzzahl.**
- Blobs ausschließlich in `attachments`, nie in anderen Tabellen — sonst laden
  Listenabfragen Megabytes mit.

## 2.7 Handwerksregeln

**Datum.** Nur die Helfer aus `src/lib/date.ts`. **Niemals
`new Date('2026-03-03')`** — das ist UTC und verschiebt in Deutschland um einen
Tag. `addMonths` behandelt das Monatsende korrekt (31.01. + 1 Monat = 28./29.02.).
`daysBetween` rechnet über UTC, damit Sommerzeitwechsel keine 23-/25-Stunden-Tage
erzeugen.

**Farben.** Ausschließlich semantische Marken: `bg-surface`, `text-text-dim`,
`border-border`, `text-accent`, `bg-ok-soft`, `bg-warn-soft`, `bg-alert-soft`.
**Niemals `bg-gray-100` o. Ä.** — sonst bricht der dunkle Modus.

**Bausteine.** Immer aus `../../ui` importieren. Vorhanden: `Button`,
`IconButton`, `Fab`, `Card`, `Section`, `List`, `ListRow`, `EmptyState`,
`Badge`, `ColorDot`, `Callout`, `Field`, `TextInput`, `TextArea`, `Select`,
`NumberInput`, `MoneyInput`, `Switch`, `Segmented`, `ChoiceGrid`, `Sheet`,
`Screen`, `Stack`, `Icon`, `Spinner`, plus `useToast()` und `useConfirm()`.

**Berührungsziele** mindestens 44 px hoch.

**Datenbank.** Schreiben nur über `insert`, `patch`, `remove`, `insertPlain`
aus `src/db/db.ts`. Lesen über `useLiveQuery` aus `dexie-react-hooks`.

**Ladezustände.** `useLiveQuery` liefert anfangs `undefined`. Das darf **nie**
als „leer" dargestellt werden — und man muss auf **alle** Abfragen warten, die
in eine Ansicht einfließen, nicht nur auf die erste.

**Fehler.** Kein `alert()`, kein stilles Verschlucken. Meldungen über
`useToast()`, Rückfragen über `useConfirm()`. **Jeder** Schreibvorgang gehört
in try/catch.

**Keine Netzwerkzugriffe.** Keine Schriften, Bibliotheken oder Bilder von
fremden Servern.

## 2.8 Geteilte Fachlogik in `src/domain/`

**`schedule.ts`** — `planCareTasks()` (rein), `syncLitterSchedule()` (mit DB),
`dueState()`, `isActionable()`, `checkLitterPause()`.

**`weight.ts`** — `analyzeWeights()`, `gainPerDay()`, `litterAverageWeight()`,
`dailyAverages()`, Warnstufen und Farbmarken.

Beide sind bewusst frei von React. **Wer etwas Ähnliches braucht: hier
nachschauen, nicht nachbauen.**

## 2.9 Tests

Fachlogik gehört in reine Funktionen ohne React, getestet mit Vitest,
Dateiname `<name>.test.ts` neben der Quelle.

**Randfälle, die erfahrungsgemäß brechen und deshalb geprüft gehören:**
Sommerzeitwechsel · Schaltjahr · Monatsende · leere Listen · ein einzelnes
Kitten · totgeborene Kitten · Wiegen mit Lücken · mehrere Messungen pro Tag ·
negative Zunahme · fehlende Geburtsdaten · 9 Kitten gleichzeitig · sehr lange
Namen.

---

# TEIL 3 — Was gemacht wurde

## 3.1 Vorgehen

Das Fundament (Datenmodell, Datenbank, Design-System, App-Hülle, geteilte
Fachlogik) wurde zuerst und **von Hand** gebaut — parallele Agenten auf einem
leeren Ordner produzieren sonst Bruchstücke, die nicht zusammenpassen.

Danach acht Fachmodule parallel durch je einen Umsetzer-Agenten, mit je einem
strengen Prüf-Agenten und Nachbesserungsschleifen.

## 3.2 Was schiefging

**Das Monatslimit des Kontos wurde mitten im Lauf erreicht.** 13 von 25 Agenten
starben daran:

| Phase | Ergebnis |
| --- | --- |
| 8 Umsetzer | 7 sauber durch; `contracts` starb **nach** getaner Arbeit |
| 8 Prüfer, Runde 1 | **5 durch** — `documents`, `system` und `contracts` nie geprüft |
| 8 Nachbesserer | **alle 8 gestorben** — kein Befund wurde eingearbeitet |
| 8 Prüfer, Runde 2 | alle gestorben |

Zwei Nachbesserer starben **mitten in einer Korrektur** und hinterließen halb
umgebaute Dateien. Der Build war danach mit **25 Typfehlern** kaputt.

**Ein Entwurfsfehler meinerseits:** Ich habe Prüf-Agenten parallel zu noch
schreibenden Umsetzern im selben Arbeitsverzeichnis laufen lassen. Dadurch
haben Prüfer teilweise veraltete Zwischenstände gelesen und Mängel gemeldet,
die es zu dem Zeitpunkt schon nicht mehr gab. **Wer das wiederholt, sollte
Prüfer erst nach Abschluss aller Umsetzer starten oder mit
`isolation: 'worktree'` arbeiten.**

## 3.3 Reparaturen von Hand

Nach dem Abbruch habe ich selbst:

**Build wieder hergestellt** — 25 Typfehler und 1 fehlschlagender Test:
- `HeatSheet.tsx`: halb umgestellte Fehlerbehandlung zu Ende geführt, Meldungen
  hängen jetzt am richtigen Feld
- `KittenDetailScreen.tsx`: Verweis auf eine nie existierende `Sparkline` durch
  `WeightChart` ersetzt, handgebaute Wiegeliste durch `WeightHistory`
  (entfernt Doppelung, bringt Bearbeiten/Löschen), `DailyNode.last` → `.grams`
- Kalender-Test erwartete ein Feld `badge`, das es im Entwurf nie gab
- `CatEditorSheet`-Test schrieb noch das fehlerhafte Verhalten fest
- Hilfsskript `__vorschau.test.ts` entfernt

**7 echte Prüferbefunde behoben:**
1. **Erinnerungen kamen praktisch nie an** — der Prüflauf hing am
   Kalender-Bildschirm. Läuft jetzt in `AppLayout`, also sobald die App offen ist.
2. **Zurückgenommene Absage blieb für immer im Papierkorb** — `deletedAt` wurde
   nie gelöscht.
3. dnd-kit rendert **englische Vorlesetexte** — jetzt deutsch.
4. Zwei Schreibvorgänge im Kitten-Profil (verstorben vermerken / aufheben)
   ohne try/catch.
5. Ladezustand des Zeitstrahls im Katzenprofil wartete nur auf drei von sechs
   Abfragen.
6. Nächste Fälligkeit der Gesundheitstests fehlte in der Übersicht.
7. Aufgeklappter Zeitstrahl ließ sich nicht wieder zuklappen.

**Selbst gefunden beim Durchgang im Browser:**
- Ein Wurf ohne Fahrplan zeigte „Kein Fahrplan vorhanden" mit dem Knopf
  „Geburtsdatum eintragen" — obwohl das Datum da war. Sackgasse. Jetzt
  „Fahrplan erstellen".

**3 Befunde als Fehlalarm belegt** (nicht geglaubt, sondern nachgerechnet):
- „Fokuskette beim Wiegen bricht im zweiten Durchgang zusammen" — der bemängelte
  Code (`savedNowRef`) existiert nicht mehr, es wird bereits `roundRef` benutzt.
- „Wechsel der Terminart behält alte Bezüge" — `linksForKind` räumt auf, beim
  Wechsel **und** beim Speichern.
- „`toggleCancelled` ohne try/catch" — hat sehr wohl try/catch.

Für alle drei fehlten Tests. Die sind jetzt da.

## 3.4 Nebenbei erledigt

- **PawPeds-Anleitung** (`docs/pawpeds-anleitung.md`) — auf der echten Seite
  verifiziert, nicht aus dem Gedächtnis geschrieben.
- **App-Symbole** selbst gerastert (PNG-Kodierung von Hand, ohne Bildbibliothek).
- **Vertragsvorlagen** aus den PDFs übernommen, Personendaten und IBAN durch
  Platzhalter ersetzt.

---

# TEIL 4 — Was offen ist

## 4.1 Nie unabhängig geprüft

Drei Module haben **kein zweites Augenpaar** gesehen:

| Modul | Warum das zählt |
| --- | --- |
| **contracts** (6.075 Zeilen) | Der heikelste Teil. Rechtstexte, Grammatik-Maschine, PDF-Erzeugung, Fristenrechnung. Hat 9 eigene Testdateien, aber keine Fremdprüfung. |
| **documents** (4.696 Zeilen) | Kamera, Canvas-Bearbeitung, Bildverkleinerung, Teilen-Funktion. |
| **system** (dashboard, settings, costs, more) | Dashboard, Sicherung, Wiederherstellung, Modulschalter. |

## 4.2 Nicht selbst im Browser durchgespielt

Ich habe **nicht** verifiziert und will es deshalb nicht behaupten:

- **PDF-Erzeugung eines echten Vertrags** — insbesondere: Kommen Umlaute und ß
  korrekt heraus? Stimmen Seitenumbrüche? Passt die Grammatik in beiden
  Vertragsarten bei allen Schalterstellungen?
- **Dokumenten-Scanner** — Kamera, Zuschnitt, Mehrseitigkeit, Vollbild offline.
- **Sicherungs-Rundlauf** — Sichern, Datei ablegen, Wiederherstellen, inklusive
  Anhängen.
- **WhatsApp-Bild-Erzeugung** auf Canvas.
- **Sammelnachricht** an mehrere Interessenten.
- **Geburtsprotokoll mit Wehen-Timer.**

Verifiziert **ist**: Start der App, Erst-Einführung, Installations-Assistent,
Tab-Navigation, Zucht-Übersicht, Wurf-Detail, Fahrplan-Leerzustand.

## 4.3 Bekannte Mängel und Doppelungen

- **Drei Module haben je ein eigenes `useSettings` gebaut**
  (`cats/hooks.ts`, `litters/hooks.ts`, `settings/useSettings.ts`) mit
  unterschiedlichen Signaturen. Gehört zusammengeführt, am besten nach
  `src/db/`.
- **Der Zucht-Tab benutzt nicht die Bausteine des Katzen-Moduls.**
  `cats/index.ts` exportiert `CatRow` und `CatEditorSheet` ausdrücklich dafür,
  `ZuchtScreen.tsx` hat stattdessen eigene `CatGroup`-Zeilen und ein eigenes
  `CatQuickSheet` gebaut. Deren Kommentar („Das Katzen-Modul exportiert (noch)
  kein eigenes Editor-Blatt") ist inzwischen falsch.
- **`WeightChart`**: Der helle Saum unter der Kurve wird nur gezeichnet, wenn
  `focusKittenId` gesetzt ist. Auf der Wurfkurve wird das nie übergeben — dort
  liegt die Linie ohne Saum auf der Fläche.
- **`collectOrphanAttachments()`** aus `src/db/db.ts` hat im ganzen Projekt
  keinen Aufrufer. Verwaiste Foto-Anhänge bleiben liegen.
- **Rund 56 kleinere Prüferbefunde** aus den fünf gelaufenen Prüfungen sind
  nicht abgearbeitet. Sie liegen im Arbeitsprotokoll des Workflows:
  ```
  ~/.claude/projects/-Users-falkobaeker-Cattery-App/
    dd367494-cf35-40d3-a60d-91fb73315e59/subagents/workflows/
    wf_330177a2-127/journal.jsonl
  ```
  Auslesen lassen sie sich mit einem kurzen Node-Einzeiler über die Zeilen mit
  `"type":"result"`; die Prüfergebnisse tragen ein Feld `minor` (Array von
  Texten) und `blocking`. **Sie sind ungesichtet:** Schweregrad, Verteilung auf
  die Module und mögliche Überschneidungen mit den bereits behobenen sieben
  Befunden sind unbekannt. Vor dem Abarbeiten also erst einmal lesen und
  sortieren. Betroffen sind nur `cats`, `litters`, `weights`, `waitlist`,
  `appointments` — die anderen drei Module wurden nie geprüft.

- **Nicht verifiziert: ob der Vertragsgenerator wirklich den Vorlagentext
  erzeugt.** In `docs/vertrag-a.txt` und `docs/vertrag-b.txt` liegen die
  abgetippten Originaltexte, und die Regel „Rechtstext wird nicht verändert"
  steht überall — aber niemand hat ein erzeugtes PDF gegen die Vorlage gelegt.
  Genau das ist Schritt 2 der Empfehlung in 4.5.
- **Hauptbündel 819 kB** (250 kB gzip). jsPDF und html2canvas sind bereits
  ausgelagert. Für eine einmal installierte Offline-App vertretbar, aber
  Routen-Aufteilung wäre möglich.

## 4.4 Noch nicht ausgeliefert

Die App läuft **nur lokal**. Für den Einsatz fehlt:

1. GitHub-Repository anlegen (öffentlich — **prüfen, dass keine Personendaten
   im Code stehen**; sie stehen es aktuell nicht).
2. GitHub Actions für den Bau nach `dist/` und Veröffentlichung auf Pages.
3. `base` in `vite.config.ts` steht auf `'./'` und funktioniert damit unter
   jedem Unterpfad — kein Eingriff nötig.
4. Die Züchterin öffnet die Seite in **Safari** und wählt
   **Teilen → Zum Home-Bildschirm**. Ohne diesen Schritt kommen **keine**
   Erinnerungen an. Der Assistent in der App erklärt das.
5. Danach: Einstellungen ausfüllen (Verkäuferdaten für die Verträge),
   5 Königinnen und 1 Kater anlegen.

## 4.5 Empfehlung für den nächsten Schritt

**Leitgedanke: Zuerst das prüfen, dessen Versagen still und unumkehrbar wäre.**

Die meisten offenen Punkte melden sich von selbst — ein hakeliger Scanner, ein
schiefes WhatsApp-Bild, ein umständlicher Wehen-Timer fallen sofort auf und
richten keinen Schaden an. Dafür ist Praxiserfahrung tatsächlich der bessere
Prüfer als jeder Agent.

**Zwei Bereiche verhalten sich anders**, und die gehören deshalb vor die
Auslieferung:

1. **Sicherung: Rundlauf einmal vollständig durchspielen.** Sichern, Datei
   ablegen, Datenbank leeren, wiederherstellen — mit Anhängen. Ein kaputtes
   Backup fällt erst auf, wenn es gebraucht wird. Auf einem einzigen Gerät ohne
   Synchronisierung heißt das: Totalverlust ohne zweite Chance. Das ist der
   einzige Fehler in diesem Projekt, der nicht reparabel wäre.
2. **Verträge: beide Arten als PDF erzeugen und lesen.** Umlaute und ß,
   Seitenumbrüche, und die Grammatik bei allen Schalterstellungen —
   insbesondere ein Kitten / mehrere, Kater / Katze, ein Käufer / mehrere
   (dabei müssen die Gesamtschuldner-Absätze verschwinden). Ein falscher
   Vertrag wird unterschrieben, bevor jemand den Fehler bemerkt, und hat
   Geld- und Rechtswirkung.

3. **Vor dem ersten Push selbst nach Personendaten suchen.** Nicht darauf
   vertrauen, dass hier „stehen aktuell keine drin" steht — nachsehen:
   ```bash
   grep -rniE "kaiser|rangsdorf|hochwaldpromenade|DE[0-9]{2}[ 0-9]{16,}" src/ docs/ index.html
   ```
   Ein öffentliches Repository ist nicht zurückholbar.

4. **Ausliefern**: Repository anlegen, GitHub Actions für Bau und Pages,
   danach gemeinsam mit der Züchterin „Teilen → Zum Home-Bildschirm" durchgehen.
   Dieser Schritt ist unter iOS unintuitiv und gleichzeitig die Bedingung dafür,
   dass überhaupt Erinnerungen ankommen — er sollte nicht per Anleitung aus der
   Ferne passieren.

5. **Einstellungen und Zuchttiere gemeinsam mit ihr befüllen**, nicht vorab
   allein. Dabei beobachten, ob die Annahmen tragen.

6. **Dann Praxisbetrieb.** Die drei ungeprüften Module (`documents`, `system`,
   `contracts`) danach durch Prüf-Agenten schicken — **nacheinander und nicht
   parallel zu schreibenden Agenten** (siehe 3.2). Die kleineren Befunde
   priorisiert nach dem, was im Alltag tatsächlich auffällt, nicht nach der
   Reihenfolge im Protokoll.

### Die Sicherung testen — konkret

Format: **eine einzelne JSON-Datei**, Dateiname
`cattery-sicherung-JJJJ-MM-TT.json`, mit einem Versionsfeld. Anhänge (Fotos,
Scans, Vertrags-PDFs) stecken base64-kodiert mit drin, weshalb die Datei groß
werden kann. Beim Wiederherstellen wird die Version geprüft; eine Datei aus
einer neueren App-Version wird mit Meldung abgelehnt.

Zu prüfen ist mindestens: Rundlauf mit Anhängen · leere Datenbank · beschädigte
Datei · Datei mit zu hoher Version · dass die Oberfläche während des Vorgangs
nicht einfriert.

---

# TEIL 5 — Offene Fragen an die Nutzer

**Ansprechpartner ist der Ehemann der Züchterin**, der das Projekt beauftragt
hat und über diesen Chat erreichbar ist. Die Züchterin selbst wurde bisher nur
mittelbar über einen Fragebogen einbezogen (`docs/FRAGENKATALOG.md`, 128 Fragen,
beantwortet). Wer etwas direkt von ihr braucht, muss es über ihn ausrichten —
es gibt keinen direkten Kanal und keine bekannte Verfügbarkeit.

Nichts davon blockiert die Arbeit, aber es sollte irgendwann geklärt werden:

1. **Stehen die Zuchttiere überhaupt in PawPeds?** Wenn nicht, funktioniert die
   Testpaarung nicht und die Ahnentafeln müssten erst eingereicht werden.
2. **Welche Gesundheitstests genau?** Die Antwort war „alles, wir züchten
   verantwortungsbewusst". Umgesetzt sind HCM, PKD, FeLV/FIV, Gentest und ein
   freies Feld. Ob das ihrer Praxis entspricht, ist unbestätigt.
3. **Die WCF-/Catmaniac-Fristen** (12 Wochen Abgabe, 2 Impfungen, Wurfmeldung
   bis Woche 10, 3 Würfe in 2 Jahren) stammen aus ihrer Erinnerung, nicht aus
   der Zuchtordnung. Sie sind deshalb **alle frei einstellbar** gebaut.
4. **Warnschwellen beim Gewicht** (7 / 6 / 80 g) sollten nach den ersten
   echten Würfen überprüft werden.
