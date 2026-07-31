/**
 * Vertrag B — Kaufvertrag mit vorbehaltener einmaliger Zuchtnutzung,
 * 17 Paragrafen.
 *
 * Der Wortlaut stammt Zeichen für Zeichen aus docs/vertrag-b.txt —
 * dem wortgetreu übernommenen Originalvertrag der Züchterin. Er wird
 * nicht umformuliert, gekürzt oder „verbessert". Es werden ausschließlich
 * Platzhalter gefüllt sowie die Grammatik-Schalter [T1:…|TN:…] und
 * [K1M:…|K1W:…|KN:…] aufgelöst (siehe grammar.ts).
 *
 * Die Treue zur Textvorlage wird in vorlagen.test.ts automatisch
 * gegen docs/vertrag-b.txt geprüft.
 *
 * Ein bis zwei Katzen, immer weiblich. Beliebig viele Käufer.
 * Bei genau einem Käufer entfallen die Gesamtschuldner-Klauseln am Ende
 * von § 2 und § 16 vollständig — sie ergeben mit einer Person keinen Sinn.
 * Alle Fristen sind Platzhalter und einzeln einstellbar.
 */

import type { Vertragsvorlage } from './model';

export const VERTRAG_ZUCHTNUTZUNG: Vertragsvorlage = {
  titel:
    'Kaufvertrag über [T1:eine {rasse}-Katze|TN:{tierzahlWort} {rasse}-Katzen] als [T1:Liebhabertier|TN:Liebhabertiere] mit vorbehaltener einmaliger Zuchtnutzung der Verkäuferin',

  vorspann: [
    { text: 'zwischen' },
    { text: '{vk.name}, {vk.anschrift}, nachfolgend „Verkäuferin" genannt,' },
    { text: 'und' },
    {
      text: '{kaeufer.name}, {kaeufer.anschrift}, nachfolgend [K1M:„Käufer"|K1W:„Käuferin"|KN:gemeinsam „Käufer"] genannt.',
    },
    { text: 'Die Parteien schließen folgenden Vertrag:' },
  ],

  paragrafen: [
    {
      titel: 'Vertragsgegenstand',
      absaetze: [
        {
          text: 'Die Verkäuferin veräußert nach Maßgabe dieses Vertrags die [T1:{rasse}-Katze|TN:{rasse}-Katzen]:',
        },
        { block: true, text: '{katzen.liste}' },
        { text: 'nachfolgend [T1:„Katze" oder „{katzen.0.name}"|TN:„Katzen"] genannt.' },
        {
          text: 'Die [T1:Katze wird|TN:Katzen werden] an [K1M:den Käufer|K1W:die Käuferin|KN:die Käufer] ausschließlich als Liebhaber- und Heimtier ohne eigenes Zuchtrecht verkauft. [K1M:Der Käufer erwirbt|K1W:Die Käuferin erwirbt|KN:Die Käufer erwerben] weder ein Recht zur Zucht mit der [T1:Katze|TN:Katze] noch ein Recht, eine Zuchtzulassung, ein Zuchtrecht oder sonstige vereinsrechtliche Zuchtrechte auf sich übertragen zu lassen oder gegenüber Dritten geltend zu machen.',
        },
        {
          text: 'Eine etwa bestehende züchterische Eignung der Katze dient ausschließlich der in diesem Vertrag zugunsten der Verkäuferin vorbehaltenen einmaligen Zuchtnutzung. Sie stellt keine gegenüber [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] geschuldete Beschaffenheit zur eigenen Zuchtverwendung dar.',
        },
        {
          text: 'Die Katze wird vor endgültiger Eigentumsübertragung tierärztlich untersucht. Nachweise über Impfungen, Entwurmungen und tierärztliche Untersuchungen werden [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] zur Einsicht beziehungsweise in Kopie vorgelegt.',
        },
        {
          text: 'Zuchtzulassungsunterlagen, Deckunterlagen, Wurfunterlagen und vereinsrechtliche Zuchtunterlagen verbleiben bei der Verkäuferin, soweit sie für die vorbehaltene Zuchtnutzung, Wurfmeldung oder Zuchtorganisation erforderlich sind.',
        },
      ],
    },

    {
      titel: 'Kaufpreis, bedingter Preisnachlass und wirtschaftliche Grundlage',
      absaetze: [
        {
          text: 'Der Kaufpreis für die Katze beträgt {preisRegulaer}. Dieser Betrag entspricht dem regulären Abgabepreis der Verkäuferin für eine Katze vergleichbarer Abstammung und Qualität, die sie - wie auch hier - ausschließlich als Liebhaber- und Heimtier ohne Zuchtrecht und im Ergebnis in kastriertem Zustand abgibt.',
        },
        {
          text: 'Auf den Kaufpreis gewährt die Verkäuferin einen Preisnachlass in Höhe von {nachlass}, so dass bei Gewährung des Nachlasses ein Betrag von {ermaessigt} zu zahlen ist. Der Nachlass wird ausschließlich deshalb gewährt, weil die Verkäuferin sich die einmalige Zuchtnutzung der Katze vorbehält (§ 3) und [K1M:der Käufer die|K1W:die Käuferin die|KN:die Käufer die] hierfür erforderliche Mitwirkung, Duldung und Herausgabe der Katze [K1M:übernimmt|K1W:übernimmt|KN:übernehmen]. Der Nachlass steht unter der Bedingung, dass die vorbehaltene Zuchtnutzung tatsächlich durchgeführt wird.',
        },
        {
          text: 'Wird die vorbehaltene Zuchtnutzung durchgeführt und abgeschlossen (§ 3), verbleibt es endgültig bei dem ermäßigten Betrag von {ermaessigt}; weitere Zahlungen sind dann nicht geschuldet.',
        },
        {
          text: 'Wird die vorbehaltene Zuchtnutzung nicht durchgeführt, entfällt der Preisnachlass; geschuldet ist dann der volle Kaufpreis von {preisRegulaer} unter Anrechnung bereits gezahlter {ermaessigt}. Dies gilt unbeschadet der Rückabwicklungsregelungen in § 8 sowie der weitergehenden Rechte der Verkäuferin. Der Preisnachlass entfällt jedoch nicht, soweit die Zuchtnutzung allein deshalb unterbleibt, weil die Verkäuferin sie ohne sachlichen Grund - insbesondere ohne gesundheitlichen, tierschutzrechtlichen, zucht- oder vereinsorganisatorischen Grund - nicht betreibt; in diesem Fall verbleibt es bei {ermaessigt}.',
        },
        { text: 'Der ermäßigte Betrag von {ermaessigt} ist auf folgendes Konto zu zahlen:' },
        {
          block: true,
          text: 'Kontoinhaberin: {vk.name}\nIBAN: {vk.iban}\nVerwendungszweck: {verwendungszweck}',
        },
        {
          text: 'Eine etwaige Nachzahlung des Differenzbetrags von {nachlass} ist innerhalb von {nachzahlungTage} Tagen ab Zugang einer entsprechenden Mitteilung der Verkäuferin in Textform fällig.',
        },
        {
          text: '[K1M:Vereitelt der Käufer|K1W:Vereitelt die Käuferin|KN:Vereiteln die Käufer] die vorbehaltene Zuchtnutzung schuldhaft oder [K1M:erschwert er sie|K1W:erschwert sie sie|KN:erschweren sie sie] schuldhaft so erheblich, dass sie nicht durchgeführt werden kann - insbesondere durch endgültige oder nachhaltige Verweigerung der Herausgabe, eigenmächtige Kastration, unerlaubte Verpaarung, Weitergabe an Dritte, schuldhaftes Verschweigen zuchtrelevanter Erkrankungen oder schwerwiegende Verstöße gegen Haltungs- und Mitwirkungspflichten -, so entfällt der Preisnachlass; geschuldet ist dann der volle Kaufpreis von {preisRegulaer}. Daneben kann die Verkäuferin Ersatz eines weitergehenden Schadens verlangen und nach § 12 vorgehen. Weitergehende gesetzliche Ansprüche bleiben unberührt.',
        },
        {
          text: 'Wird die vorbehaltene Zuchtnutzung aus gesundheitlichen, anatomischen, tierärztlichen, zuchtrechtlichen oder sonstigen Gründen endgültig unmöglich, die weder [K1M:der Käufer|K1W:die Käuferin|KN:die Käufer] noch die Verkäuferin zu vertreten [K1M:hat|K1W:hat|KN:haben], ist die Verkäuferin berechtigt, nach ihrer Wahl\na) die Katze unter Wegfall des Preisnachlasses zum vollen Kaufpreis von {preisRegulaer} unter Anrechnung bereits gezahlter {ermaessigt} endgültig an [K1M:den Käufer|K1W:die Käuferin|KN:die Käufer] zu übertragen; oder\nb) vom Vertrag zurückzutreten und die Katze gegen Rückzahlung der gezahlten {ermaessigt} zurückzunehmen.',
        },
        {
          text: 'Die Verkäuferin teilt ihre Wahl [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] innerhalb angemessener Frist in Textform mit.',
        },
        {
          wenn: ['mehrereKaeufer'],
          text: 'Mehrere Käufer haften für sämtliche Pflichten aus diesem Vertrag, insbesondere für die Zahlung des Kaufpreises sowie für etwaige Nachzahlungs- und Schadensersatzansprüche, als Gesamtschuldner.',
        },
      ],
    },

    {
      titel: 'Vorbehaltene einmalige Zuchtnutzung',
      absaetze: [
        {
          text: 'Die Verkäuferin behält sich das ausschließliche Recht vor, die Katze einmalig zur Zucht einzusetzen. [K1M:Der Käufer erwirbt|K1W:Die Käuferin erwirbt|KN:Die Käufer erwerben] kein eigenes Zuchtrecht.',
        },
        {
          text: 'Die vorbehaltene Zuchtnutzung umfasst insbesondere:\na) Auswahl des Deckkaters durch die Verkäuferin;\nb) Durchführung erforderlicher zuchtrelevanter Untersuchungen;\nc) Deckung beziehungsweise Deckversuche;\nd) Trächtigkeitsuntersuchungen;\ne) Geburt und Aufzucht des Wurfs bei der Verkäuferin;\nf) Wurfmeldung, Registrierung und Abgabe der Kitten durch die Verkäuferin;\ng) anschließende Kastration der Katze, soweit die Verkäuferin die Kastration nach Abschluss der Zuchtnutzung veranlasst.',
        },
        {
          text: 'Die Verkäuferin entscheidet nach züchterischem Ermessen und unter Berücksichtigung tierärztlicher Einschätzungen, ob, wann, mit welchem Deckkater und in welchem Ablauf die Zuchtnutzung durchgeführt wird. [K1M:Der Käufer hat|K1W:Die Käuferin hat|KN:Die Käufer haben] keinen Anspruch auf eine bestimmte Zeitplanung, auf einen bestimmten Deckkater, auf eine bestimmte Anzahl von Deckversuchen oder auf einen bestimmten Ablauf.',
        },
        {
          text: 'Die Verkäuferin ist berechtigt, die Katze für Deckung, Untersuchungen, Trächtigkeit, Geburt, Aufzucht, Nachsorge und Kastration herauszuverlangen. [K1M:Der Käufer verpflichtet sich|K1W:Die Käuferin verpflichtet sich|KN:Die Käufer verpflichten sich], die Katze auf Anforderung der Verkäuferin unverzüglich, spätestens jedoch innerhalb von {herausgabeTage} Kalendertagen, an die Verkäuferin oder an eine von ihr benannte Tierarztpraxis herauszugeben.',
        },
        {
          text: 'Zeigt die Katze Anzeichen von Rolligkeit, Krankheit, Verletzung, Verhaltensauffälligkeit oder sonstige Umstände, die für die Zuchtnutzung relevant sein können, [K1M:hat der Käufer|K1W:hat die Käuferin|KN:haben die Käufer] die Verkäuferin unverzüglich zu informieren.',
        },
        {
          text: 'Die Katze hat sich spätestens ab dem von der Verkäuferin benannten Zeitpunkt vor der erwarteten Geburt bei der Verkäuferin aufzuhalten. Die Geburt und die ersten Wochen der Aufzucht erfolgen ausschließlich bei der Verkäuferin, soweit diese nicht schriftlich etwas anderes bestimmt.',
        },
        {
          text: 'Die vorbehaltene Zuchtnutzung ist innerhalb von {fristMonate} Monaten ab der erstmaligen Überlassung der Katze an [K1M:den Käufer|K1W:die Käuferin|KN:die Käufer] beziehungsweise ab Vertragsschluss, falls eine Überlassung nicht erfolgt, auszuüben und abzuschließen. Die Verkäuferin kann diese Frist aus tierärztlich gebotenen oder zuchtorganisatorischen Gründen einmalig um bis zu {verlaengerungMonate} Monate verlängern; sie teilt die Verlängerung [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] in Textform mit. Ist die Zuchtnutzung bis zum Ablauf der Frist nicht abgeschlossen, richten sich die Rechtsfolgen nach § 2.',
        },
        {
          text: 'Die vorbehaltene Zuchtnutzung gilt als abgeschlossen, wenn\na) die Katze nach einer von der Verkäuferin veranlassten Verpaarung geworfen hat und die Verkäuferin die Aufzuchtphase für beendet erklärt; oder\nb) die Verkäuferin schriftlich erklärt, auf weitere Zuchtnutzung zu verzichten; oder\nc) die Parteien eine abweichende schriftliche Abschlussvereinbarung treffen.',
        },
        {
          text: 'Die Verkäuferin ist berechtigt, bis zu {deckversuche} Deckversuche beziehungsweise Deckperioden vorzunehmen, soweit dies tierärztlich vertretbar ist. Eine erfolglose Deckung gilt nicht als Abschluss der vorbehaltenen Zuchtnutzung, es sei denn, die Verkäuferin erklärt schriftlich den Verzicht auf weitere Versuche oder die Frist nach diesem Vertrag läuft ab.',
        },
        {
          text: 'Eine Zuchtnutzung findet nicht statt, wenn ihr nach tierärztlicher Einschätzung überwiegende gesundheitliche oder tierschutzrechtliche Gründe entgegenstehen. Die abschließende Entscheidung über den Verzicht trifft die Verkäuferin unter Berücksichtigung der tierärztlichen Einschätzung. In diesem Fall gilt § 2 entsprechend.',
        },
      ],
    },

    {
      titel: 'Eigentum, Besitz und endgültige Übergabe',
      absaetze: [
        {
          text: 'Die Verkäuferin bleibt bis zum Eintritt sämtlicher nachfolgender Voraussetzungen Eigentümerin der Katze:\na) vollständige Zahlung des nach diesem Vertrag geschuldeten Betrags;\nb) Abschluss der vorbehaltenen Zuchtnutzung oder schriftlicher Verzicht der Verkäuferin auf diese oder Ablauf der Frist nach § 3;\nc) gegebenenfalls Rückführung der Katze zu [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] nach Aufzucht, Nachsorge und Kastration;\nd) schriftliche Erklärung der Verkäuferin, dass das Eigentum nunmehr auf [K1M:den Käufer|K1W:die Käuferin|KN:die Käufer] übergeht.',
        },
        { text: 'Die vorstehenden Voraussetzungen müssen kumulativ vorliegen.' },
        {
          text: 'Eine Überlassung der Katze an [K1M:den Käufer|K1W:die Käuferin|KN:die Käufer] vor dem Eigentumsübergang erfolgt ausschließlich als widerrufliche Betreuungsüberlassung. Sie begründet kein Eigentum [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer] und kein Recht, über die Katze zu verfügen.',
        },
        {
          text: 'Die Verkäuferin ist berechtigt, die Betreuungsüberlassung aus wichtigem Grund zu widerrufen. Ein wichtiger Grund liegt insbesondere vor bei Verstößen gegen Haltungs-, Mitwirkungs-, Herausgabe-, Informations- oder Zuchtverbotsklauseln dieses Vertrags.',
        },
        {
          text: 'Während einer Betreuungsüberlassung [K1M:hat der Käufer|K1W:hat die Käuferin|KN:haben die Käufer] die Katze sorgfältig, artgerecht und tierschutzkonform zu halten, sie vor Entlaufen, Verletzungen, ungewollter Verpaarung und Zugriff Dritter zu schützen und die Verkäuferin über alle wesentlichen Umstände unverzüglich zu informieren.',
        },
        {
          text: 'Solange die Verkäuferin Eigentümerin ist, [K1M:darf der Käufer|K1W:darf die Käuferin|KN:dürfen die Käufer] die Katze nicht verkaufen, verschenken, verpfänden, sicherungsübereignen, dauerhaft Dritten überlassen, in ein Tierheim geben, zur Zucht verwenden, kastrieren lassen oder sonst über sie verfügen.',
        },
        {
          text: 'Der endgültige Eigentumsübergang erfolgt erst durch ausdrückliche schriftliche Eigentumsübertragungserklärung der Verkäuferin. Befindet sich die Katze zu diesem Zeitpunkt bereits im Besitz [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer], sind sich die Parteien darüber einig, dass das Eigentum mit Zugang dieser Erklärung auf [K1M:den Käufer|K1W:die Käuferin|KN:die Käufer] übergeht.',
        },
      ],
    },

    {
      titel: 'Eigentum an Kitten und Wurfunterlagen',
      absaetze: [
        {
          text: 'Sämtliche Kitten aus der vorbehaltenen Zuchtnutzung stehen von Beginn an ausschließlich der Verkäuferin zu.',
        },
        {
          text: '[K1M:Der Käufer erwirbt|K1W:Die Käuferin erwirbt|KN:Die Käufer erwerben] keinerlei Rechte an den Kitten, an deren Verkaufserlösen, an Wurfunterlagen, Deckunterlagen, Registrierungen oder sonstigen zuchtrelevanten Unterlagen.',
        },
        {
          text: 'Sollte die Katze wider Erwarten während einer Betreuungsüberlassung bei [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] werfen, ist die Verkäuferin unverzüglich zu informieren; Katze sowie Kitten sind nach Weisung der Verkäuferin herauszugeben. [K1M:Der Käufer darf|K1W:Die Käuferin darf|KN:Die Käufer dürfen] über die Kitten nicht verfügen.',
        },
        {
          text: 'Die Verkäuferin entscheidet allein über Aufzucht, tierärztliche Versorgung, Registrierung, Namensgebung, Vermittlung, Verkauf und Abgabe der Kitten.',
        },
      ],
    },

    {
      titel: 'Zuchtverbot [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer]',
      absaetze: [
        {
          text: '[K1M:Dem Käufer|K1W:Der Käuferin|KN:Den Käufern] ist jede eigene Zuchtnutzung der Katze untersagt.',
        },
        {
          text: '[K1M:Dem Käufer|K1W:Der Käuferin|KN:Den Käufern] ist insbesondere untersagt:\na) die Katze durch einen eigenen oder fremden Kater decken zu lassen;\nb) eine Verpaarung zu ermöglichen oder billigend in Kauf zu nehmen;\nc) die Katze mit unkastrierten Katern zusammenzubringen, soweit dies vermeidbar ist;\nd) Zuchtrechte, Zuchtzulassungen oder Vereinsumschreibungen zu beantragen;\ne) die Katze als Zuchtkatze anzubieten, zu bewerben oder weiterzugeben;\nf) Nachkommen aus einer unzulässigen Verpaarung zu behalten, zu verkaufen oder abzugeben;\ng) die Katze vor schriftlicher Freigabe durch die Verkäuferin kastrieren zu lassen.',
        },
        {
          text: 'Bei einem schuldhaften Verstoß gegen das Zuchtverbot ist die Verkäuferin berechtigt, Rückgabe der Katze, Ersatz sämtlicher Schäden und Aufwendungen sowie den Wegfall des Preisnachlasses nach § 2 geltend zu machen. Weitergehende Ansprüche bleiben vorbehalten.',
        },
      ],
    },

    {
      titel: 'Kostenregelung',
      absaetze: [
        {
          text: 'Die Verkäuferin trägt die Kosten der von ihr veranlassten zuchtspezifischen Maßnahmen, insbesondere:\na) Deckgebühr;\nb) zuchtspezifische Voruntersuchungen;\nc) Trächtigkeitsuntersuchungen;\nd) Geburtshilfe und zuchtspezifische tierärztliche Maßnahmen;\ne) notwendige Kaiserschnittbehandlung im Zusammenhang mit der vorbehaltenen Zuchtnutzung;\nf) Aufzuchtkosten der Kitten;\ng) Kastration der Katze nach Abschluss der Zuchtnutzung, sofern die Verkäuferin diese veranlasst.',
        },
        {
          text: 'Während sich die Katze bei der Verkäuferin befindet, trägt die Verkäuferin die laufenden Kosten für Fütterung, Unterbringung und übliche Versorgung.',
        },
        {
          text: 'Während sich die Katze aufgrund Betreuungsüberlassung bei [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] befindet, [K1M:trägt der Käufer|K1W:trägt die Käuferin|KN:tragen die Käufer] die laufenden Kosten der üblichen Haltung, insbesondere Futter, Streu, Pflege, normale Gesundheitsvorsorge sowie die tierärztliche Behandlung nicht zuchtbedingter Erkrankungen oder Verletzungen.',
        },
        {
          text: 'Transportkosten im Zusammenhang mit der Herausgabe der Katze an die Verkäuferin oder der Rückführung der Katze von der Verkäuferin [K1M:trägt der Käufer|K1W:trägt die Käuferin|KN:tragen die Käufer], soweit die Parteien nicht schriftlich etwas anderes vereinbaren.',
        },
        {
          text: 'Tierärztliche Maßnahmen, die nicht eilbedürftig sind, [K1M:darf der Käufer|K1W:darf die Käuferin|KN:dürfen die Käufer] vor Eigentumsübergang nur nach vorheriger Abstimmung mit der Verkäuferin veranlassen. In Notfällen ist unverzüglich tierärztliche Hilfe in Anspruch zu nehmen; die Verkäuferin ist schnellstmöglich zu informieren.',
        },
      ],
    },

    {
      titel: 'Risiko, Verlust, Erkrankung und Haftung',
      absaetze: [
        {
          text: 'Während sich die Katze bei [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] befindet, obliegt [K1M:ihm|K1W:ihr|KN:ihnen] die tatsächliche Obhut. [K1M:Er haftet|K1W:Sie haftet|KN:Sie haften] der Verkäuferin für Schäden, Verlust, Entlaufen, ungewollte Verpaarung, Verletzung oder Erkrankung der Katze, soweit diese auf einer schuldhaften Pflichtverletzung [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer], [K1M:seiner|K1W:ihrer|KN:ihrer] Haushaltsangehörigen, Besucher oder sonstiger Personen beruhen, denen [K1M:der Käufer|K1W:die Käuferin|KN:die Käufer] Zugriff auf die Katze [K1M:ermöglicht|K1W:ermöglicht|KN:ermöglichen].',
        },
        {
          text: 'Während sich die Katze bei der Verkäuferin befindet, trägt die Verkäuferin die tatsächliche Obhut und haftet nach den gesetzlichen Vorschriften.',
        },
        {
          text: 'Medizinische Risiken, die typischerweise mit der von der Verkäuferin veranlassten Zuchtnutzung, Trächtigkeit, Geburt oder Aufzucht zusammenhängen, trägt im Innenverhältnis grundsätzlich die Verkäuferin, soweit sie nicht durch schuldhafte Pflichtverletzungen [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer] verursacht oder erhöht wurden.',
        },
        {
          text: 'Stirbt die Katze vor endgültigem Eigentumsübergang oder wird sie aus nicht von [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] zu vertretenden Gründen endgültig nicht mehr übergabefähig, wird der Vertrag rückabgewickelt und ein bereits gezahlter Betrag von {ermaessigt} an [K1M:den Käufer|K1W:die Käuferin|KN:die Käufer] zurückgezahlt. Ein Wegfall des Preisnachlasses nach § 2 tritt in diesem Fall nicht ein; eine Nachzahlung auf den vollen Kaufpreis ist nicht geschuldet. Weitergehende Ansprüche bestehen nur nach Maßgabe zwingender gesetzlicher Vorschriften.',
        },
        {
          text: 'Stirbt die Katze oder wird sie dauerhaft nicht mehr übergabefähig, während sie sich bei [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] befindet, und beruht dies auf einer schuldhaften Pflichtverletzung [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer], hat die Verkäuferin Anspruch auf Ersatz des daraus entstehenden Schadens. Hierzu können insbesondere Wertverlust, entgangene Zuchtmöglichkeit, Tierarztkosten, Suchkosten, Rechtsverfolgungskosten und sonstige adäquat verursachte Folgeschäden gehören.',
        },
        {
          text: 'Die Haftung der Verkäuferin für leicht fahrlässig verursachte Schäden ist ausgeschlossen, soweit nicht wesentliche Vertragspflichten betroffen sind. Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Die vorstehenden Beschränkungen gelten nicht für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit, für Vorsatz und grobe Fahrlässigkeit, für arglistig verschwiegene Mängel, für übernommene Garantien sowie für die Haftung nach sonstigen zwingenden gesetzlichen Vorschriften.',
        },
      ],
    },

    {
      titel: 'Gesundheitsstatus, Beschaffenheit und Mängelrechte',
      absaetze: [
        {
          text: '[K1M:Der Käufer hatte|K1W:Die Käuferin hatte|KN:Die Käufer hatten] Gelegenheit, die Katze vor Vertragsschluss zu besichtigen und Fragen zu Herkunft, Haltung, Gesundheit und Verhalten zu stellen.',
        },
        {
          text: 'Die Katze wird als lebendes Tier verkauft. [K1M:Dem Käufer|K1W:Der Käuferin|KN:Den Käufern] ist bekannt, dass die zukünftige gesundheitliche, charakterliche und körperliche Entwicklung eines Tieres nicht sicher vorhersehbar ist.',
        },
        {
          text: 'Die Katze wird als Liebhaber- und Heimtier ohne eigenes Zuchtrecht [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer] verkauft. Als Beschaffenheit wird ausschließlich vereinbart:\na) {rasse}-Katze;\nb) Abgabe als Liebhaber- und Heimtier ohne Zuchtrecht [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer];\nc) Impf-, Entwurmungs- und Untersuchungsstatus gemäß den bei Übergabe vorgelegten Unterlagen.',
        },
        {
          text: 'Da die Katze als Liebhaber- und Heimtier verkauft wird, gehören die züchterische Eignung und die Fortpflanzungsfähigkeit der Katze nicht zu der gegenüber [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] geschuldeten Beschaffenheit. Eine fehlende Zuchttauglichkeit oder Fortpflanzungsfähigkeit ist daher keine Minderleistung und kein Sachmangel. Klarstellend sind insbesondere nicht geschuldet und nicht garantiert:\na) spätere Fruchtbarkeit;\nb) Zuchttauglichkeit für [K1M:den Käufer|K1W:die Käuferin|KN:die Käufer];\nc) Wurfgröße;\nd) Geburt lebender Kitten;\ne) Ausstellungserfolge;\nf) eine bestimmte charakterliche Entwicklung;\ng) dauerhafte Gesundheit;\nh) Freiheit von künftig auftretenden genetischen oder rassetypischen Erkrankungen, soweit diese bei Gefahrübergang nicht als Mangel vorlagen.',
        },
        {
          text: 'Ist [K1M:der Käufer Verbraucher|K1W:die Käuferin Verbraucherin|KN:sind die Käufer Verbraucher] und ist die Verkäuferin Unternehmerin im gesetzlichen Sinne, bleiben zwingende gesetzliche Mängelrechte unberührt.',
        },
        {
          text: 'Soweit kein Verbrauchsgüterkauf vorliegt - insbesondere weil die Verkäuferin nicht als Unternehmerin handelt -, werden Ansprüche [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer] wegen Sach- und Rechtsmängeln ausgeschlossen, soweit die Verkäuferin einen Mangel nicht arglistig verschwiegen, keine Garantie übernommen und nicht vorsätzlich oder grob fahrlässig gehandelt hat. Ansprüche wegen Verletzung des Lebens, des Körpers oder der Gesundheit bleiben unberührt.',
        },
        {
          text: '[K1M:Der Käufer ist|K1W:Die Käuferin ist|KN:Die Käufer sind] verpflichtet, erkennbare Erkrankungen, Auffälligkeiten oder Mängel der Katze nach Übergabe unverzüglich tierärztlich abklären zu lassen und die Verkäuferin unverzüglich zu informieren. Diese Pflicht begrenzt zwingende Mängelrechte nicht, dient aber der Schadensminderung und der tiergerechten Versorgung.',
        },
      ],
    },

    {
      titel: 'Haltungspflichten [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer]',
      absaetze: [
        {
          text: '[K1M:Der Käufer verpflichtet sich|K1W:Die Käuferin verpflichtet sich|KN:Die Käufer verpflichten sich], die Katze jederzeit artgerecht, tierschutzkonform, liebevoll und rasseangemessen zu halten.',
        },
        {
          text: '[K1M:Der Käufer hat|K1W:Die Käuferin hat|KN:Die Käufer haben] insbesondere sicherzustellen:\na) ausreichende Ernährung und Wasserversorgung;\nb) hygienische Haltung;\nc) tierärztliche Versorgung bei Krankheit oder Verletzung;\nd) Schutz vor Entlaufen;\ne) keine Haltung in tierschutzwidriger Isolation;\nf) kein Kontakt zu unkastrierten Katern vor Kastration beziehungsweise vor schriftlicher Freigabe durch die Verkäuferin;\ng) keine Abgabe in ein Tierheim.',
        },
        {
          text: 'Bis zur endgültigen Eigentumsübertragung und Kastration darf die Katze keinen ungesicherten Freigang erhalten.',
        },
        {
          text: 'Ein Wohnortwechsel, längere Abwesenheit, dauerhafte Unterbringung bei Dritten oder sonstige wesentliche Änderungen der Haltungsumstände sind der Verkäuferin bis zur endgültigen Eigentumsübertragung vorher anzuzeigen.',
        },
        {
          text: 'Nach endgültiger Eigentumsübertragung [K1M:verpflichtet sich der Käufer|K1W:verpflichtet sich die Käuferin|KN:verpflichten sich die Käufer], die Katze nicht ohne vorherige schriftliche Information an die Verkäuferin dauerhaft an Dritte abzugeben. [K1M:Kann oder will der Käufer|K1W:Kann oder will die Käuferin|KN:Können oder wollen die Käufer] die Katze nicht mehr halten, ist sie der Verkäuferin vorrangig zur Rücknahme oder Weitervermittlung anzubieten.',
        },
      ],
    },

    {
      titel: 'Kastration',
      absaetze: [
        {
          text: 'Die Katze darf vor Abschluss der vorbehaltenen Zuchtnutzung nur mit vorheriger schriftlicher Zustimmung der Verkäuferin kastriert werden, es sei denn, die Kastration ist aus akuten tierärztlichen Notfallgründen zur Abwendung erheblicher Gesundheitsgefahren zwingend erforderlich.',
        },
        {
          text: 'Nach Abschluss der vorbehaltenen Zuchtnutzung ist die Verkäuferin berechtigt, die Kastration der Katze durch eine von ihr ausgewählte Tierarztpraxis auf eigene Kosten durchführen zu lassen.',
        },
        {
          text: 'Die endgültige Eigentumsübertragung kann von der Verkäuferin bis zur abgeschlossenen Kastration und einer tierärztlich vertretbaren Erholungsphase zurückgestellt werden.',
        },
        {
          text: '[K1M:Lässt der Käufer|K1W:Lässt die Käuferin|KN:Lassen die Käufer] die Katze ohne Zustimmung der Verkäuferin kastrieren oder [K1M:wirkt er|K1W:wirkt sie|KN:wirken sie] an einer eigenmächtigen Kastration mit, gilt dies als schuldhafte Vereitelung der vorbehaltenen Zuchtnutzung mit den Rechtsfolgen aus § 2 sowie § 6.',
        },
      ],
    },

    {
      titel: 'Rücktritts- und Rückgaberechte der Verkäuferin',
      absaetze: [
        {
          text: 'Die Verkäuferin ist berechtigt, vom Vertrag zurückzutreten und Herausgabe der Katze zu verlangen, wenn [K1M:der Käufer|K1W:die Käuferin|KN:die Käufer]\na) den geschuldeten Betrag nicht fristgerecht [K1M:zahlt|K1W:zahlt|KN:zahlen];\nb) die Herausgabe der Katze zur Zuchtnutzung [K1M:verweigert oder verzögert|K1W:verweigert oder verzögert|KN:verweigern oder verzögern];\nc) gegen das Zuchtverbot [K1M:verstößt|K1W:verstößt|KN:verstoßen];\nd) die Katze ohne Zustimmung [K1M:weitergibt|K1W:weitergibt|KN:weitergeben];\ne) die Katze tierschutzwidrig [K1M:hält|K1W:hält|KN:halten];\nf) wesentliche Gesundheits- oder Haltungsumstände [K1M:verschweigt|K1W:verschweigt|KN:verschweigen];\ng) sonst schwerwiegend gegen diesen Vertrag [K1M:verstößt|K1W:verstößt|KN:verstoßen].',
        },
        {
          text: 'Vor Ausübung des Rücktrittsrechts setzt die Verkäuferin [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] grundsätzlich eine angemessene Frist zur Abhilfe, sofern die Pflichtverletzung heilbar ist. Einer Fristsetzung bedarf es nicht bei schwerwiegenden Verstößen, Gefahr für die Katze, eigenmächtiger Veräußerung, eigenmächtiger Kastration, unzulässiger Verpaarung oder endgültiger Verweigerung der Herausgabe.',
        },
        {
          text: 'Im Fall eines berechtigten Rücktritts [K1M:hat der Käufer|K1W:hat die Käuferin|KN:haben die Käufer] die Katze unverzüglich an die Verkäuferin herauszugeben. Schadensersatzansprüche der Verkäuferin bleiben unberührt. Die Verkäuferin ist berechtigt, eigene Ansprüche mit etwaigen Rückzahlungsansprüchen [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer] zu verrechnen.',
        },
      ],
    },

    {
      titel: 'Vereinsrechtliche und züchterische Abwicklung',
      absaetze: [
        {
          text: 'Die züchterische Abwicklung der vorbehaltenen Zuchtnutzung, insbesondere Deckmeldung, Wurfmeldung, Registrierung und Abgabe der Kitten, obliegt ausschließlich der Verkäuferin.',
        },
        {
          text: '[K1M:Der Käufer verpflichtet sich|K1W:Die Käuferin verpflichtet sich|KN:Die Käufer verpflichten sich], alle Erklärungen abzugeben und Mitwirkungshandlungen vorzunehmen, die erforderlich oder zweckmäßig sind, damit die Verkäuferin die vorbehaltene Zuchtnutzung ordnungsgemäß durchführen kann.',
        },
        {
          text: '[K1M:Der Käufer verpflichtet sich|K1W:Die Käuferin verpflichtet sich|KN:Die Käufer verpflichten sich], nichts zu unternehmen, was die Stellung der Verkäuferin als Züchterin des Wurfs, die Registrierung der Kitten oder die Abgabe der Kitten beeinträchtigen könnte.',
        },
      ],
    },

    {
      titel: 'Unterlagen',
      absaetze: [
        {
          text: 'Bei endgültiger Übergabe [K1M:erhält der Käufer|K1W:erhält die Käuferin|KN:erhalten die Käufer] folgende Unterlagen, soweit vorhanden und soweit sie die Katze betreffen:\na) Impf- und Entwurmungsnachweise;\nb) tierärztliche Unterlagen, soweit sie zur Halterinformation erforderlich sind.',
        },
        {
          text: 'Nicht herauszugeben sind Unterlagen, die ausschließlich die Zuchtnutzung, den Deckkater, den Wurf, die Kitten, die Wurfregistrierung, die Verkaufsabwicklung der Kitten oder interne züchterische Entscheidungen der Verkäuferin betreffen.',
        },
      ],
    },

    {
      titel: 'Vorvertragliche Hinweise und Widerrufsrecht',
      absaetze: [
        {
          text: 'Wurde der Vertrag im Fernabsatz oder außerhalb von Geschäftsräumen geschlossen und ist die Verkäuferin Unternehmerin im gesetzlichen Sinne und [K1M:ist der Käufer Verbraucher|K1W:ist die Käuferin Verbraucherin|KN:sind die Käufer Verbraucher], kann [K1M:dem Käufer|K1W:der Käuferin|KN:den Käufern] ein gesetzliches Widerrufsrecht zustehen. Ist die Verkäuferin nicht Unternehmerin oder wurde der Vertrag in gleichzeitiger körperlicher Anwesenheit beider Parteien geschlossen, besteht regelmäßig kein gesetzliches Widerrufsrecht.',
        },
        {
          text: '[K1M:Der Käufer bestätigt|K1W:Die Käuferin bestätigt|KN:Die Käufer bestätigen], dass die nach diesem Vertrag maßgeblichen Eigenschaften der Katze, insbesondere die Abgabe als Liebhabertier ohne Zuchtrecht und die in § 9 bezeichneten, nicht geschuldeten Eigenschaften, vor Vertragsschluss mit [K1M:ihm|K1W:ihr|KN:ihnen] erörtert wurden.',
        },
      ],
    },

    {
      titel: 'Individualabreden, Textform und Gesamtschuld',
      absaetze: [
        {
          text: 'Die Parteien haben vor Vertragsschluss insbesondere die folgenden Punkte erörtert:\na) Verkauf als Liebhaber- und Heimtier ohne Zuchtrecht [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer];\nb) Kaufpreis von {preisRegulaer} mit einem unter der Bedingung der Durchführung der Zuchtnutzung stehenden Preisnachlass von {nachlass} sowie Wegfall des Nachlasses bei Nichtdurchführung der Zuchtnutzung;\nc) Eigentumsverbleib bei der Verkäuferin bis Abschluss, Verzicht oder Fristablauf der Zuchtnutzung;\nd) Ausschluss eigener Zuchtnutzung [K1M:des Käufers|K1W:der Käuferin|KN:der Käufer];\ne) Eigentum der Verkäuferin an sämtlichen Kitten aus der vorbehaltenen Zuchtnutzung;\nf) Rücktritts-, Herausgabe- und Schadensersatzrechte der Verkäuferin bei Pflichtverletzungen.',
        },
        {
          text: 'Änderungen, Ergänzungen und Nebenabreden bedürfen zu Beweiszwecken der Textform, soweit nicht gesetzlich eine strengere Form vorgeschrieben ist. Individuell zwischen den Parteien getroffene Abreden gehen diesem Vertrag und etwaigen Formerfordernissen vor.',
        },
        {
          wenn: ['mehrereKaeufer'],
          text: 'Mehrere Käufer haften für die Pflichten aus diesem Vertrag als Gesamtschuldner.',
        },
      ],
    },

    {
      titel: 'Schlussbestimmungen',
      absaetze: [
        { text: 'Es gilt deutsches Recht.' },
        {
          text: 'Sollten einzelne Bestimmungen dieses Vertrags unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. An die Stelle der unwirksamen Bestimmung treten die gesetzlichen Vorschriften. Die Parteien werden sich bemühen, eine rechtlich zulässige Regelung zu vereinbaren, die dem wirtschaftlichen Zweck der unwirksamen Bestimmung möglichst nahekommt.',
        },
        {
          text: 'Die Parteien bestätigen, den Vertrag gelesen, verstanden und je eine Ausfertigung erhalten zu haben.',
        },
      ],
    },

    {
      titel: 'Ergänzende Vereinbarungen',
      wenn: ['zusatz'],
      absaetze: [{ text: '{zusatz}' }],
    },
  ],

  nachspann: [],
};
