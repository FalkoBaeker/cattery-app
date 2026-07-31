/**
 * Vertrag A — Standardkaufvertrag, 8 Paragrafen.
 *
 * Der Wortlaut stammt Zeichen für Zeichen aus docs/vertrag-a.txt —
 * dem wortgetreu übernommenen Originalvertrag der Züchterin. Er wird
 * nicht umformuliert, gekürzt oder „verbessert". Es werden ausschließlich
 * Platzhalter gefüllt sowie die Grammatik-Schalter [EZ:…|MZ:…] und
 * [K1M:…|K1W:…|KN:…] aufgelöst (siehe grammar.ts).
 *
 * Die Treue zur Textvorlage wird in vorlagen.test.ts automatisch
 * gegen docs/vertrag-a.txt geprüft.
 *
 * Eine Abweichung ist bewusst: Die Vorlage schreibt im Titel
 * „{{tierzahlWort}} [EZ:Kitten|MZ:{{tierzahlWort}} Kitten]" — in der
 * Mehrzahl stünde das Zahlwort doppelt („zwei zwei Kitten"). Gemeint
 * ist offensichtlich „Kaufvertrag über zwei Kitten"; so wird es gesetzt.
 *
 * § 8 (Unterlagen) ist in jedem Vertrag gleich.
 */

import type { Vertragsvorlage } from './model';

export const VERTRAG_STANDARD: Vertragsvorlage = {
  titel: 'Kaufvertrag über {tierzahlWort} Kitten der Rasse {rasse}',

  vorspann: [
    { text: 'zwischen' },
    {
      block: true,
      text: 'Verkäuferin:\nName: {vk.name}\nAnschrift: {vk.anschrift}\nGeb.-Datum: {vk.gebDatum}',
    },
    { text: 'und' },
    {
      block: true,
      text: '[K1M:Käufer|K1W:Käuferin|KN:Käufer]:\nName: {kaeufer.name}\nAnschrift: {kaeufer.anschrift}\nGeb. am: {kaeufer.gebDatum}',
    },
  ],

  paragrafen: [
    {
      titel: 'Vertragsgegenstand',
      absaetze: [
        {
          text: 'Die Verkäuferin veräußert {tierzahlWort} [EZ:reinrassiges|MZ:reinrassige] {rasse}-Kitten.',
        },
        { block: true, text: '{tiere.liste}\nGeboren am: {gebDatum}' },
        {
          text: '[EZ:Das Kitten ist|MZ:Die Kitten sind] bis zum Übergabetermin mindestens zweifach geimpft, kastriert, mehrfach entwurmt und [EZ:wurde|MZ:wurden] tierärztlich untersucht. Ein tierärztliches Attest wird vor Abgabe zur Einsicht vorgelegt. Je ein Stammbaum des Zuchtvereins {verein} wird mitgegeben.',
        },
      ],
    },

    {
      titel: 'Kaufpreis & Zahlungsbedingungen',
      absaetze: [
        { wenn: ['ohneAnzahlung'], block: true, text: 'Gesamtkaufpreis: {preis}' },
        {
          wenn: ['mitAnzahlung'],
          block: true,
          text: 'Gesamtkaufpreis: {preis}\nAnzahlung: {anzahlung} geleistet\nRestsumme: {restsumme}',
        },
        {
          wenn: ['mitAnzahlung'],
          text: 'Die Restsumme wird vor Abholung auf das Konto von {vk.name}: {vk.iban} überwiesen.',
        },
        {
          wenn: ['ohneAnzahlung'],
          text: 'Die Kaufsumme wird vor Abholung auf das Konto von {vk.name}: {vk.iban} überwiesen.',
        },
      ],
    },

    {
      titel: 'Übergabe & Gefahrübergang',
      absaetze: [
        {
          text: 'Übergabeort: {uebergabeOrt} - am: {uebergabeTermin} oder nach Vereinbarung. Mit Übergabe und vollständiger Kaufpreiszahlung gehen Besitz und Gefahr auf [K1M:den Käufer|K1W:die Käuferin|KN:die Käufer] über.',
        },
      ],
    },

    {
      titel: 'Gesundheitsstatus & Rügepflicht',
      absaetze: [
        {
          text: '[EZ:Das Kitten wurde|MZ:Die Kitten wurden] von [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] am Tag der Abholung besichtigt und in gesundem, augenscheinlich mangelfreiem Zustand übernommen.',
        },
        {
          text: 'Offenkundige Mängel sind binnen 48 Stunden schriftlich anzuzeigen; versteckte Mängel unverzüglich nach Entdeckung.',
        },
        {
          text: 'Beim Privatverkauf sind weitergehende Gewährleistungsrechte ausdrücklich ausgeschlossen, soweit gesetzlich zulässig (§ 444 BGB).',
        },
      ],
    },

    {
      titel: 'Pflichten [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer]',
      absaetze: [
        {
          text: '[K1M:Der Käufer verpflichtet sich|K1W:Die Käuferin verpflichtet sich|KN:Die Käufer verpflichten sich], die [EZ:Katze|MZ:Katzen] jederzeit art- und tierschutzgerecht zu halten und [EZ:ihr|MZ:ihnen] eine liebevolle, [EZ:ihrer|MZ:ihrer] Rasse angemessene Versorgung zukommen zu lassen. [K1M:Er versichert|K1W:Sie versichert|KN:Sie versichern] ferner, die [EZ:Katze|MZ:Katzen] weder zu misshandeln noch zu vernachlässigen und [EZ:sie|MZ:sie] insbesondere nicht in ein Tierheim abzugeben. Die von der Verkäuferin erteilten Fütterungsempfehlungen [K1M:hat der Käufer|K1W:hat die Käuferin|KN:haben die Käufer] erhalten, zur Kenntnis genommen und [K1M:verpflichtet sich|K1W:verpflichtet sich|KN:verpflichten sich], diese bei der Ernährung der [EZ:Katze|MZ:Katzen] angemessen zu berücksichtigen. Bei Erkrankung ist eine tierärztliche Versorgung jederzeit sicherzustellen.',
        },
      ],
    },

    {
      titel: 'Haftungsausschluss',
      absaetze: [
        {
          text: 'Für leichte Fahrlässigkeit haftet die Verkäuferin – außer bei Verletzung von Leben, Körper oder Gesundheit – nicht. Die Haftung für Vorsatz und grobe Fahrlässigkeit bleibt unberührt.',
        },
      ],
    },

    {
      titel: 'Salvatorische Klausel',
      absaetze: [
        {
          text: 'Sollten einzelne Bestimmungen dieses Vertrags unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Regelungen unberührt. Die Parteien verpflichten sich, eine wirtschaftlich möglichst gleichwertige, zulässige Ersatzregelung zu vereinbaren.',
        },
      ],
    },

    {
      titel: 'Unterlagen (bei Übergabe ausgehändigt):',
      absaetze: [{ block: true, text: '- EU Heimtierausweis\n- Stammbaum' }],
    },

    {
      titel: 'Ergänzende Vereinbarungen',
      wenn: ['zusatz'],
      absaetze: [{ text: '{zusatz}' }],
    },
  ],

  nachspann: [],
};
