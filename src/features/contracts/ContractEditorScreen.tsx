import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';

import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Icon,
  IconButton,
  List,
  ListRow,
  MoneyInput,
  NumberInput,
  Screen,
  Section,
  Segmented,
  Sheet,
  Spinner,
  Stack,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../ui';
import { db, getSettings, insert } from '../../db/db';
import { formatDate } from '../../lib/date';
import { formatMoney } from '../../lib/format';
import type {
  Contract,
  ContractAnimal,
  ContractData,
  ContractParty,
  ContractType,
  Kitten,
  Litter,
} from '../../types';
import { CONTRACT_TYPE_LABEL, kittenLabel } from '../../types';
import {
  ermaessigterPreisCents,
  fristende,
  restsummeCents,
  VORGABE_DECKVERSUCHE,
  VORGABE_HERAUSGABETAGE,
  VORGABE_NACHZAHLUNGSTAGE,
  VORGABE_NUTZUNGSMONATE,
  VORGABE_VERLAENGERUNGSMONATE,
} from './calc';
import { rendereVertrag, vertragAlsText } from './render';
import { dateiname, pdfAmVertragSpeichern, teilenOderHerunterladen, vertragsPdfBlob } from './pdf';
import { vorgangAnlegen, vorgangAusVertragAktualisieren, vorgangZuVertrag } from './breedingUse';
import {
  artWechseln,
  neuerEntwurf,
  tierNamen,
  verkaeuferdatenFehlen,
  vertragsregelnAnwenden,
} from './helpers';
import { vertragAktualisieren, vertragMitPdfLoeschen } from './store';

/* ------------------------------------------------------------------ */
/*  Bildschirm                                                         */
/* ------------------------------------------------------------------ */

