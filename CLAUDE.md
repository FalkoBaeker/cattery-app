# Cattery App — Arbeitsregeln

Zuchtverwaltung für eine Russisch-Blau-Züchterin. Läuft als PWA auf **einem**
iPhone 17 (iOS 26), wird zum Home-Bildschirm hinzugefügt, arbeitet vollständig
offline. **Kein Server, keine Synchronisierung, kein Konto.** Alles liegt in
IndexedDB auf dem Gerät.

Die fachlichen Anforderungen stehen in **[docs/ANFORDERUNGEN.md](docs/ANFORDERUNGEN.md)** —
das ist die Wahrheit. Bei Widerspruch zwischen Code und Anforderungen gewinnen
die Anforderungen.

## Umgebung

Node liegt **nicht** im Standardpfad. Jeder Shell-Aufruf braucht:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

| Befehl | Zweck |
| --- | --- |
| `npm run build` | Typprüfung **und** Produktionsbau. Muss immer fehlerfrei sein. |
| `npm run test` | Vitest, einmalig |
| `npm run lint` | oxlint |
| `npm run dev` | Entwicklungsserver |

## Technik

React 19 · TypeScript 6 · Vite 8 · Tailwind 4 · Dexie (IndexedDB) ·
react-router (Hash-Routing) · dnd-kit · jsPDF · vite-plugin-pwa

## Verzeichnisaufteilung — bitte strikt einhalten

Beim parallelen Arbeiten gilt: **jede Datei hat genau einen Besitzer.**
Fremde Verzeichnisse werden gelesen, aber nie verändert.

| Pfad | Inhalt | Änderbar von |
| --- | --- | --- |
| `src/types/` | Domänenmodell | **nur nach Absprache** |
| `src/db/` | Dexie-Schema, Schreibhelfer | **nur nach Absprache** |
| `src/lib/` | Datum, Formatierung, Kennungen | **nur nach Absprache** |
| `src/ui/` | gemeinsame Bausteine | **nur nach Absprache** |
| `src/app/` | Hülle, Tab-Leiste, Routen | **nur nach Absprache** |
| `src/features/<modul>/` | ein Fachbereich | dessen Modul-Agent |

Braucht ein Modul einen neuen gemeinsamen Baustein, entsteht er **im eigenen
Modulordner**. Erst wenn ihn ein zweites Modul braucht, wandert er nach `src/ui/`.

## Konventionen

**Sprache.** Die gesamte Oberfläche ist deutsch — Beschriftungen, Meldungen,
Fehlertexte, Leerzustände. Kommentare und Bezeichner im Code ebenfalls deutsch,
soweit sie Fachbegriffe sind (`wurf`, `kitten`); technische Bezeichner bleiben
englisch (`onClick`, `useState`). Keine Anglizismen in der Oberfläche.

**Farben.** Ausschließlich die semantischen Marken benutzen:
`bg-surface`, `text-text-dim`, `border-border`, `text-accent`, `bg-ok-soft`, …
Niemals `bg-gray-100`, `text-red-500` o. Ä. — sonst bricht der dunkle Modus.

**Bausteine.** Immer aus `../../ui` importieren, nie eigene Knöpfe oder
Eingabefelder bauen. Fehlt etwas, erst prüfen, ob sich ein vorhandener
Baustein erweitern lässt.

**Berührungsziele.** Alles Antippbare mindestens 44 px hoch. Die App wird
einhändig bedient, oft mit einem Kitten in der anderen Hand.

**Datenbank.** Schreiben nur über `insert`, `patch`, `remove`, `insertPlain`
aus `src/db/db.ts`. Lesen in Komponenten über `useLiveQuery` aus
`dexie-react-hooks`, damit die Oberfläche automatisch nachzieht.

**Datum.** Nur die Helfer aus `src/lib/date.ts`. Niemals `new Date('2026-03-03')`
(das ist UTC und verschiebt in Deutschland um einen Tag). Reine Daten als
`YYYY-MM-DD`, Zeitpunkte als ISO-String mit `Z`.

**Geld.** Immer in Cent als Ganzzahl rechnen und speichern. Anzeige über
`formatMoney`. Niemals Fließkomma-Euro.

**Gewicht.** Immer Gramm als Ganzzahl.

**Alles ist optional.** Pro Objekt gibt es genau ein Pflichtfeld (meist der
Name). Kein Formular darf mehr erzwingen. Module dürfen sich nicht gegenseitig
voraussetzen — ein Termin geht ohne Interessent, ein Kitten ohne Wurf-Fahrplan.

**Fehler.** Kein `alert()`, kein stilles Verschlucken. Fehler über `useToast()`
melden, Rückfragen über `useConfirm()`.

**Keine Netzwerkzugriffe.** Keine Schriften, Bibliotheken oder Bilder von
fremden Servern. Die App muss im Flugmodus vollständig funktionieren.

## Tests

Fachlogik (Berechnungen, Fahrplan, Warnstufen, Grammatik, Fristen) gehört in
reine Funktionen **ohne React** und wird mit Vitest getestet. Dateiname
`<name>.test.ts` neben der Quelldatei. Für Oberflächen genügen Tests der
kniffligen Interaktionen.

Randfälle, die erfahrungsgemäß brechen und deshalb geprüft gehören:
Sommerzeitwechsel, Schaltjahr, Monatsende (31.01. + 1 Monat), leere Listen,
ein einzelnes Kitten, tote Kitten, Wiegen mit Lücken, mehrere Messungen pro Tag,
negative Zunahme, fehlende Geburtsdaten.

## Was nicht gebaut wird

Ausstellungen · Anzahlungs-Pflicht · Abhol-Checkliste · Erinnerung „lange nicht
gemeldet" · iPhone-Kalender-Anbindung · Fotoarchiv in der App (die
iPhone-Galerie reicht) · Handaufzucht · Übergabeprotokoll · Import alter Daten ·
Bewertungs-Widget für Interessenten (nur freies Notizfeld) · Kunden-Link
(stattdessen fertiges Bild für WhatsApp).
