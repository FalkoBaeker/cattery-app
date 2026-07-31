/**
 * Zeichnet das fertige Bild für WhatsApp.
 *
 * Ersetzt den ursprünglich angedachten Kunden-Link (F101/F103): sie schickt
 * fast täglich persönliche Updates und will persönlich bleiben. Deshalb
 * entsteht hier kein Diagramm aus einem Tabellenprogramm, sondern eine warme
 * Karte — Foto, Anrede, Name, Alter, Gewicht, kleine Kurve, ein paar Zeilen.
 *
 * Nur System-Schriften, keine externen Bilder, keine Bibliothek. Die reine
 * Layout-Rechnung steht in `shareCardLayout.ts` und ist dort geprüft.
 */

import { loadImage } from '../imageProcessing';
import { wrapText } from '../lib/textLayout';
import { curveGeometry, type CurveSample, type ShareCardModel } from './shareCardLayout';

/* --- Farbwelt der Karte ---------------------------------------------- */
/* Bewusst feste Werte: das Bild verlässt die App und darf nicht vom       */
/* hellen oder dunklen Modus des Geräts abhängen.                          */

const PAPER = '#f6efe6';
const CARD = '#fffbf5';
const INK = '#3b3029';
const INK_SOFT = '#8d7768';
const ACCENT = '#a9674b';
const ACCENT_SOFT = '#ecdccf';
const LINE = '#e6d8ca';

const SERIF = 'Georgia, "Times New Roman", "Iowan Old Style", serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

export interface RenderShareCardOptions {
  model: ShareCardModel;
  /** Optionales Foto aus der iPhone-Galerie. */
  photo?: Blob | null;
  width?: number;
  /** Datumszeile im Fuß, z. B. „31.07.2026". */
  dateText?: string;
  quality?: number;
}

export interface RenderedCard {
  blob: Blob;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ */
/*  Hilfen                                                             */
/* ------------------------------------------------------------------ */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function measurer(font: string): (text: string) => number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return (t) => t.length * 20;
  ctx.font = font;
  return (text) => ctx.measureText(text).width;
}

/** Zeichnet ein Kärtchen mit Text — für „Tag 24" und „412 g". */
function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  scale: number,
): number {
  ctx.font = `600 ${Math.round(34 * scale)}px ${SANS}`;
  const padding = 26 * scale;
  const width = ctx.measureText(text).width + padding * 2;
  const height = 66 * scale;
  ctx.fillStyle = ACCENT_SOFT;
  roundRect(ctx, x, y, width, height, height / 2);
  ctx.fill();
  ctx.fillStyle = ACCENT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + padding, y + height / 2 + 1 * scale);
  ctx.textBaseline = 'alphabetic';
  return width;
}

/* ------------------------------------------------------------------ */
/*  Hauptfunktion                                                      */
/* ------------------------------------------------------------------ */

