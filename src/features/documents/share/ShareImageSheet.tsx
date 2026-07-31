/**
 * Blatt „Bild für WhatsApp".
 *
 * Aufrufbar vom Kitten aus. Erzeugt ein fertiges Bild — Foto, persönliche
 * Anrede, Name bzw. Halsbandfarbe, Alter, Gewicht, kleine Kurve und ein paar
 * eigene Zeilen — und übergibt es an das Teilen-Blatt von iOS.
 *
 * Der Kunden-Link wurde ausdrücklich verworfen (F101/F103): sie schreibt
 * persönlich und will das auch bleiben.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  Callout,
  IconButton,
  Sheet,
  Spinner,
  TextArea,
  TextInput,
  useToast,
} from '../../../ui';
import { db, getSettings } from '../../../db/db';
import { kittenLabel, type ID } from '../../../types';
import { ageInDays, formatDate, todayISO } from '../../../lib/date';
import { buildShareFileName } from '../lib/filenames';
import { useObjectUrl } from '../useObjectUrls';
import {
  buildGreeting,
  buildShareCardModel,
  latestDailySamples,
  type CurveSample,
} from './shareCardLayout';
import { renderShareCard } from './renderShareCard';
import { shareOrDownload } from './shareFile';

export interface ShareImageSheetProps {
  open: boolean;
  onClose: () => void;
  kittenId: ID;
}

export function ShareImageSheet({ open, onClose, kittenId }: ShareImageSheetProps) {
  const toast = useToast();
  const photoInput = useRef<HTMLInputElement>(null);

  const [photo, setPhoto] = useState<Blob | null>(null);
  const [greeting, setGreeting] = useState('');
  const [greetingTouched, setGreetingTouched] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<Blob | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const photoUrl = useObjectUrl(photo);
  const previewUrl = useObjectUrl(preview);

  /* --- Daten ---------------------------------------------------------- */

  const data = useLiveQuery(async () => {
    const kitten = (await db.kittens.get(kittenId)) ?? null;
    if (!kitten) return { kitten: null } as const;
    const [litter, interest, weights, settings] = await Promise.all([
      db.litters.get(kitten.litterId),
      kitten.interestId ? db.interests.get(kitten.interestId) : Promise.resolve(undefined),
      db.weights.where('kittenId').equals(kittenId).toArray(),
      getSettings(),
    ]);
    return { kitten, litter, interest, weights, settings } as const;
  }, [kittenId]);

  const kitten = data?.kitten ?? null;
  const birthDate = data?.litter?.birthDate;
  const ageDays = birthDate ? ageInDays(birthDate) : null;

  const samples: CurveSample[] = useMemo(() => {
    if (!data?.weights) return [];
    return latestDailySamples(data.weights);
  }, [data?.weights]);

  // Die Kurve zeigt bewusst einen Tageswert. Die groß hervorgehobene aktuelle
  // Zahl muss dagegen die wirklich letzte Messung sein — nicht der Mittelwert
  // aus mehreren Wiegungen desselben Tages.
  const latestGrams =
    data?.weights?.reduce<(typeof data.weights)[number] | undefined>(
      (latest, entry) => (!latest || entry.at > latest.at ? entry : latest),
      undefined,
    )?.grams ?? null;

  // Anrede aus dem Interessenten vorbelegen — überschreibbar.
  useEffect(() => {
    if (!open) return;
    if (greetingTouched) return;
    setGreeting(buildGreeting(data?.interest?.name));
  }, [open, data?.interest?.name, greetingTouched]);

  // Beim Schließen alles zurücksetzen, damit das nächste Kitten sauber startet.
  useEffect(() => {
    if (open) return;
    setPhoto(null);
    setPreview(null);
    setMessage('');
    setGreetingTouched(false);
    setError(null);
  }, [open]);

  const model = useMemo(
    () =>
      buildShareCardModel({
        interestName: data?.interest?.name,
        greetingOverride: greeting,
        kittenName: kitten ? kittenLabel(kitten) : '',
        ageDays,
        latestGrams,
        message,
        catteryName: data?.settings?.seller.catteryName || data?.settings?.seller.name,
        samples,
      }),
    [data, greeting, kitten, ageDays, latestGrams, message, samples],
  );

  /* --- Vorschau ------------------------------------------------------- */

  useEffect(() => {
    if (!open || !kitten) return;
    let cancelled = false;
    setRendering(true);
    const handle = window.setTimeout(() => {
      renderShareCard({ model, photo, dateText: formatDate(todayISO()) })
        .then((result) => {
          if (cancelled) return;
          setPreview(result.blob);
          setError(null);
        })
        .catch(() => {
          if (!cancelled) setError('Die Vorschau konnte nicht erzeugt werden.');
        })
        .finally(() => {
          if (!cancelled) setRendering(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, kitten, model, photo]);

  /* --- Teilen --------------------------------------------------------- */

  async function onShare() {
    if (!kitten) return;
    setSharing(true);
    try {
      const result = await renderShareCard({
        model,
        photo,
        dateText: formatDate(todayISO()),
      });
      const fileName = buildShareFileName({
        kittenName: kittenLabel(kitten),
        ageDays,
        date: todayISO(),
      });
      const outcome = await shareOrDownload(result.blob, fileName, model.kittenName, undefined);
      if (outcome === 'downloaded') {
        toast.show('Teilen geht auf diesem Gerät nicht — das Bild wurde heruntergeladen.', {
          tone: 'neutral',
          icon: 'download',
          durationMs: 5000,
        });
      }
    } catch {
      toast.error('Das Bild konnte nicht erzeugt werden.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title="Bild für WhatsApp"
      footer={
        <Button
          block
          variant="primary"
          icon="share"
          onClick={onShare}
          loading={sharing}
          disabled={!kitten || Boolean(error)}
        >
          Teilen
        </Button>
      }
    >
      {data === undefined ? (
        <div className="flex min-h-40 items-center justify-center text-text-dim">
          <Spinner size={26} />
        </div>
      ) : !kitten ? (
        <Callout tone="alert" icon="alert" title="Kitten nicht gefunden">
          Dieses Kitten gibt es nicht mehr.
        </Callout>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Vorschau */}
          <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-2">
            {previewUrl ? (
              <img src={previewUrl} alt="Vorschau des Bildes" className="block w-full" />
            ) : (
              <div className="flex min-h-56 items-center justify-center text-text-dim">
                <Spinner size={26} />
              </div>
            )}
            {rendering && previewUrl && (
              <span className="absolute top-2 right-2 rounded-full bg-surface/90 px-2.5 py-1 text-[0.75rem] text-text-dim">
                wird aufgebaut …
              </span>
            )}
          </div>

          {error && (
            <Callout tone="alert" icon="alert" title="Vorschau nicht möglich">
              {error}
            </Callout>
          )}

          {/* Foto */}
          <div className="flex items-center gap-3">
            {photoUrl ? (
              <>
                <img
                  src={photoUrl}
                  alt=""
                  className="size-16 shrink-0 rounded-[var(--radius-field)] border border-border object-cover"
                />
                <span className="min-w-0 flex-1 text-[0.9rem] text-text-dim">Foto ausgewählt</span>
                <IconButton
                  icon="trash"
                  label="Foto entfernen"
                  className="text-alert"
                  onClick={() => setPhoto(null)}
                />
              </>
            ) : (
              <Button block icon="image" onClick={() => photoInput.current?.click()}>
                Foto aus der Galerie
              </Button>
            )}
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPhoto(file);
                e.target.value = '';
              }}
            />
          </div>

          <TextInput
            label="Anrede"
            value={greeting}
            onChange={(e) => {
              setGreeting(e.target.value);
              setGreetingTouched(true);
            }}
            hint={
              data.interest
                ? `Kommt von „${data.interest.name}" — du kannst sie ändern.`
                : 'Ohne verknüpften Interessenten schlägt die App „Hallo," vor.'
            }
            placeholder="Hallo Familie Schulz,"
          />

          <TextArea
            label="Deine Zeilen"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Heute hat sie zum ersten Mal die Augen ganz aufgemacht …"
            hint="Darf auch leer bleiben."
          />

          <div className="flex flex-col gap-1 px-1 text-[0.82rem] leading-relaxed text-text-faint">
            {!birthDate && <p>Ohne Geburtsdatum am Wurf fehlt die Altersangabe im Bild.</p>}
            {samples.length === 0 && <p>Ohne Wiegungen bleibt die Gewichtskurve weg.</p>}
            {samples.length === 1 && <p>Für eine Kurve braucht es zwei Wiegetage.</p>}
            <p>Das Bild landet nirgendwo automatisch — du entscheidest, wohin du es schickst.</p>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

/** Fertiger Knopf zum Einbinden im Kittenprofil. */
export function ShareImageButton({
  kittenId,
  block,
  label = 'Bild für WhatsApp',
}: {
  kittenId: ID;
  block?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button icon="share" block={block} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ShareImageSheet open={open} onClose={() => setOpen(false)} kittenId={kittenId} />
    </>
  );
}
