/**
 * Nachbearbeitung einer abfotografierten Seite: zuschneiden, drehen,
 * aufhellen. Schlichte Regler, keine Automatik, kein Nachladen.
 *
 * Die Bearbeitung arbeitet auf dem bereits verkleinerten Bild. Das
 * Originalfoto bleibt in der iPhone-Galerie (F99) — die App speichert
 * bewusst nur eine Fassung je Seite, sonst ist der Gerätespeicher voll.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Callout, Sheet, Spinner, useToast } from '../../ui';
import { RangeSlider } from './RangeSlider';
import {
  cornerPoints,
  CORNER_KEYS,
  FULL_CROP,
  isFullCrop,
  moveCorner,
  NEUTRAL_TONE,
  PAPER_TONE,
  rotateStep,
  type CornerKey,
  type CropRect,
  type Rotation,
  type ToneSettings,
} from './lib/imaging';
import { applyTone, drawTransformed, loadImage, processImage, type LoadedImage } from './imageProcessing';

/** Auflösung der Vorschau — reicht fürs Auge, bleibt flüssig beim Schieben. */
const PREVIEW_EDGE = 900;

export interface PageEditorProps {
  open: boolean;
  blob: Blob | null;
  onClose: () => void;
  onApply: (result: { blob: Blob; width: number; height: number }) => void;
}