export async function renderShareCard(options: RenderShareCardOptions): Promise<RenderedCard> {
  const width = options.width ?? 1080;
  const scale = width / 1080;
  const model = options.model;

  const pad = Math.round(72 * scale);
  const cardX = pad;
  const cardW = width - pad * 2;
  const innerX = cardX + Math.round(52 * scale);
  const innerW = cardW - Math.round(104 * scale);

  /* --- 1. Messen ---------------------------------------------------- */

  const messageFont = `${Math.round(38 * scale)}px ${SANS}`;
  const nameFont = `700 ${Math.round(80 * scale)}px ${SERIF}`;
  const greetingFont = `italic ${Math.round(42 * scale)}px ${SERIF}`;

  const messageLines = wrapText(model.message, innerW, measurer(messageFont), { maxLines: 10 });
  const nameLines = wrapText(model.kittenName, innerW, measurer(nameFont), { maxLines: 2 });
  const greetingLines = wrapText(model.greeting, innerW, measurer(greetingFont), { maxLines: 2 });

  const hasChips = Boolean(model.dayCount || model.weightText);
  // Nur brauchbare Messwerte zählen — sonst bleibt ein leerer Kasten stehen.
  const validSamples = model.samples.filter(
    (s) => Boolean(s.date) && Number.isFinite(s.grams) && s.grams > 0,
  );
  const curve = validSamples.length >= 2;

  const photoH = options.photo ? Math.round(width * 0.75) : 0;
  const messageLineHeight = Math.round(56 * scale);
  const curveH = curve ? Math.round(230 * scale) : 0;

  let cardH = Math.round(52 * scale); // oberer Innenabstand
  cardH += greetingLines.length * Math.round(58 * scale);
  cardH += Math.round(18 * scale);
  cardH += nameLines.length * Math.round(92 * scale);
  if (model.weekHint) cardH += Math.round(46 * scale);
  if (hasChips) cardH += Math.round(90 * scale);
  if (curve) cardH += curveH + Math.round(28 * scale);
  if (messageLines.length > 0) cardH += Math.round(26 * scale) + messageLines.length * messageLineHeight;
  cardH += Math.round(52 * scale); // unterer Innenabstand

  const footerH = Math.round(96 * scale);
  // Bei Foto rutscht die Karte etwas darüber — das wirkt wie aufgelegt.
  const cardY = photoH > 0 ? photoH - Math.round(56 * scale) : pad;
  const height = cardY + cardH + footerH;

  /* --- 2. Zeichnen -------------------------------------------------- */

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Das Bild konnte auf diesem Gerät nicht erzeugt werden.');

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  // Foto, formatfüllend beschnitten.
  if (options.photo && photoH > 0) {
    try {
      const image = await loadImage(options.photo);
      try {
        const ratio = Math.max(width / image.width, photoH / image.height);
        const drawW = image.width * ratio;
        const drawH = image.height * ratio;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, photoH);
        ctx.clip();
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image.source, (width - drawW) / 2, (photoH - drawH) / 2, drawW, drawH);
        ctx.restore();
      } finally {
        image.release();
      }
    } catch {
      // Ohne Foto sieht die Karte immer noch gut aus.
      ctx.fillStyle = ACCENT_SOFT;
      ctx.fillRect(0, 0, width, photoH);
    }
  }

  // Karte
  const cardHeight = cardH;
  ctx.save();
  ctx.shadowColor = 'rgba(59, 48, 41, 0.14)';
  ctx.shadowBlur = 34 * scale;
  ctx.shadowOffsetY = 10 * scale;
  ctx.fillStyle = CARD;
  roundRect(ctx, cardX, cardY, cardW, cardHeight, Math.round(40 * scale));
  ctx.fill();
  ctx.restore();

  let y = cardY + Math.round(52 * scale);

  // Anrede
  ctx.font = greetingFont;
  ctx.fillStyle = INK_SOFT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const line of greetingLines) {
    y += Math.round(46 * scale);
    ctx.fillText(line, innerX, y);
    y += Math.round(12 * scale);
  }

  y += Math.round(18 * scale);

  // Name
  ctx.font = nameFont;
  ctx.fillStyle = INK;
  for (const line of nameLines) {
    y += Math.round(76 * scale);
    ctx.fillText(line, innerX, y);
    y += Math.round(16 * scale);
  }

  if (model.weekHint) {
    y += Math.round(34 * scale);
    ctx.font = `${Math.round(32 * scale)}px ${SANS}`;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(model.weekHint, innerX, y);
    y += Math.round(12 * scale);
  }

  // Kärtchen mit Tag und Gewicht
  if (hasChips) {
    y += Math.round(24 * scale);
    let chipX = innerX;
    if (model.dayCount) chipX += drawChip(ctx, chipX, y, model.dayCount, scale) + Math.round(16 * scale);
    if (model.weightText) drawChip(ctx, chipX, y, model.weightText, scale);
    y += Math.round(66 * scale);
  }

  // Gewichtskurve
  if (curve) {
    y += Math.round(28 * scale);
    drawCurve(ctx, validSamples, { x: innerX, y, width: innerW, height: curveH }, scale);
    y += curveH;
  }

  // Freier Text
  if (messageLines.length > 0) {
    y += Math.round(26 * scale);
    ctx.font = messageFont;
    ctx.fillStyle = INK;
    ctx.textBaseline = 'alphabetic';
    for (const line of messageLines) {
      y += Math.round(42 * scale);
      ctx.fillText(line, innerX, y);
      y += messageLineHeight - Math.round(42 * scale);
    }
  }

  // Fuß
  const footerY = cardY + cardHeight + Math.round(46 * scale);
  ctx.font = `${Math.round(28 * scale)}px ${SANS}`;
  ctx.fillStyle = INK_SOFT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const footerText = [model.footer, options.dateText].filter(Boolean).join('  ·  ');
  if (footerText) ctx.fillText(footerText, width / 2, footerY);

  /* --- 3. Ausgeben -------------------------------------------------- */

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Das Bild konnte nicht erzeugt werden.'))),
      'image/jpeg',
      options.quality ?? 0.92,
    );
  });

  canvas.width = 0;
  canvas.height = 0;
  return { blob, width, height };
}

