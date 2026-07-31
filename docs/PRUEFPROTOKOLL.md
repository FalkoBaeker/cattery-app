# Prüfprotokoll — Cattery

Stand: 31.07.2026

Dieses Protokoll beschreibt den überprüften Release-Stand der App. Es ergänzt
die fachlichen Anforderungen in `ANFORDERUNGEN.md`; die früheren offenen Punkte
in `UEBERGABE.md` sind historischer Entwicklungsstand.

## Ergebnis

Zum Prüfzeitpunkt sind keine bekannten blockierenden App-Fehler offen.
Linting, Typprüfung, automatisierte Tests, Produktionsbau und
Abhängigkeitsprüfung laufen erfolgreich durch. Die zentralen Abläufe wurden
zusätzlich mit einem realistischen Datenbestand im Browser durchgespielt.

## Automatische Prüfungen

Ausgeführt im Projektverzeichnis mit Node.js 24:

```text
npm run lint       erfolgreich, keine Meldungen
npm run typecheck  erfolgreich
npm test           59 Testdateien, 1.123 Tests erfolgreich
npm run build      erfolgreich
npm audit          0 bekannte Schwachstellen
git diff --check   keine Whitespace-Fehler
```

Der vollständige Testlauf wurde fünfmal hintereinander wiederholt. Alle fünf
Läufe blieben grün; im Testprotokoll erschienen weder React-`act`-Warnungen
noch Meldungen zu unbekannten DOM-Eigenschaften.

`npm run check` führt Linting, Typprüfung, Tests und den Produktionsbau in
derselben Reihenfolge aus. Der GitHub-Pages-Workflow verwendet genau diesen
Befehl nach einer reproduzierbaren Installation mit `npm ci`.

Die Tests decken unter anderem Gewichtsberechnung und Warnstufen,
Wurf-Fahrplan, Erinnerungen, Rolligkeitsauswertung, Vertragsgrammatik und
-inhalt, PDF-Erzeugung, Datensicherung, Verknüpfungen zwischen Interessenten
und Kitten sowie Lösch- und Wiederherstellungsfälle ab.

## Browser-Abnahme

Die folgenden Abläufe wurden mit einer mobilen Ansichtsgröße von 393 × 852
Pixeln und einem realistischen Sicherungsdatensatz geprüft:

- Erststart, Installationshinweis und Einrichtungsführung
- Wiederherstellung einer vollständigen Sicherung einschließlich Bildanhang
  und doppelter Sicherheitsabfrage
- Dashboard, Zuchttiere, Würfe, Wurfdetails, Fahrplan und Geburtsprotokoll
- Wiege-Modus mit zwei Durchgängen, automatischer Fokuskette,
  Gewichtshistorie und Kurve
- Kitten- und Katzenprofile einschließlich Zeitstrahl
- Warteliste, Kontaktnotiz, manuelle Reihenfolge, Kitten-Zuordnung und
  Vorschau einer WhatsApp-Sammelnachricht als Einzelnachrichten
- Kalender, Termindetail und Nachbereitung
- Dokumentaufnahme aus einer Datei, Ansicht, Bearbeitung, Drehung und
  Speicherung
- Standardkaufvertrag (A) und Zuchtnutzungsvertrag (B), jeweils mit
  Speicherung und PDF-Erzeugung
- laufender Zuchtnutzungsvorgang mit Status und Fristdaten
- Kosten anlegen, Detail anzeigen und wieder löschen
- heller, dunkler und systemabhängiger Modus
- WCAG-konforme Textkontraste der semantischen Farbpalette
- segmentierte Auswahlfelder mit 44-Pixel-Touchzielen und
  Radiogruppen-Pfeiltastennavigation
- Module aus- und wieder einschalten, ohne Datenverlust
- ausgeblendete Haupttabs und das Abweisen alter Direktlinks zu
  ausgeschalteten Bereichen
- Sicherungsdatei erstellen, herunterladen und vollständig wiederherstellen
- Ablehnung einer unvollständigen Sicherung vor jeder Rückfrage oder
  Datenänderung
- persönliche WhatsApp-Bildkarte mit Foto, Anrede, Alter, aktuellem Gewicht
  und Gewichtskurve
- Vollbild-Dokumentbetrachter mit Dialogsemantik, Bildbeschreibung,
  Initialfokus, Fokusfalle und Fokuswiederherstellung

Beide Vertrags-PDFs wurden im Browser erzeugt. Bei beiden Vertragsarten und
bei der Kunden-Bildkarte wurde die native Teilen-Funktion nachweislich
aufgerufen. Die Auswahl eines konkreten externen Empfängers liegt außerhalb
der App und wurde in der automatisierten Browserumgebung deshalb nicht
endgültig bestätigt.

## Produktions- und Offline-Prüfung

Der gebaute `dist`-Stand wurde über `vite preview` geladen. Danach wurde der
Webserver vollständig beendet.

- Eine bereits geöffnete Unterseite ließ sich ohne Server neu laden.
- Eine zuvor in dieser Sitzung nicht besuchte, separat geladene Route ließ
  sich ebenfalls vollständig offline öffnen.
- Ein absichtlich reproduzierter Mischzustand aus alter Startdatei und neuem
  Lazy-Chunk-Stand wird über das Vite-PWA-Fehlersignal einmalig neu geladen,
  statt eine technische Fehlerseite stehen zu lassen. Eine Zehn-Sekunden-
  Sperre verhindert Reload-Schleifen.
- Die dabei geprüften Browserprotokolle enthielten keine Warnungen oder
  Fehler.
