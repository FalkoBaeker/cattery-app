import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';

import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Fab,
  Icon,
  IconButton,
  List,
  ListRow,
  Screen,
  Section,
  Sheet,
  Spinner,
  Stack,
  useConfirm,
  useToast,
} from '../../ui';
import { db, getSettings } from '../../db/db';
import { dateOf, formatDate, formatDeadline } from '../../lib/date';
import type { BreedingUse, Contract, ContractType } from '../../types';
import { BREEDING_USE_STAGE_LABEL, CONTRACT_TYPE_LABEL } from '../../types';
import { erinnerungsstufe } from './calc';
import { istBeendet } from './breedingUse';
import { dateiname, pdfOeffnen, teilenOderHerunterladen } from './pdf';
import { tierNamen, verkaeuferdatenFehlen, vertragUntertitel } from './helpers';
import { vertragMitPdfLoeschen } from './store';

export function ContractsScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const vertraege = useLiveQuery(() => db.contracts.orderBy('createdAt').reverse().toArray(), []);
  const vorgaenge = useLiveQuery(() => db.breedingUses.toArray(), []);
  const settings = useLiveQuery(() => getSettings(), []);

  const [artWahlOffen, setArtWahlOffen] = useState(false);
  const [aktion, setAktion] = useState<Contract | null>(null);

  const laedt = vertraege === undefined || vorgaenge === undefined || settings === undefined;

  async function pdfTeilen(vertrag: Contract) {
    if (!vertrag.pdfAttachmentId) return;
    const anhang = await db.attachments.get(vertrag.pdfAttachmentId);
    if (!anhang) {
      toast.error('Das PDF wurde nicht gefunden. Bitte im Vertrag neu erzeugen.');
      return;
    }
    const name = dateiname(CONTRACT_TYPE_LABEL[vertrag.type], tierNamen(vertrag.data));
    const ergebnis = await teilenOderHerunterladen(anhang.blob, name);
    if (ergebnis === 'heruntergeladen') toast.show('PDF gespeichert');
  }

  async function pdfAnzeigen(vertrag: Contract) {
    if (!vertrag.pdfAttachmentId) return;
    const geoeffnet = await pdfOeffnen(vertrag.pdfAttachmentId);
    if (!geoeffnet) toast.error('Das PDF wurde nicht gefunden. Bitte im Vertrag neu erzeugen.');
  }

  async function loeschen(vertrag: Contract) {
    const vorgang = await db.breedingUses.where('contractId').equals(vertrag.id).first();
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
      await vertragMitPdfLoeschen(vertrag);
      setAktion(null);
      toast.success('Vertrag gelöscht');
    } catch {
      toast.error('Der Vertrag konnte nicht gelöscht werden.');
    }
  }

  function neuAnlegen(art: ContractType) {
    setArtWahlOffen(false);
    navigate(`/mehr/vertraege/neu?art=${art === 'standard' ? 'standard' : 'zuchtnutzung'}`);
  }

  const offeneVorgaenge = (vorgaenge ?? [])
    .filter((v) => !istBeendet(v.stage))
    .sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate));

  return (
    <Screen title="Verträge" back>
      {laedt ? (
        <div className="flex justify-center py-16 text-text-faint" aria-label="Wird geladen">
          <Spinner size={26} />
        </div>
      ) : (
        <Stack gap="lg">
          {verkaeuferdatenFehlen(settings) && (
            <Callout tone="warn" icon="alert" title="Verkäuferdaten fehlen">
              <p>
                Ohne Name und Anschrift bleiben im Vertrag Lücken. Beides steht in den
                Einstellungen und bleibt nur auf diesem Gerät.
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

          {offeneVorgaenge.length > 0 && (
            <Section
              title="Laufende Zuchtnutzungen"
              description="Aus Verträgen mit Zuchtvorbehalt. Die Frist läuft."
            >
              <List>
                {offeneVorgaenge.map((v) => (
                  <VorgangZeile
                    key={v.id}
                    vorgang={v}
                    onClick={() => navigate(`/mehr/zuchtnutzung/${v.id}`)}
                  />
                ))}
              </List>
            </Section>
          )}

          <Section
            title={
              vertraege.length === 1 ? '1 Vertrag' : vertraege.length ? `${vertraege.length} Verträge` : undefined
            }
          >
            {vertraege.length === 0 ? (
              <EmptyState
                icon="contract"
                title="Noch kein Vertrag"
                description="Hier sammeln sich alle Kaufverträge. Der Text füllt sich aus deinen Angaben, das PDF bleibt gespeichert."
                action={
                  <Button variant="primary" icon="plus" onClick={() => setArtWahlOffen(true)}>
                    Ersten Vertrag anlegen
                  </Button>
                }
              />
            ) : (
              <List>
                {vertraege.map((c) => (
                  <div key={c.id} className="flex items-center">
                    <div className="min-w-0 flex-1">
                      <ListRow
                        leading={<Icon name="contract" size={20} className="text-text-faint" />}
                        title={CONTRACT_TYPE_LABEL[c.type]}
                        subtitle={vertragUntertitel(c)}
                        trailing={
                          <span className="flex flex-col items-end gap-1">
                            <span>{formatDate(dateOf(c.createdAt))}</span>
                            {c.pdfAttachmentId ? (
                              <Badge tone="ok">PDF</Badge>
                            ) : (
                              <Badge tone="neutral">Entwurf</Badge>
                            )}
                          </span>
                        }
                        chevron={false}
                        onClick={() => navigate(`/mehr/vertraege/${c.id}`)}
                      />
                    </div>
                    <IconButton
                      icon="list"
                      label={`Aktionen für ${CONTRACT_TYPE_LABEL[c.type]}`}
                      onClick={() => setAktion(c)}
                      className="mr-1.5"
                    />
                  </div>
                ))}
              </List>
            )}
          </Section>
        </Stack>
      )}

      <Fab label="Neuer Vertrag" onClick={() => setArtWahlOffen(true)} />

      <Sheet open={artWahlOffen} onClose={() => setArtWahlOffen(false)} title="Neuer Vertrag">
        <Stack>
          <ArtKachel
            titel="Kaufvertrag"
            beschreibung="Der normale Vertrag. Ein oder mehrere Kitten, 8 Paragrafen."
            onClick={() => neuAnlegen('standard')}
          />
          <ArtKachel
            titel="Mit Zuchtnutzungsvorbehalt"
            beschreibung="Ein bis zwei Katzen. Preisnachlass gegen eine einmalige Zuchtnutzung, 17 Paragrafen, mit Frist."
            onClick={() => neuAnlegen('breeding_reserved')}
          />
        </Stack>
      </Sheet>

      <Sheet
        open={aktion !== null}
        onClose={() => setAktion(null)}
        title={aktion ? CONTRACT_TYPE_LABEL[aktion.type] : ''}
      >
        {aktion && (
          <Stack>
            <p className="px-1 text-[0.88rem] text-text-dim">{vertragUntertitel(aktion)}</p>
            <Button
              block
              size="lg"
              icon="edit"
              onClick={() => {
                const id = aktion.id;
                setAktion(null);
                navigate(`/mehr/vertraege/${id}`);
              }}
            >
              Bearbeiten
            </Button>
            {aktion.pdfAttachmentId ? (
              <>
                <Button block size="lg" icon="eye" onClick={() => void pdfAnzeigen(aktion)}>
                  PDF öffnen
                </Button>
                <Button block size="lg" icon="share" onClick={() => void pdfTeilen(aktion)}>
                  PDF teilen
                </Button>
              </>
            ) : (
              <Callout tone="neutral" icon="info">
                Für diesen Vertrag gibt es noch kein PDF. Das erzeugst du im Vertrag selbst.
              </Callout>
            )}
            <Button
              block
              size="lg"
              variant="danger"
              icon="trash"
              onClick={() => void loeschen(aktion)}
            >
              Vertrag löschen
            </Button>
          </Stack>
        )}
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/*  Bausteine                                                          */
/* ------------------------------------------------------------------ */

function VorgangZeile({ vorgang, onClick }: { vorgang: BreedingUse; onClick: () => void }) {
  const stufe = erinnerungsstufe(vorgang.deadlineDate);
  const ton =
    stufe === 'abgelaufen' || stufe === 'ein_monat'
      ? 'alert'
      : stufe === 'drei_monate'
        ? 'warn'
        : 'neutral';

  return (
    <ListRow
      leading={<Icon name="clock" size={20} className="text-text-faint" />}
      title={vorgang.catName}
      subtitle={BREEDING_USE_STAGE_LABEL[vorgang.stage]}
      trailing={<Badge tone={ton}>{formatDeadline(vorgang.deadlineDate)}</Badge>}
      onClick={onClick}
    />
  );
}

function ArtKachel({
  titel,
  beschreibung,
  onClick,
}: {
  titel: string;
  beschreibung: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full flex-col gap-1 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-left active:bg-surface-2"
    >
      <span className="flex items-center gap-2 font-medium text-text">
        <Icon name="contract" size={19} className="text-accent" />
        {titel}
      </span>
      <span className="text-[0.85rem] leading-relaxed text-text-dim">{beschreibung}</span>
    </button>
  );
}