/* ------------------------------------------------------------------ */
/*  Kurve                                                              */
/* ------------------------------------------------------------------ */

function drawCurve(
  ctx: CanvasRenderingContext2D,
  samples: CurveSample[],
  box: { x: number; y: number; width: number; height: number },
  scale: number,
): void {
  const geo = curveGeometry(samples, box, Math.round(18 * scale));
  if (!geo || geo.path.length < 2) return;

  // Untergrund
  ctx.fillStyle = '#fdf7f0';
  roundRect(ctx, box.x, box.y, box.width, box.height, Math.round(24 * scale));
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.stroke();

  // Fläche unter der Kurve
  ctx.beginPath();
  ctx.moveTo(geo.path[0].x, geo.baseY);
  for (const point of geo.path) ctx.lineTo(point.x, point.y);
  ctx.lineTo(geo.path[geo.path.length - 1].x, geo.baseY);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, box.y, 0, box.y + box.height);
  gradient.addColorStop(0, 'rgba(169, 103, 75, 0.26)');
  gradient.addColorStop(1, 'rgba(169, 103, 75, 0.03)');
  ctx.fillStyle = gradient;
  ctx.fill();

  // Linie
  ctx.beginPath();
  ctx.moveTo(geo.path[0].x, geo.path[0].y);
  for (const point of geo.path.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = Math.max(2, 5 * scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Jede Wiegung als kleiner Punkt — das wirkt handgemacht, nicht gerechnet.
  ctx.fillStyle = ACCENT;
  for (const point of geo.path.slice(0, -1)) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(2, 5 * scale), 0, Math.PI * 2);
    ctx.fill();
  }

  // Letzter Punkt hervorgehoben
  const last = geo.path[geo.path.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, Math.max(4, 10 * scale), 0, Math.PI * 2);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.strokeStyle = '#fffbf5';
  ctx.lineWidth = Math.max(2, 5 * scale);
  ctx.stroke();

  // Beschriftung: erster und letzter Tageswert, nicht Minimum und Maximum.
  // Bei einer zwischenzeitlichen Abnahme wäre „min → max" irreführend.
  const ordered = samples
    .filter((sample) => sample.date && Number.isFinite(sample.grams) && sample.grams > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const firstGrams = ordered[0]?.grams ?? geo.minGrams;
  const lastGrams = ordered.at(-1)?.grams ?? geo.maxGrams;
  ctx.font = `${Math.round(24 * scale)}px ${SANS}`;
  ctx.fillStyle = INK_SOFT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `${Math.round(firstGrams)} g → ${Math.round(lastGrams)} g`,
    box.x + Math.round(22 * scale),
    box.y + Math.round(16 * scale),
  );
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
}