- Der Service Worker lädt 50 Produktionsdateien mit insgesamt rund 1,7 MB
  vor; die fachlichen Bild- und PDF-Anhänge bleiben in IndexedDB.

Damit sind App-Hülle, lazy geladene Fachmodule und statische PWA-Ressourcen
offline verfügbar.

## Datenintegrität

Besonders geprüft wurden folgende Fehlerfälle:

- Eine neue Kitten-Zuordnung entfernt eine frühere Zuordnung auf beiden Seiten.
- Ungültige IDs verändern keine bestehende gültige Zuordnung.
- Das Löschen von Kitten oder Würfen entfernt operative Kinddaten und
  verwaiste Anhänge atomar.
- Historische Verträge, Termine, Kosten und Zuchtnutzungsvorgänge bleiben
  erhalten; tote Referenzen werden entfernt — auch verschachtelte interne
  Kitten-Kennungen in Vertragsmomentaufnahmen.
- Das Löschen eines Zuchttiers löst seine Zuordnung aus historischen
  Terminen, Unterlagen, Kosten, Verträgen und Zuchtnutzungsvorgängen; offene
  operative Tierdaten und das Foto werden atomar entfernt.
- Das endgültige Löschen eines Interessenten gibt auch inkonsistent
  einseitig verknüpfte Kitten frei und entfernt ihn aus einer laufenden
  Sammelnachricht.
- Ein Zuchtnutzungsvorgang behält Tiernamen, Preisnachlass und
  Nachzahlungsfrist auch dann, wenn der zugrunde liegende Vertrag später
  gelöscht wird.
- Vertrag B akzeptiert höchstens zwei Tiere und ausschließlich weibliche
  Katzen.
- Die Vertragsart eines bereits gespeicherten Vertrags kann nicht nachträglich
  so geändert werden, dass der zugehörige Vorgang verloren geht.
- Wird ein Vertrag nach der PDF-Erzeugung inhaltlich verändert, entfernt die
  App das veraltete PDF und fordert damit eine neue Erzeugung aus dem
  aktuellen Vertragsstand.
- Das Sicherungsformat 2 verlangt für jeden Anhang passende Größe und
  SHA-256-Prüfsumme. Alle Tabellen und der Anhangsabschnitt müssen vorhanden
  sein. Zusätzlich werden vor jeder Rückfrage Datensatzschemas, Pflichtfelder,
  Kennungen, doppelte Primärschlüssel, Aufzählungswerte und Verweise zwischen
  Tabellen geprüft. Alte vollständige Sicherungen der Version 1 bleiben
  lesbar.
- Sämtliche Anhänge werden vor jeder Datenänderung dekodiert und geprüft.
  Erst danach ersetzt eine einzige Transaktion den bisherigen Datenbestand;
  ein Fehler rollt vollständig zurück.
- Modulschalter entfernen Navigation und Direktzugriff. Der
  Erinnerungsdienst startet nur, wenn der Terminbereich tatsächlich
  eingeschaltet ist. Der Erststart zeigt keine Aktion in einen
  ausgeschalteten Bereich und erkennt auch reine Dokument-, Vertrags- oder
  Finanzbestände als vorhandene Daten.
- Ein unmittelbarer Gewichtsverlust oder Stillstand bleibt auch bei positiver
  geglätteter Mehrtagesrate kritisch. In den ersten beiden Lebenswochen gilt
  die Tageswiegung erst nach zwei Messungen als erledigt.
- Das Verbandsfenster für Würfe verwendet echte Kalendermonate. Ein Wurf fällt
  am exakten 24-Monats-Jubiläum aus dem Betrachtungsfenster; Monatsenden und
  Schaltjahre werden kalendergenau behandelt.

## Unabhängige Gegenprüfung

Zwei getrennte Prüfagenten erhielten absichtlich keinen Entwicklungskontext
und untersuchten Repository, Teststand und gebaute App wie ein fremdes
Release-Team. Ihre No-Go-Funde zur Sicherungsvalidierung, zu veralteten
Vertrags-PDFs, Gewichtslogik und Wiegerhythmus, Löschreferenzen,
Kalendermonaten, Modulschaltern sowie Tastatur- und Kontrastzugänglichkeit
wurden behoben und mit eigenen Regressionstests sowie einer erneuten
Produktionsabnahme abgesichert.

## Repository- und Datenschutzprüfung

- Arbeitsbaum und bisherige Git-Historie wurden nach bekannten Verkäuferdaten,
  Adressbestandteilen, IBAN-Mustern, privaten Schlüsseln und üblichen
  Zugangsschlüssel-Formaten durchsucht.
- Gefunden wurden nur klar erkennbare Platzhalter und fiktive Testdaten, etwa
  `DE00 0000 0000 0000 0000 00`, `name@beispiel.de` und
  `anna@example.invalid`.
- Es befinden sich keine `.env`-, Schlüssel- oder Zertifikatsdateien im
  Repository.
- Persönliche Verkäuferdaten werden ausschließlich in den lokalen
  Einstellungen gespeichert.

## Grenzen der Prüfung

Die Browser-Abnahme prüft die Web-App und ihre mobile Darstellung, ersetzt
aber keinen letzten Kurztest auf dem tatsächlich verwendeten iPhone mit der
dortigen Safari-/iOS-Version. Vor dem ersten produktiven Einsatz sollten
deshalb Installation vom Home-Bildschirm, Kameraaufnahme,
Benachrichtigungsfreigabe und Teilen an einen eigenen Testkontakt einmal auf
diesem Gerät bestätigt werden.

Der technische Test bestätigt die wortgetreue PDF-Erzeugung aus den
hinterlegten Vorlagen. Er ist keine rechtliche Prüfung der Vertragsinhalte.
