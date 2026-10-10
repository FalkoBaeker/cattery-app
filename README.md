# Cattery

Cattery ist eine lokale, offlinefähige iPhone-App für die fortlaufende
Dokumentation einer Russisch-Blau-Zucht. Sie bündelt Zuchttiere, Würfe,
Gewichtsentwicklung, Warteliste, Termine, Dokumente, Verträge und Kosten in
einer installierbaren Progressive Web App (PWA).

Die App benötigt weder Konto noch Server. Alle persönlichen Daten liegen
ausschließlich im Browser auf dem verwendeten Gerät.

## Funktionen

- Zuchttiere mit Gesundheitsdaten, Rolligkeitskalender und Zeitstrahl
- Würfe, Geburtsprotokoll, Wehen-Timer und 12-Wochen-Fahrplan
- gemeinsame Wiegerunden mit Datum, Verlauf, Durchschnitt und Warnstufen
- rückdatierbare Ereignisse für einzelne Tiere, eine Auswahl oder den ganzen Wurf
- Wurfarchiv nach Katze oder Jahr mit kombinierbaren Filtern
- Interessenten, Kontaktverlauf, Kitten-Zuordnung und WhatsApp-Einzelnachrichten
- Termine mit In-App-Erinnerungen und Nachbereitung
- fotografierte Dokumente mit Zuschnitt, Drehung und Offline-Vollbildansicht
- Standardkaufvertrag und Vertrag mit einmaliger Zuchtnutzung als PDF
- persönliche Kunden-Updates als teilbare Bildkarte
- wurfbezogene Kostenübersicht
- vollständige Datensicherung und Wiederherstellung als Datei
- heller, dunkler und systemabhängiger Modus

## Ereignisse und Archiv

Gewichte werden im Wurf unter **Wiegen** gemeinsam für das gewählte Datum
gespeichert. **Heute**, **Gestern** und das Kalenderfeld stehen direkt bei
der Eingabe. Im Fahrplan öffnet ein Punkt das Ereignisformular mit Datum und
Tierauswahl; gespeicherte Daten sind dort und im Kitten-Zeitstrahl korrigierbar.
Weitere Ereignisse lassen sich im Wurf oder im Tierprofil eintragen.

Unter **Zucht → Archiv** bleiben abgeschlossene und abgebrochene Würfe
zugänglich. Der Abschluss wird vorgeschlagen, sobald die Kitten abgeholt,
behalten oder abschließend dokumentiert sind, und verlangt eine Bestätigung.
Verkauft allein bedeutet noch nicht abgeholt. Das Abholdatum lässt sich im
Kittenformular ergänzen.

Beim ersten Kitten wird das tatsächliche Geburtsdatum erfasst. Bestehende
Würfe mit Kitten werden beim Start als geboren erkannt; fehlt ein belegtes
Datum, fragt das Wurfprofil danach.

## Lokal starten

Voraussetzung ist Node.js 24 mit npm.

```bash
npm ci
npm run dev
```

Vite zeigt anschließend die lokale Adresse an. Für eine produktionsnahe
Prüfung:

```bash
npm run build
npm run preview
```

## Qualitätsprüfung

Der vollständige lokale Prüfablauf umfasst Linting, Typprüfung, Tests und
Produktionsbau:

```bash
npm run check
```

Einzelne Schritte lassen sich auch separat ausführen:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Das aktuelle manuelle Prüfprotokoll steht in
[`docs/PRUEFPROTOKOLL.md`](docs/PRUEFPROTOKOLL.md).

## Veröffentlichung über GitHub Pages

Der Workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml)
prüft die App bei jedem Push auf `main`, baut sie und veröffentlicht den
Ordner `dist`.

1. Dieses Projekt in ein GitHub-Repository hochladen.
2. In GitHub unter **Settings → Pages → Build and deployment → Source**
   **GitHub Actions** auswählen.
3. Einen Push auf `main` auslösen oder den Workflow manuell starten.
4. Die veröffentlichte Seite auf dem iPhone in Safari öffnen und über
   **Teilen → Zum Home-Bildschirm** installieren.

Die App verwendet relative Dateipfade und Hash-Routing. Dadurch funktioniert
sie auch unter einem Projektpfad wie `name.github.io/cattery-app/`.

## Daten, Datenschutz und Sicherung

- Es gibt keine Cloud-Synchronisierung. IndexedDB im Browser ist die einzige
  laufende Datenbank.
- Verkäuferdaten, Anschrift und IBAN werden erst auf dem Gerät eingegeben und
  gehören niemals ins Repository.
- Nach wichtigen Änderungen und spätestens bei der Erinnerung sollte unter
  **Mehr → Einstellungen → Datensicherung** eine Sicherungsdatei erstellt und
  in iCloud Drive oder an einem anderen sicheren Ort abgelegt werden.
- Eine Wiederherstellung ersetzt den gesamten vorhandenen Datenbestand und
  verlangt deshalb eine doppelte Bestätigung.
- Beim Löschen der Browserdaten oder der App können lokale Daten verloren
  gehen. Eine aktuelle Sicherungsdatei ist der verlässliche Schutz.

## Projektunterlagen

- [`docs/ANFORDERUNGEN.md`](docs/ANFORDERUNGEN.md) – fachliche Anforderungen
- [`docs/FRAGENKATALOG.md`](docs/FRAGENKATALOG.md) – ursprüngliche Klärungsfragen
- [`docs/UEBERGABE.md`](docs/UEBERGABE.md) – ausführlicher Entwicklungsstand
- [`docs/vertrag-a.txt`](docs/vertrag-a.txt) und
  [`docs/vertrag-b.txt`](docs/vertrag-b.txt) – Vertragsvorlagen mit Platzhaltern
- [`docs/pawpeds-anleitung.md`](docs/pawpeds-anleitung.md) – externer
  Ahnenverlust-Rechner

## Rechtlicher Hinweis

Die Vertrags-PDFs werden technisch aus den hinterlegten Vorlagen erzeugt.
Vor einem realen Einsatz sollten Wortlaut, Platzhalter und die jeweils
geltenden rechtlichen Anforderungen unabhängig fachkundig geprüft werden.
