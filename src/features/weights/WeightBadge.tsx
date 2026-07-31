/**
 * Warnstufe als Kennzeichen — mit Begründung, aber ohne Ratschlag.
 *
 * Die App zeigt ausdrücklich nur Zahlen und Farben (F16). Sie sagt nie,
 * was zu tun ist, und rät nie zum Tierarzt.
 */

import { Badge } from '../../ui';
import type { IconName } from '../../ui';
import { WEIGHT_LEVEL_LABEL, WEIGHT_LEVEL_TONE, type WeightLevel } from '../../domain/weight';

const LEVEL_ICON: Record<WeightLevel, IconName | undefined> = {
  ok: 'check-circle',
  watch: 'info',
  concern: 'alert',
  critical: 'alert',
  unknown: undefined,
};

export interface WeightBadgeProps {
  level: WeightLevel;
  /** Klartext-Begründungen aus der Auswertung. */
  reasons?: string[];
  /** Begründungen unter dem Kennzeichen ausschreiben. */
  showReasons?: boolean;
  className?: string;
}

export function WeightBadge({ level, reasons = [], showReasons, className }: WeightBadgeProps) {
  const badge = (
    <Badge tone={WEIGHT_LEVEL_TONE[level]} icon={LEVEL_ICON[level]} className={className}>
      {WEIGHT_LEVEL_LABEL[level]}
    </Badge>
  );

  if (!showReasons || reasons.length === 0) return badge;

  return (
    <div className="flex flex-col gap-1.5">
      {badge}
      <ul className="flex flex-col gap-0.5 pl-1">
        {reasons.map((r) => (
          <li key={r} className="text-[0.83rem] leading-snug text-text-dim">
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}