export function PageEditor({ open, blob, onClose, onApply }: PageEditorProps) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<LoadedImage | null>(null);

  const [rotation, setRotation] = useState<Rotation>(0);
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [tone, setTone] = useState<ToneSettings>({ ...NEUTRAL_TONE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* --- Bild laden ---------------------------------------------------- */

  useEffect(() => {
    if (!open || !blob) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRotation(0);
    setCrop(FULL_CROP);
    setTone({ ...NEUTRAL_TONE });

    loadImage(blob)
      .then((image) => {
        if (cancelled) {
          image.release();
          return;
        }
        imageRef.current = image;
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Dieses Bild konnte nicht geöffnet werden.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      imageRef.current?.release();
      imageRef.current = null;
    };
  }, [open, blob]);

  /* --- Vorschau zeichnen --------------------------------------------- */

  const paint = useCallback(() => {
    const base = baseRef.current;
    const canvas = canvasRef.current;
    if (!base || !canvas) return;
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.drawImage(base, 0, 0);
    applyTone(canvas, tone);
  }, [tone]);

  // Grundbild (gedreht, ohne Farbanpassung) einmal je Drehung erzeugen,
  // danach reicht ein Kopieren plus Farbtabelle — das bleibt beim Schieben flüssig.
  useEffect(() => {
    const image = imageRef.current;
    if (loading || !image) return;
    const base = baseRef.current ?? document.createElement('canvas');
    baseRef.current = base;
    drawTransformed(base, image, rotation, FULL_CROP, PREVIEW_EDGE);
    paint();
  }, [loading, rotation, paint]);

  /* --- Ecken ziehen --------------------------------------------------- */

  const frameRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<CornerKey | null>(null);

  function pointToFraction(clientX: number, clientY: number) {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return { x: (clientX - box.left) / box.width, y: (clientY - box.top) / box.height };
  }

  function onHandleDown(corner: CornerKey, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = corner;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onHandleMove(e: React.PointerEvent) {
    const corner = draggingRef.current;
    if (!corner) return;
    const point = pointToFraction(e.clientX, e.clientY);
    if (!point) return;
    setCrop((current) => moveCorner(current, corner, point));
  }

  function onHandleUp(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId);
  }

  /* --- Übernehmen ---------------------------------------------------- */

  async function onSave() {
    if (!blob) return;
    setSaving(true);
    try {
      const result = await processImage(blob, { rotation, crop, tone });
      onApply(result);
    } catch {
      toast.error('Die Seite konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  const corners = cornerPoints(crop);
  const untouched = rotation === 0 && isFullCrop(crop) && tone.brightness === 0 && tone.contrast === 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Seite bearbeiten"
      tall
      footer={
        <div className="flex gap-2">
          <Button block onClick={onClose} disabled={saving}>
            Verwerfen
          </Button>
          <Button block variant="primary" onClick={onSave} loading={saving} disabled={loading || !!error}>
            Übernehmen
          </Button>
        </div>
      }
    >
      {error ? (
        <Callout tone="alert" icon="alert" title="Bild nicht lesbar">
          {error} Nimm die Seite bitte noch einmal auf.
        </Callout>
      ) : loading ? (
        <div className="flex min-h-60 items-center justify-center text-text-dim">
          <Spinner size={26} />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Vorschau mit Zuschnitt-Rahmen */}
          <div className="flex justify-center">
            <div ref={frameRef} className="relative w-fit max-w-full select-none">
              <canvas ref={canvasRef} className="block max-h-[46dvh] w-auto max-w-full rounded-lg" />

              {/* Abgedunkelte Bereiche außerhalb des Zuschnitts */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                <div
                  className="absolute rounded-[2px] border-2 border-white shadow-[0_0_0_9999px_oklch(0%_0_0/0.45)]"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.w * 100}%`,
                    height: `${crop.h * 100}%`,
                  }}
                />
              </div>

              {CORNER_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={CORNER_LABEL[key]}
                  onPointerDown={(e) => onHandleDown(key, e)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                  onPointerCancel={onHandleUp}
                  className="absolute flex size-11 items-center justify-center rounded-full"
                  style={{
                    left: `${corners[key].x * 100}%`,
                    top: `${corners[key].y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    touchAction: 'none',
                  }}
                >
                  <span className="size-5 rounded-full border-2 border-white bg-accent shadow-[0_0_0_1px_oklch(0%_0_0/0.35)]" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button block icon="refresh" onClick={() => setRotation((r) => rotateStep(r, -1))}>
              Links drehen
            </Button>
            <Button block icon="refresh" onClick={() => setRotation((r) => rotateStep(r, 1))}>
              Rechts drehen
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <RangeSlider
              label="Helligkeit"
              value={tone.brightness}
              onChange={(v) => setTone((t) => ({ ...t, brightness: v }))}
              onReset={
                tone.brightness !== 0 ? () => setTone((t) => ({ ...t, brightness: 0 })) : undefined
              }
            />
            <RangeSlider
              label="Kontrast"
              value={tone.contrast}
              onChange={(v) => setTone((t) => ({ ...t, contrast: v }))}
              onReset={
                tone.contrast !== 0 ? () => setTone((t) => ({ ...t, contrast: 0 })) : undefined
              }
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon="sun" onClick={() => setTone({ ...PAPER_TONE })}>
              Papier aufhellen
            </Button>
            <Button size="sm" icon="x" onClick={() => setCrop(FULL_CROP)} disabled={isFullCrop(crop)}>
              Zuschnitt aufheben
            </Button>
            <Button
              size="sm"
              icon="refresh"
              onClick={() => {
                setRotation(0);
                setCrop(FULL_CROP);
                setTone({ ...NEUTRAL_TONE });
              }}
              disabled={untouched}
            >
              Alles zurücksetzen
            </Button>
          </div>

          <p className="px-1 text-[0.82rem] leading-relaxed text-text-faint">
            Die vier Punkte ziehen den Zuschnitt. „Papier aufhellen" ist für
            abfotografierte Unterlagen gedacht — Impfpass, Stammbaum, Rechnung.
          </p>
        </div>
      )}
    </Sheet>
  );
}

const CORNER_LABEL: Record<CornerKey, string> = {
  tl: 'Zuschnitt oben links',
  tr: 'Zuschnitt oben rechts',
  bl: 'Zuschnitt unten links',
  br: 'Zuschnitt unten rechts',
};