export function ContractEditorScreen() {
  const { contractId } = useParams();
  const [suche] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const settings = useLiveQuery(() => getSettings(), []);
  const vorhanden = useLiveQuery(
    async () => (contractId ? ((await db.contracts.get(contractId)) ?? null) : null),
    [contractId],
  );
  const vorgang = useLiveQuery(
    async () => (contractId ? ((await vorgangZuVertrag(contractId)) ?? null) : null),
    [contractId],
  );

  const [entwurf, setEntwurf] = useState<ContractData | null>(null);
  const [geaendert, setGeaendert] = useState(false);
  const [nichtGefunden, setNichtGefunden] = useState(false);
  const [vorschauOffen, setVorschauOffen] = useState(false);
  const [kittenWahlOffen, setKittenWahlOffen] = useState(false);
  const [arbeitet, setArbeitet] = useState(false);
  const initialisiert = useRef(false);
  /** Kennung des soeben angelegten Vertrages, bevor die Adresse nachzieht. */
  const gespeicherteId = useRef<string | null>(null);

  /* Entwurf einmalig aufbauen — aus der Datenbank oder aus den Quellen. */
  useEffect(() => {
    if (initialisiert.current || !settings) return;

    if (contractId) {
      if (vorhanden === undefined) return;
      initialisiert.current = true;
      if (vorhanden === null) {
        setNichtGefunden(true);
        return;
      }
      setEntwurf(vertragsregelnAnwenden(vorhanden.data));
      return;
    }

    initialisiert.current = true;
    const art: ContractType = suche.get('art') === 'zuchtnutzung' ? 'breeding_reserved' : 'standard';
    void (async () => {
      const kittenId = suche.get('kittenId');
      const interestId = suche.get('interestId');
      const kitten = kittenId ? await db.kittens.get(kittenId) : undefined;
      const litter = kitten ? await db.litters.get(kitten.litterId) : undefined;
      const interest = interestId
        ? await db.interests.get(interestId)
        : kitten?.interestId
          ? await db.interests.get(kitten.interestId)
          : undefined;
      setEntwurf(neuerEntwurf(art, settings, { kitten, litter, interest }));
    })();
  }, [contractId, vorhanden, settings, suche]);

  const gesetzt = useMemo(() => {
    if (!entwurf || !settings) return null;
    return rendereVertrag({ data: entwurf, seller: settings.seller });
  }, [entwurf, settings]);

  function aendern(teil: Partial<ContractData>) {
    setEntwurf((e) => (e ? { ...e, ...teil } : e));
    setGeaendert(true);
  }

  /* ---------------------------------------------------------------- */

  /**
   * Speichert und liefert den gespeicherten Vertrag zurück.
   *
   * Die Kennung kommt aus der Adresse oder — direkt nach dem ersten
   * Speichern — aus `gespeicherteId`. Sich auf die Live-Abfrage zu
   * verlassen wäre falsch: die hinkt einen Wimpernschlag hinterher,
   * und ein zweites Tippen würde einen zweiten Vertrag anlegen.
   */
  async function speichern(): Promise<Contract | null> {
    if (!entwurf) return null;
    const gueltigerEntwurf = vertragsregelnAnwenden(entwurf);
    const id = contractId ?? gespeicherteId.current;

    if (id) {
      const bestand = await db.contracts.get(id);
      if (bestand) {
        const aktualisiert = await vertragAktualisieren(
          bestand,
          gueltigerEntwurf.type,
          gueltigerEntwurf,
        );
        if (gueltigerEntwurf.type === 'breeding_reserved') {
          await vorgangAnlegen(aktualisiert);
          await vorgangAusVertragAktualisieren(aktualisiert);
        }
        setEntwurf(gueltigerEntwurf);
        setGeaendert(false);
        return aktualisiert;
      }
    }

    const neu = await insert(db.contracts, {
      type: gueltigerEntwurf.type,
      data: gueltigerEntwurf,
      interestId: suche.get('interestId') ?? undefined,
      litterId: suche.get('litterId') ?? undefined,
    });
    setEntwurf(gueltigerEntwurf);
    gespeicherteId.current = neu.id;
    if (gueltigerEntwurf.type === 'breeding_reserved') await vorgangAnlegen(neu);
    setGeaendert(false);
    navigate(`/mehr/vertraege/${neu.id}`, { replace: true });
    return neu;
  }

  async function speichernUndMelden() {
    setArbeitet(true);
    try {
      const c = await speichern();
      if (c) {
        if (vorhanden?.pdfAttachmentId && !c.pdfAttachmentId) {
          toast.show('Vertrag gespeichert. Das bisherige PDF war nicht mehr aktuell und wurde entfernt.', {
            tone: 'warn',
            durationMs: 7000,
          });
        } else {
          toast.success('Vertrag gespeichert');
        }
      }
    } catch {
      toast.error('Der Vertrag konnte nicht gespeichert werden.');
    } finally {
      setArbeitet(false);
    }
  }

  async function pdfErzeugen(teilen: boolean) {
    if (!gesetzt || !entwurf) return;
    setArbeitet(true);
    try {
      // Erst speichern, damit das PDF genau zum gespeicherten Stand passt.
      const c = await speichern();
      if (!c) return;
      const blob = await vertragsPdfBlob(gesetzt);
      await pdfAmVertragSpeichern(c, blob);
      const name = dateiname(gesetzt.titel, tierNamen(entwurf));
      if (teilen) {
        const ergebnis = await teilenOderHerunterladen(blob, name);
        if (ergebnis === 'heruntergeladen') toast.show('PDF gespeichert');
        else if (ergebnis === 'geteilt') toast.success('PDF geteilt');
        else toast.show('PDF ist am Vertrag gespeichert');
      } else {
        toast.success('PDF erzeugt und am Vertrag gespeichert');
      }
    } catch {
      toast.error('Das PDF konnte nicht erzeugt werden.');
    } finally {
      setArbeitet(false);
    }
  }

  async function loeschen() {
    if (!contractId || !vorhanden) return;
    const ok = await confirm({
      title: 'Vertrag löschen?',
      message: vorgang
        ? `Der Vertrag und das erzeugte PDF werden gelöscht. Der Zuchtnutzungs-Vorgang zu ${vorgang.catName} bleibt mit seinem Verlauf bestehen.`
        : 'Der Vertrag und das erzeugte PDF werden gelöscht. Das lässt sich nicht rückgängig machen.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    try {
      await vertragMitPdfLoeschen(vorhanden);
      toast.success('Vertrag gelöscht');
      navigate('/mehr/vertraege', { replace: true });
    } catch {
      toast.error('Der Vertrag konnte nicht gelöscht werden.');
    }
  }

  /* ---------------------------------------------------------------- */

  if (nichtGefunden) {
    return (
      <Screen title="Vertrag" back>
        <EmptyState
          icon="contract"
          title="Dieser Vertrag ist nicht mehr da"
          description="Vielleicht wurde er gelöscht. In der Übersicht stehen alle vorhandenen Verträge."
          action={
            <Button variant="primary" onClick={() => navigate('/mehr/vertraege', { replace: true })}>
              Zur Übersicht
            </Button>
          }
        />
      </Screen>
    );
  }

  if (!entwurf || !settings || !gesetzt) {
    return (
      <Screen title="Vertrag" back>
        <div className="flex justify-center py-16 text-text-faint" aria-label="Wird geladen">
          <Spinner size={26} />
        </div>
      </Screen>
    );
  }

  const istZucht = entwurf.type === 'breeding_reserved';
  const istBereitsGespeichert = Boolean(contractId || gespeicherteId.current);

  return (
    <Screen
      title={CONTRACT_TYPE_LABEL[entwurf.type]}
      subtitle={
        geaendert ? 'Noch nicht gespeichert' : contractId ? 'Gespeichert' : 'Neuer Vertrag'
      }
      back
      actions={
        contractId ? (
          <IconButton icon="trash" label="Vertrag löschen" onClick={() => void loeschen()} />
        ) : undefined
      }
    >
      <Stack gap="lg">
        {verkaeuferdatenFehlen(settings) && (
          <Callout tone="warn" icon="alert" title="Verkäuferdaten fehlen">
            <p>
              Name und Anschrift der Verkäuferin stehen in den Einstellungen. Ohne sie bleiben im
              Vertrag Lücken zum Ausfüllen von Hand.
            </p>
            <Button
              size="sm"
              variant="secondary"
              icon="settings"
              className="mt-2"
              onClick={() => navigate('/mehr/einstellungen')}
            >
              Zu den Einstellungen
            </Button>
          </Callout>
        )}

        {/* --- Vertragsart --- */}
        <Section title="Vertragsart">
          <Card>
            {istBereitsGespeichert ? (
              <div className="flex items-center justify-between gap-3 px-1">
                <div>
                  <p className="font-medium text-text">{CONTRACT_TYPE_LABEL[entwurf.type]}</p>
                  <p className="mt-0.5 text-[0.8rem] text-text-faint">
                    Nach dem ersten Speichern festgelegt
                  </p>
                </div>
                <Badge tone="neutral">fest</Badge>
              </div>
            ) : (
              <Segmented<ContractType>
                value={entwurf.type}
                onChange={(v) => {
                  setEntwurf(artWechseln(entwurf, v, settings));
                  setGeaendert(true);
                }}
                options={[
                  { value: 'standard', label: 'Kaufvertrag' },
                  { value: 'breeding_reserved', label: 'Mit Zuchtvorbehalt' },
                ]}
              />
            )}
            <p className="mt-3 px-1 text-[0.82rem] leading-relaxed text-text-dim">
              {istZucht
                ? '17 Paragrafen. Ein bis zwei Katzen, immer weiblich. Der Preisnachlass gilt für eine einmalige Zuchtnutzung; daraus entsteht ein Vorgang mit Frist.'
                : '8 Paragrafen. Ein oder mehrere Kitten in einem Vertrag.'}
            </p>
          </Card>
        </Section>

        {/* --- Käufer --- */}
        <Section
          title={entwurf.buyers.length > 1 ? 'Käufer' : 'Käuferseite'}
          description="Bei mehr als einer Person erscheinen die Gesamtschuldner-Klauseln."
        >
          <Stack gap="sm">
            {entwurf.buyers.map((k, i) => (
              <KaeuferKarte
                key={i}
                partei={k}
                nummer={i + 1}
                zeigeNummer={entwurf.buyers.length > 1}
                entfernbar={entwurf.buyers.length > 1}
                onChange={(neu) =>
                  aendern({ buyers: entwurf.buyers.map((b, j) => (j === i ? neu : b)) })
                }
                onRemove={() => aendern({ buyers: entwurf.buyers.filter((_, j) => j !== i) })}
              />
            ))}
            <Button
              icon="plus"
              block
              onClick={() => aendern({ buyers: [...entwurf.buyers, { name: '', address: '' }] })}
            >
              Weitere Person
            </Button>
          </Stack>
        </Section>

        {/* --- Tiere --- */}
        <Section
          title={entwurf.animals.length > 1 ? 'Tiere' : 'Tier'}
          description={
            istZucht
              ? 'Ein bis zwei Katzen, immer weiblich.'
              : 'Mehrere Kitten in einem Vertrag sind möglich.'
          }
        >
          <Stack gap="sm">
            {entwurf.animals.map((t, i) => (
              <TierKarte
                key={i}
                tier={t}
                nummer={i + 1}
                zeigeNummer={entwurf.animals.length > 1}
                entfernbar={entwurf.animals.length > 1}
                nurWeiblich={istZucht}
                onChange={(neu) =>
                  aendern({ animals: entwurf.animals.map((a, j) => (j === i ? neu : a)) })
                }
                onRemove={() => aendern({ animals: entwurf.animals.filter((_, j) => j !== i) })}
              />
            ))}
            <div className="flex gap-2">
              <Button
                icon="plus"
                className="flex-1"
                disabled={istZucht && entwurf.animals.length >= 2}
                onClick={() =>
                  aendern({
                    animals: [...entwurf.animals, { name: '', sex: 'female' }],
                  })
                }
              >
                Weiteres Tier
              </Button>
              <Button
                icon="paw"
                className="flex-1"
                disabled={istZucht && entwurf.animals.length >= 2}
                onClick={() => setKittenWahlOffen(true)}
              >
                Aus Wurf
              </Button>
            </div>
          </Stack>
        </Section>

        {/* --- Preis --- */}
        {istZucht ? (
          <Section title="Preis und Nachlass">
            <Card>
              <Stack>
                <MoneyInput
                  label="Regulärer Kaufpreis"
                  valueCents={entwurf.regularPriceCents ?? null}
                  onValueChange={(c) => aendern({ regularPriceCents: c ?? undefined })}
                />
                <MoneyInput
                  label="Preisnachlass für die Zuchtnutzung"
                  valueCents={entwurf.discountCents ?? null}
                  onValueChange={(c) => aendern({ discountCents: c ?? undefined })}
                  hint="Dieser Betrag wird nachgezahlt, wenn die Frist verstreicht."
                />
                <Rechenzeile
                  label="Ermäßigter Kaufpreis"
                  wert={ermaessigterPreisCents(entwurf.regularPriceCents, entwurf.discountCents)}
                />
              </Stack>
            </Card>
          </Section>
        ) : (
          <Section title="Preis">
            <Card>
              <Stack>
                <MoneyInput
                  label="Gesamtpreis"
                  valueCents={entwurf.totalPriceCents ?? null}
                  onValueChange={(c) => aendern({ totalPriceCents: c ?? undefined })}
                />
                <MoneyInput
                  label="Anzahlung (meist keine)"
                  valueCents={entwurf.depositCents ?? null}
                  onValueChange={(c) => aendern({ depositCents: c ?? undefined })}
                  hint="Leer lassen, wenn keine Anzahlung vereinbart ist."
                />
                <Rechenzeile
                  label="Restsumme"
                  wert={restsummeCents(entwurf.totalPriceCents, entwurf.depositCents)}
                />
              </Stack>
            </Card>
          </Section>
        )}

        {/* --- Übergabe / Fristen --- */}
        {istZucht ? (
          <Section title="Fristen" description="Alle Fristen lassen sich einzeln ändern.">
            <Card>
              <Stack>
                <TextInput
                  type="date"
                  label="Erstmalige Überlassung (Fristbeginn)"
                  value={entwurf.breedingUseStartDate ?? ''}
                  onChange={(e) => aendern({ breedingUseStartDate: e.target.value || undefined })}
                  hint="Ab diesem Tag läuft die Frist für die Zuchtnutzung."
                />
                {entwurf.breedingUseStartDate && (
                  <Callout tone="accent" icon="clock">
                    Die Frist endet am{' '}
                    <strong>
                      {formatDate(
                        fristende(
                          entwurf.breedingUseStartDate,
                          entwurf.breedingUseMonths ?? VORGABE_NUTZUNGSMONATE,
                        ),
                      )}
                    </strong>
                    .
                  </Callout>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput
                    label="Nutzungsfrist"
                    suffix="Mon."
                    value={entwurf.breedingUseMonths ?? VORGABE_NUTZUNGSMONATE}
                    onValueChange={(v) => aendern({ breedingUseMonths: v ?? undefined })}
                  />
                  <NumberInput
                    label="Verlängerung"
                    suffix="Mon."
                    value={entwurf.breedingUseExtensionMonths ?? VORGABE_VERLAENGERUNGSMONATE}
                    onValueChange={(v) => aendern({ breedingUseExtensionMonths: v ?? undefined })}
                  />
                  <NumberInput
                    label="Herausgabe binnen"
                    suffix="Tg."
                    value={entwurf.handoverDeadlineDays ?? VORGABE_HERAUSGABETAGE}
                    onValueChange={(v) => aendern({ handoverDeadlineDays: v ?? undefined })}
                  />
                  <NumberInput
                    label="Deckversuche"
                    value={entwurf.matingAttempts ?? VORGABE_DECKVERSUCHE}
                    onValueChange={(v) => aendern({ matingAttempts: v ?? undefined })}
                  />
                  <NumberInput
                    label="Nachzahlung binnen"
                    suffix="Tg."
                    value={entwurf.backPaymentDays ?? VORGABE_NACHZAHLUNGSTAGE}
                    onValueChange={(v) => aendern({ backPaymentDays: v ?? undefined })}
                  />
                </div>
              </Stack>
            </Card>
          </Section>
        ) : (
          <Section title="Übergabe">
            <Card>
              <Stack>
                <TextInput
                  label="Übergabetermin"
                  placeholder="Anfang Juni 2026"
                  value={entwurf.handoverText ?? ''}
                  onChange={(e) => aendern({ handoverText: e.target.value })}
                  hint="Freier Text — kein festes Datum nötig."
                />
                <TextInput
                  label="Übergabeort"
                  placeholder={settings.seller.place ?? 'Ort'}
                  value={entwurf.handoverPlace ?? ''}
                  onChange={(e) => aendern({ handoverPlace: e.target.value })}
                />
              </Stack>
            </Card>
          </Section>
        )}

        {/* --- Zusatz --- */}
        <Section
          title="Individuelle Vereinbarungen"
          description="Erscheint nur im Vertrag, wenn hier etwas steht."
        >
          <Card>
            <TextArea
              label="Zusätzlicher Paragraf"
              rows={3}
              placeholder="Zum Beispiel: Mia bleibt bis Ende Juli bei der Züchterin."
              value={entwurf.additionalAgreement ?? ''}
              onChange={(e) => aendern({ additionalAgreement: e.target.value })}
            />
          </Card>
        </Section>

        {/* --- Hinweise --- */}
        {gesetzt.hinweise.length > 0 && (
          <Callout tone="neutral" icon="info" title="Noch offen">
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
              {gesetzt.hinweise.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <p className="mt-2">
              Der Vertrag lässt sich trotzdem drucken — offene Stellen erscheinen als Lücke zum
              Ausfüllen.
            </p>
          </Callout>
        )}

        {/* --- Live-Vorschau --- */}
        <Section
          title="Vorschau"
          description={`${gesetzt.paragrafen.length} Paragrafen · so kommt der Text aufs Papier`}
          action={
            <Button size="sm" icon="eye" onClick={() => setVorschauOffen(true)}>
              Ganz
            </Button>
          }
        >
          <Card padded={false}>
            <div className="max-h-96 overflow-y-auto overscroll-contain px-4 py-4">
              <Vertragstext text={vertragAlsText(gesetzt)} />
            </div>
          </Card>
        </Section>

        {/* --- Aktionen --- */}
        <Stack gap="sm">
          <Button
            block
            size="lg"
            variant="primary"
            icon="check"
            loading={arbeitet}
            onClick={() => void speichernUndMelden()}
          >
            {geaendert || !contractId ? 'Vertrag speichern' : 'Gespeichert'}
          </Button>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              size="lg"
              icon="download"
              loading={arbeitet}
              onClick={() => void pdfErzeugen(false)}
            >
              PDF erzeugen
            </Button>
            <Button
              className="flex-1"
              size="lg"
              icon="share"
              loading={arbeitet}
              onClick={() => void pdfErzeugen(true)}
            >
              Teilen
            </Button>
          </div>
          {vorhanden?.pdfAttachmentId && (
            <p className="px-1 text-center text-[0.8rem] text-text-faint">
              Ein PDF ist am Vertrag gespeichert. Ein neues ersetzt es.
            </p>
          )}
        </Stack>

        {istZucht && vorgang && (
          <Section title="Zuchtnutzung">
            <List>
              <ListRow
                leading={<Icon name="clock" size={20} className="text-text-faint" />}
                title={`Vorgang zu ${vorgang.catName}`}
                subtitle={`Frist bis ${formatDate(vorgang.deadlineDate)}`}
                onClick={() => navigate(`/mehr/zuchtnutzung/${vorgang.id}`)}
              />
            </List>
          </Section>
        )}
      </Stack>

      {/* Vollbild-Vorschau */}
      <Sheet
        open={vorschauOffen}
        onClose={() => setVorschauOffen(false)}
        title="Vorschau"
        tall
        footer={
          <Button block size="lg" icon="share" onClick={() => void pdfErzeugen(true)}>
            Als PDF teilen
          </Button>
        }
      >
        <Vertragstext text={vertragAlsText(gesetzt)} />
      </Sheet>

      {/* Kitten aus einem Wurf übernehmen */}
      <KittenWahl
        open={kittenWahlOffen}
        onClose={() => setKittenWahlOffen(false)}
        nurWeiblich={istZucht}
        onPick={(tier) => {
          aendern({
            animals: [
              ...entwurf.animals.filter((a) => a.name?.trim() || a.chipNo?.trim()),
              tier,
            ],
          });
          setKittenWahlOffen(false);
        }}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/*  Bausteine                                                          */
/* ------------------------------------------------------------------ */

function Vertragstext({ text }: { text: string }) {
  return (
    <pre
      aria-label="Vertragstext"
      className="font-sans text-[0.86rem] leading-relaxed whitespace-pre-wrap text-text"
    >
      {text}
    </pre>
  );
}

function Rechenzeile({ label, wert }: { label: string; wert: number | null }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-field)] bg-surface-2 px-3.5 py-3">
      <span className="text-[0.9rem] text-text-dim">{label}</span>
      <span className="tabular font-semibold text-text">
        {wert == null ? '—' : formatMoney(wert)}
      </span>
    </div>
  );
}

function KaeuferKarte({
  partei,
  nummer,
  zeigeNummer,
  entfernbar,
  onChange,
  onRemove,
}: {
  partei: ContractParty;
  nummer: number;
  zeigeNummer: boolean;
  entfernbar: boolean;
  onChange: (p: ContractParty) => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <Stack>
        <div className="flex items-center justify-between">
          <span className="text-[0.8rem] font-semibold tracking-wide text-text-dim uppercase">
            {zeigeNummer ? `Person ${nummer}` : 'Käuferseite'}
          </span>
          {entfernbar && (
            <IconButton icon="trash" label={`Person ${nummer} entfernen`} size="sm" onClick={onRemove} />
          )}
        </div>
        <TextInput
          label="Name"
          placeholder="Vor- und Nachname"
          value={partei.name ?? ''}
          onChange={(e) => onChange({ ...partei, name: e.target.value })}
        />
        <TextInput
          label="Anschrift"
          placeholder="Straße, PLZ Ort"
          value={partei.address ?? ''}
          onChange={(e) => onChange({ ...partei, address: e.target.value })}
        />
        <TextInput
          type="date"
          label="Geburtsdatum"
          value={partei.birthDate ?? ''}
          onChange={(e) => onChange({ ...partei, birthDate: e.target.value || undefined })}
        />
        <Segmented
          label="Anrede im Vertragstext"
          value={partei.sex === 'female' ? 'female' : 'male'}
          onChange={(v) => onChange({ ...partei, sex: v })}
          options={[
            { value: 'male', label: 'der Käufer' },
            { value: 'female', label: 'die Käuferin' },
          ]}
        />
      </Stack>
    </Card>
  );
}

function TierKarte({
  tier,
  nummer,
  zeigeNummer,
  entfernbar,
  nurWeiblich,
  onChange,
  onRemove,
}: {
  tier: ContractAnimal;
  nummer: number;
  zeigeNummer: boolean;
  entfernbar: boolean;
  nurWeiblich: boolean;
  onChange: (t: ContractAnimal) => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <Stack>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[0.8rem] font-semibold tracking-wide text-text-dim uppercase">
            {zeigeNummer ? `Tier ${nummer}` : 'Tier'}
            {tier.kittenId && <Badge tone="accent">aus Wurf</Badge>}
          </span>
          {entfernbar && (
            <IconButton icon="trash" label={`Tier ${nummer} entfernen`} size="sm" onClick={onRemove} />
          )}
        </div>
        <TextInput
          label="Rufname"
          placeholder="Mia"
          value={tier.name ?? ''}
          onChange={(e) => onChange({ ...tier, name: e.target.value })}
        />
        {nurWeiblich ? (
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[0.85rem] font-medium text-text-dim">Geschlecht</span>
            <div className="min-h-11 rounded-[var(--radius-field)] bg-surface-2 px-3.5 py-2.5 text-[0.95rem] text-text">
              Katze (weiblich)
            </div>
          </div>
        ) : (
          <Segmented
            label="Geschlecht"
            value={tier.sex}
            onChange={(v) => onChange({ ...tier, sex: v })}
            options={[
              { value: 'female', label: 'Katze' },
              { value: 'male', label: 'Kater' },
            ]}
          />
        )}
        <TextInput
          label="Chipnummer"
          inputMode="numeric"
          placeholder="276093400000001"
          hint="15 Ziffern"
          value={tier.chipNo ?? ''}
          onChange={(e) => onChange({ ...tier, chipNo: e.target.value })}
        />
        <TextInput
          type="date"
          label="Geburtsdatum"
          value={tier.birthDate ?? ''}
          onChange={(e) => onChange({ ...tier, birthDate: e.target.value || undefined })}
        />
      </Stack>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Kitten aus einem Wurf übernehmen                                   */
/* ------------------------------------------------------------------ */

function KittenWahl({
  open,
  onClose,
  nurWeiblich,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  nurWeiblich: boolean;
  onPick: (tier: ContractAnimal) => void;
}) {
  const daten = useLiveQuery(async () => {
    const kitten = await db.kittens.toArray();
    const wuerfe = await db.litters.toArray();
    return { kitten, wuerfe };
  }, []);

  const passend = (daten?.kitten ?? []).filter(
    (k) => !k.stillborn && k.saleStatus !== 'deceased' && (!nurWeiblich || k.sex !== 'male'),
  );

  function wurfVon(k: Kitten): Litter | undefined {
    return daten?.wuerfe.find((w) => w.id === k.litterId);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Kitten übernehmen" tall>
      {daten === undefined ? (
        <div className="flex justify-center py-12 text-text-faint" aria-label="Wird geladen">
          <Spinner size={24} />
        </div>
      ) : passend.length === 0 ? (
        <EmptyState
          icon="paw"
          title={nurWeiblich ? 'Keine passende Katze' : 'Noch keine Kitten'}
          description={
            nurWeiblich
              ? 'Für den Vertrag mit Zuchtvorbehalt kommen nur weibliche Tiere infrage. Du kannst das Tier auch von Hand eintragen.'
              : 'Sobald ein Wurf angelegt ist, lassen sich die Kitten hier übernehmen. Von Hand geht es jederzeit.'
          }
        />
      ) : (
        <List>
          {passend.map((k) => {
            const wurf = wurfVon(k);
            return (
              <ListRow
                key={k.id}
                leading={<Icon name="paw" size={19} className="text-text-faint" />}
                title={kittenLabel(k)}
                subtitle={[
                  k.sex === 'male' ? 'Kater' : k.sex === 'female' ? 'Katze' : 'Geschlecht offen',
                  wurf?.birthDate ? `geb. ${formatDate(wurf.birthDate)}` : null,
                  k.chipNo ? `Chip ${k.chipNo}` : 'ohne Chip',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onClick={() =>
                  onPick({
                    kittenId: k.id,
                    name: kittenLabel(k),
                    sex: k.sex === 'male' ? 'male' : 'female',
                    birthDate: wurf?.birthDate,
                    chipNo: k.chipNo,
                  })
                }
              />
            );
          })}
        </List>
      )}
    </Sheet>
  );
}
