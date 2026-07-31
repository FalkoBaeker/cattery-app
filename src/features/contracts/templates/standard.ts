/**
 * Vertrag A — Standardkaufvertrag, 8 Paragrafen.
 *
 * ACHTUNG: Der Wortlaut ist Rechtstext. Er wird nicht umformuliert,
 * gekürzt oder „verbessert". Änderungen nur nach Absprache mit der
 * Züchterin und nur am Wortlaut hier, nie im Code.
 *
 * § 8 (Unterlagen) ist in jedem Vertrag gleich.
 */

import type { Vertragsvorlage } from './model';

export const VERTRAG_STANDARD: Vertragsvorlage = {
  titel: 'Kaufvertrag',

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
          text: '{Tier.nom} {tier.wird} aus der Zucht {vk.gen} abgegeben und {tier.ist} beim Verein {verein} eingetragen.',
        },
      ],
    },

    {
      titel: 'Kaufpreis und Zahlung',
      absaetze: [
        { text: 'Der Kaufpreis beträgt insgesamt {preis}.' },
        {
          wenn: ['mitAnzahlung'],
          text: '{Kaeufer.nom} {kaeufer.hat} eine Anzahlung in Höhe von {anzahlung} geleistet. Die Anzahlung wird auf den Kaufpreis angerechnet. Der Restbetrag von {restsumme} ist spätestens bei der Übergabe zu entrichten.',
        },
        {
          wenn: ['ohneAnzahlung'],
          text: 'Der Kaufpreis ist spätestens bei der Übergabe zu entrichten.',
        },
        {
          text: 'Die Zahlung erfolgt in bar bei der Übergabe oder vorab durch Überweisung auf folgendes Konto:',
        },
        {
          wenn: ['mitIban'],
          block: true,
          text: 'Kontoinhaberin: {vk.name}\nIBAN: {vk.iban}\nVerwendungszweck: {verwendungszweck}',
        },
        {
          text: 'Das Eigentum {tier.gen} geht erst mit der vollständigen Bezahlung des Kaufpreises auf {kaeufer.akk} über.',
        },
        {
          wenn: ['mehrereKaeufer'],
          text: 'Mehrere Käufer schulden den Kaufpreis als Gesamtschuldner.',
        },
      ],
    },

    {
      titel: 'Übergabe',
      absaetze: [
        { text: 'Die Übergabe erfolgt voraussichtlich {uebergabe} in {uebergabeort}.' },
        {
          text: '{Tier.nom} {tier.wird} frühestens im Alter von zwölf Wochen abgegeben. Bis zur Übergabe {tier.bleibt} {tier.nom} in der Obhut {vk.gen}, die für Unterbringung, Fütterung und tierärztliche Versorgung sorgt.',
        },
        {
          text: 'Mit der Übergabe gehen Besitz, Gefahr und Unterhaltspflicht auf {kaeufer.akk} über.',
        },
      ],
    },

    {
      titel: 'Gesundheitszustand',
      absaetze: [
        {
          text: '{Tier.nom} {tier.ist} bei der Übergabe nach dem Kenntnisstand {vk.gen} gesund, mehrfach entwurmt, zweimal geimpft und mit einem Mikrochip gekennzeichnet.',
        },
        {
          text: '{Kaeufer.nom} {kaeufer.hat} Gelegenheit, {tier.akk} vor der Übergabe zu sehen und den Gesundheitszustand zu prüfen. Ein tierärztliches Gesundheitszeugnis wird auf Wunsch zur Einsicht vorgelegt.',
        },
        {
          text: '{Vk.nom} versichert, dass ihr Erbkrankheiten der Elterntiere nicht bekannt sind. Die Elterntiere sind auf HCM und PKD untersucht.',
        },
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
        {
          text: '{Kaeufer.nom} {kaeufer.verpflichtetSich}, {vk.akk} zu benachrichtigen, falls {tier.nom} aus wichtigem Grund abgegeben werden soll. {Vk.nom} hat in diesem Fall ein Vorkaufsrecht zum dann üblichen Preis.',
        },
      ],
    },

    {
      titel: 'Zucht und Kastration',
      absaetze: [
        {
          text: '{Tier.nom} {tier.wird} ausschließlich als Liebhabertier abgegeben. Eine Verwendung zur Zucht ist ausgeschlossen.',
        },
        {
          text: '{Kaeufer.nom} {kaeufer.verpflichtetSich}, {tier.akk} kastrieren zu lassen, sofern die Kastration nicht bereits vor der Übergabe erfolgt ist.',
        },
      ],
    },

    {
      titel: 'Gewährleistung',
      absaetze: [
        {
          text: '{Tier.nom} {tier.wird} als lebendes Tier verkauft. Eine Gewähr für Gesundheit, Charakter, Fellfarbe, Fellqualität, Größe oder Zuchttauglichkeit wird nicht übernommen.',
        },
        {
          text: 'Ansprüche wegen später auftretender Erkrankungen sind ausgeschlossen, soweit {vk.nom} einen Mangel nicht arglistig verschwiegen hat.',
        },
        {
          text: 'Mündliche Nebenabreden bestehen nicht. Änderungen und Ergänzungen dieses Vertrages bedürfen der Textform.',
        },
      ],
    },

    {
      titel: 'Unterlagen',
      absaetze: [
        { text: 'Mit der Übergabe {kaeufer.erhaelt} {kaeufer.nom} folgende Unterlagen:' },
        {
          block: true,
          text: '– den Impfpass mit eingetragener Chipnummer,\n– die Ahnentafel des Vereins; liegt sie noch nicht vor, wird sie nachgereicht,\n– den Nachweis der Entwurmungen,\n– Angaben zur bisherigen Fütterung.',
        },
        {
          text: 'Die Ahnentafel bleibt bis zur vollständigen Bezahlung des Kaufpreises Eigentum {vk.gen}.',
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
