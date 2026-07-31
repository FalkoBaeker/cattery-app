import { formatGrams } from '../../lib/format';

export interface TrendPoint {
  at: string;
  grams: number;
}

/**
 * Schlichter Verlauf der Trächtigkeitsgewichte.
 *
 * Die x-Achse folgt der echten Zeit, nicht der Reihenfolge — sonst sähen
 * Lücken beim Wiegen wie gleichmäßige Abstände aus.
 */
export function WeightTrend({ points, height = 56 }: { points: TrendPoint[]; height?: number }) {
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.grams) && p.grams > 0 && !Number.isNaN(new Date(p.at).getTime()))
    .sort((a, b) => a.at.localeCompare(b.at));

  if (sorted.length < 2) return null;

  const times = sorted.map((p) => new Date(p.at).getTime());
  const grams = sorted.map((p) => p.grams);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const gMin = Math.min(...grams);
  const gMax = Math.max(...grams);
  const tSpan = tMax - tMin;
  const gSpan = gMax - gMin;

  const coords = sorted.map((p, i) => {
    const x = tSpan > 0 ? ((times[i] - tMin) / tSpan) * 100 : (i / (sorted.length - 1)) * 100;
    // Ohne Unterschied im Gewicht: waagerecht in der Mitte.
    const y = gSpan > 0 ? 36 - ((p.grams - gMin) / gSpan) * 32 : 20;
    return { x, y };
  });

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(' ');
  const area = `${line} L100 40 L0 40 Z`;

  return (
    <figure className="m-0 flex flex-col gap-1">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="w-full text-accent"
        style={{ height }}
        role="img"
        aria-label={`Gewichtsverlauf von ${formatGrams(grams[0])} auf ${formatGrams(grams[grams.length - 1])}`}
      >
        <path d={area} fill="currentColor" opacity={0.12} />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="flex justify-between px-1 text-[0.75rem] text-text-faint tabular">
        <span>{formatGrams(gMin)}</span>
        <span>{formatGrams(gMax)}</span>
      </figcaption>
    </figure>
  );
}
