import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Badge, ListRow } from '../../ui';
import { db } from '../../db/db';
import { CAT_STATUS_LABEL, SEX_LABEL, type Cat } from '../../types';
import { catAgeLabel } from './age';
import { summarizeHealthTests } from './tests';
import { CatAvatar } from './CatAvatar';

export interface CatRowProps {
  cat: Cat;
  /** Vorgabe: zum Profil der Katze springen. */
  onClick?: () => void;
  /** Ersetzt die Standardzeile aus Zuchtname, Geschlecht und Alter. */
  subtitle?: ReactNode;
  /** Zusätzlich rechts, z. B. die Anzahl der Würfe. */
  trailing?: ReactNode;
  /** Warnung anzeigen, wenn ein Gesundheitstest abgelaufen oder bald fällig ist. */
  showHealthBadge?: boolean;
}

/**
 * Eine Katze in einer Liste. Wird von der Zuchtübersicht benutzt und deshalb
 * aus dem Modul heraus veröffentlicht.
 */
export function CatRow({
  cat,
  onClick,
  subtitle,
  trailing,
  showHealthBadge = true,
}: CatRowProps) {
  const navigate = useNavigate();

  const health = useLiveQuery(
    async () => {
      if (!showHealthBadge) return null;
      const tests = await db.healthTests.where('catId').equals(cat.id).toArray();
      return summarizeHealthTests(tests);
    },
    [cat.id, showHealthBadge],
    null,
  );

  const parts = [
    cat.catteryName?.trim() || SEX_LABEL[cat.sex],
    cat.birthDate ? catAgeLabel(cat.birthDate) : undefined,
  ].filter(Boolean);

  const badges: ReactNode[] = [];
  if (health && health.expiredCount > 0) {
    badges.push(
      <Badge key="health" tone="alert" icon="alert">
        {health.expiredCount === 1 ? 'Test fällig' : `${health.expiredCount} Tests fällig`}
      </Badge>,
    );
  } else if (health && health.dueSoonCount > 0) {
    badges.push(
      <Badge key="health" tone="warn" icon="clock">
        bald fällig
      </Badge>,
    );
  }
  if (cat.status !== 'active') {
    badges.push(
      <Badge key="status" tone="neutral">
        {CAT_STATUS_LABEL[cat.status]}
      </Badge>,
    );
  }
  if (!cat.isOwn) {
    badges.push(
      <Badge key="own" tone="neutral">
        fremd
      </Badge>,
    );
  }

  return (
    <ListRow
      leading={<CatAvatar name={cat.callName} photoAttachmentId={cat.photoAttachmentId} />}
      title={cat.callName}
      subtitle={subtitle ?? parts.join(' · ')}
      trailing={
        trailing ?? (badges.length > 0 ? <span className="flex gap-1">{badges}</span> : undefined)
      }
      onClick={onClick ?? (() => navigate(`/zucht/katze/${cat.id}`))}
    />
  );
}
