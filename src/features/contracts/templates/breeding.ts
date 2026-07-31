/**
 * Vertrag B — Kaufvertrag mit vorbehaltener einmaliger Zuchtnutzung,
 * 17 Paragrafen.
 *
 * ACHTUNG: Der Wortlaut ist Rechtstext. Er wird nicht umformuliert,
 * gekürzt oder „verbessert". Änderungen nur nach Absprache mit der
 * Züchterin und nur am Wortlaut hier, nie im Code.
 *
 * Ein bis zwei Tiere, immer weiblich. Beliebig viele Käufer.
 * Bei genau einem Käufer entfallen die Gesamtschuldner-Klauseln am Ende
 * von § 2 und § 16 vollständig — sie ergeben mit einer Person keinen Sinn.
 * Alle Fristen sind Platzhalter und einzeln einstellbar.
 */

import type { Vertragsvorlage } from './model';

export const VERTRAG_ZUCHTNUTZUNG: Vertragsvorlage = {
  titel: 'Kaufvertrag mit vorbehaltener einmaliger Zuchtnutzung',

  vorspann: [
    { text: 'Zwischen' },
    { text: '{vk.name}\n{vk.anschrift}\ngeboren am {vk.geburtsdatum}', block: true },
    { text: '– nachfolgend {vk.nom} genannt –' },
    { text: 'und' },
    { text: '{kaeufer.liste}', block: true },
    { text: '– nachfolgend {kaeufer.nom} genannt –' },
    { text: 'wird folgender Kaufvertrag geschlossen:' },
  ],

  paragrafen: [
    {
      titel: 'Vertragsgegenstand',
      absaetze: [
        {
          text: '{Vk.nom} verkauft {kaeufer.dat} {tier.zahlAkk} {tier.wortAkk} der Rasse {rasse}.',
        },
        { text: '{tier.liste}', block: true },
        { text: '{Tier.nom} {tier.wurde} am {geburtsdatum} geboren.' },
        {
          text: '{Tier.nom} {tier.wird} ausdrücklich mit dem in § 3 vereinbarten Vorbehalt der einmaligen Zuchtnutzung verkauft.',
        },
      ],
    },

    {
      titel: 'Kaufpreis, Preisnachlass und Zahlung',
      absaetze: [
        { text: 'Der reguläre Kaufpreis beträgt {regulaerpreis}.' },
        {
          text: 'Wegen des in § 3 vereinbarten Vorbehalts der einmaligen Zuchtnutzung gewährt {vk.nom} einen Preisnachlass in Höhe von {nachlass}. {Kaeufer.nom} {kaeufer.zahlt} damit einen ermäßigten Kaufpreis von {ermaessigt}.',
        },
        {
          text: 'Der ermäßigte Kaufpreis ist spätestens bei der Übergabe zu entrichten. Die Zahlung erfolgt in bar oder vorab durch Überweisung auf folgendes Konto:',
        },
        {
          wenn: ['mitIban'],
          block: true,
          text: 'Kontoinhaberin: {vk.name}\nIBAN: {vk.iban}\nVerwendungszweck: {verwendungszweck}',
        },
        {
          text: 'Das Eigentum {tier.gen} geht erst mit der vollständigen Bezahlung des ermäßigten Kaufpreises auf {kaeufer.akk} über.',
        },
        {
          wenn: ['mehrereKaeufer'],
          text: 'Mehrere Käufer schulden den Kaufpreis und eine etwaige Nachzahlung nach § 15 als Gesamtschuldner.',
        },
      ],
    },

    {
      titel: 'Vorbehalt der einmaligen Zuchtnutzung',
      absaetze: [
        {
          text: '{Vk.nom} behält sich das Recht vor, {tier.akk} einmalig zur Zucht zu verwenden. Der Preisnachlass nach § 2 wird ausschließlich als Gegenleistung für dieses Recht gewährt.',
        },
        {
          text: 'Das Recht umfasst eine Belegung, die Trächtigkeit, die Geburt und die Aufzucht eines Wurfes.',
        },
        {
          text: '{Kaeufer.nom} {kaeufer.ist} verpflichtet, die Zuchtnutzung zu dulden und daran mitzuwirken.',
        },
      ],
    },

    {
      titel: 'Beginn und Dauer der Frist',
      absaetze: [
        {
          text: 'Das Recht zur Zuchtnutzung ist auf {nutzungsmonate} Monate ab der erstmaligen Überlassung {tier.gen} an {kaeufer.akk} befristet.',
        },
        {
          text: 'Die erstmalige Überlassung erfolgte am {fristbeginn}. Die Frist endet damit mit Ablauf des {fristende}.',
        },
      ],
    },

    {
      titel: 'Verlängerung der Frist',
      absaetze: [
        {
          text: 'Die Frist nach § 4 verlängert sich einmalig um {verlaengerungsmonate} Monate, wenn die Zuchtnutzung aus Gründen, die {vk.nom} nicht zu vertreten hat, innerhalb der Frist nicht durchgeführt werden kann. Dies gilt insbesondere bei Krankheit, ausbleibender Rolligkeit oder fehlender Verfügbarkeit eines geeigneten Deckkaters.',
        },
        { text: '{Vk.nom} zeigt die Verlängerung in Textform an.' },
      ],
    },

    {
      titel: 'Herausgabe zur Zuchtnutzung',
      absaetze: [
        { text: '{Vk.nom} zeigt die beabsichtigte Zuchtnutzung in Textform an.' },
        {
          text: '{Kaeufer.nom} {kaeufer.verpflichtetSich}, {tier.akk} innerhalb von {herausgabetage} Kalendertagen nach dieser Anzeige an {vk.akk} herauszugeben.',
        },
        {
          text: 'Ort der Übergabe ist der Wohnsitz {vk.gen}, soweit nichts anderes vereinbart wird. Die Kosten der Fahrt trägt {vk.nom}.',
        },
      ],
    },

    {
      titel: 'Dauer der Überlassung',
      absaetze: [
        {
          text: '{Tier.nom} {tier.bleibt} bei {vk.dat}, bis die Belegung, die Trächtigkeit, die Geburt und die Aufzucht des Wurfes abgeschlossen sind und die Nachkommen abgegeben wurden.',
        },
        {
          text: 'Anschließend {tier.wird} {tier.nom} unverzüglich an {kaeufer.akk} zurückgegeben.',
        },
      ],
    },

    {
      titel: 'Deckversuche',
      absaetze: [
        {
          text: '{Vk.nom} hat Anspruch auf bis zu {deckversuche} Deckversuche.',
        },
        {
          text: 'Bleiben alle Deckversuche erfolglos, gilt das Recht zur Zuchtnutzung als verbraucht. Der Preisnachlass nach § 2 bleibt in diesem Fall bestehen.',
        },
      ],
    },

    {
      titel: 'Kosten und Gefahrtragung während der Überlassung',
      absaetze: [
        {
          text: 'Während der Überlassung trägt {vk.nom} sämtliche Kosten für Unterbringung, Fütterung, Deckgebühr und tierärztliche Versorgung {tier.gen}.',
        },
        {
          text: 'Die Gefahr des zufälligen Untergangs trägt während der Überlassung {vk.nom}. Ein Anspruch auf Ersatz besteht nicht, soweit sich ein mit der Trächtigkeit oder der Geburt verbundenes Risiko verwirklicht.',
        },
      ],
    },

    {
      titel: 'Eigentum an den Nachkommen',
      absaetze: [
        {
          text: 'Die aus der Zuchtnutzung hervorgehenden Nachkommen stehen im Alleineigentum {vk.gen}.',
        },
        {
          text: '{Kaeufer.nom} {kaeufer.hat} keinen Anspruch auf einen Nachkommen und keinen Anspruch auf eine Beteiligung am Erlös.',
        },
      ],
    },

    {
      titel: 'Kastrationsverbot bis zum Abschluss der Zuchtnutzung',
      absaetze: [
        {
          text: '{Kaeufer.nom} {kaeufer.darf} {tier.akk} bis zum Abschluss der Zuchtnutzung weder kastrieren noch sterilisieren lassen.',
        },
        {
          text: 'Nach Abschluss der Zuchtnutzung {kaeufer.verpflichtetSich} {kaeufer.nom}, {tier.akk} kastrieren zu lassen und dies {vk.dat} nachzuweisen.',
        },
      ],
    },

    {
      titel: 'Gesundheitsvorsorge',
      absaetze: [
        {
          text: '{Kaeufer.nom} {kaeufer.verpflichtetSich}, {tier.akk} auf Verlangen {vk.gen} den für die Zucht erforderlichen Untersuchungen vorstellen zu lassen, insbesondere der Herzultraschalluntersuchung auf HCM, der Nierenultraschalluntersuchung auf PKD sowie dem Test auf FeLV und FIV.',
        },
        { text: 'Die Kosten dieser Untersuchungen trägt {vk.nom}.' },
      ],
    },

    {
      titel: 'Haltung',
      absaetze: [
        {
          text: '{Kaeufer.nom} {kaeufer.verpflichtetSich}, {tier.akk} artgerecht zu halten, ausgewogen zu ernähren und bei Krankheit unverzüglich tierärztlich behandeln zu lassen.',
        },
        {
          text: '{Tier.nom} {tier.wird} in Wohnungshaltung oder in gesichertem Freigang gehalten. Ungesicherter Freigang an Straßen ist nicht gestattet.',
        },
      ],
    },

    {
      titel: 'Weitergabe und Anzeigepflichten',
      absaetze: [
        {
          text: 'Solange das Recht zur Zuchtnutzung besteht, {kaeufer.darf} {kaeufer.nom} {tier.akk} weder verkaufen noch verschenken noch dauerhaft an Dritte abgeben.',
        },
        {
          text: '{Kaeufer.nom} {kaeufer.verpflichtetSich}, {vk.dat} jede Änderung der Anschrift oder der Telefonnummer unverzüglich mitzuteilen und {vk.akk} über die Rolligkeit {tier.gen} zu unterrichten.',
        },
      ],
    },

    {
      titel: 'Fristablauf und Nachzahlung',
      absaetze: [
        {
          text: 'Wird die Zuchtnutzung bis zum Ablauf der Frist nach § 4, gegebenenfalls verlängert nach § 5, aus Gründen nicht durchgeführt, die {vk.nom} nicht zu vertreten hat, entfällt der Preisnachlass nach § 2.',
        },
        {
          text: '{Kaeufer.nom} {kaeufer.hat} in diesem Fall den Preisnachlass in Höhe von {nachlass} binnen {nachzahlungstage} Tagen nach Fristablauf nachzuzahlen.',
        },
        {
          text: 'Mit der vollständigen Nachzahlung erlischt das Recht zur Zuchtnutzung, und die Beschränkungen nach den §§ 11 und 14 entfallen.',
        },
      ],
    },

    {
      titel: 'Unterlagen und Schlussbestimmungen',
      absaetze: [
        {
          text: 'Mit der Übergabe {kaeufer.erhaelt} {kaeufer.nom} den Impfpass mit eingetragener Chipnummer sowie eine Kopie der Ahnentafel. Das Original der Ahnentafel wird ausgehändigt, sobald die Zuchtnutzung abgeschlossen und die Kastration nach § 11 nachgewiesen ist.',
        },
        {
          text: 'Mündliche Nebenabreden bestehen nicht. Änderungen und Ergänzungen dieses Vertrages bedürfen der Textform.',
        },
        {
          wenn: ['mehrereKaeufer'],
          text: 'Mehrere Käufer haften für sämtliche Verpflichtungen aus diesem Vertrag als Gesamtschuldner.',
        },
      ],
    },

    {
      titel: 'Salvatorische Klausel',
      absaetze: [
        {
          text: 'Sollte eine Bestimmung dieses Vertrages unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen davon unberührt. An die Stelle der unwirksamen Bestimmung tritt eine Regelung, die dem wirtschaftlichen Zweck der unwirksamen Bestimmung am nächsten kommt.',
        },
      ],
    },

    {
      titel: 'Individuelle Vereinbarungen',
      wenn: ['zusatz'],
      absaetze: [{ text: '{zusatz}' }],
    },
  ],

  nachspann: [
    {
      text: 'Beide Vertragsparteien haben diesen Vertrag gelesen und erhalten je eine unterschriebene Ausfertigung.',
    },
  ],
};
