import { useMemo, useState } from 'react';
import { EmptyState, Icon, List, ListRow, Section, Segmented, Select, Stack } from '../../ui';
import type { Cat, ID, Kitten, Litter } from '../../types';
import { formatDate } from '../../lib/date';
import { LitterStatusBadge } from './parts';

const UNKNOWN_MOTHER = 'unknown-mother';
const UNKNOWN_YEAR = 'unknown-year';

function archiveDate(litter: Litter) {
  return litter.birthDate ?? litter.matingDate ?? litter.dueDate;
}

function archiveYear(litter: Litter) {
  return archiveDate(litter)?.slice(0, 4) ?? UNKNOWN_YEAR;
}

export function LitterArchive({
  litters,
  cats,
  kittens,
  onOpen,
}: {
  litters: Litter[];
  cats: Cat[];
  kittens: Kitten[];
  onOpen: (id: ID) => void;
}) {
  const [catFilter, setCatFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [groupBy, setGroupBy] = useState<'cat' | 'year'>('cat');
  const archived = useMemo(
    () => litters
      .filter((litter) => litter.status === 'completed' || litter.status === 'cancelled')
      .sort((a, b) => (archiveDate(b) ?? '').localeCompare(archiveDate(a) ?? '') || a.id.localeCompare(b.id)),
    [litters],
  );
  const catMap = useMemo(() => new Map(cats.map((cat) => [cat.id, cat])), [cats]);
  const kittenCounts = useMemo(() => {
    const counts = new Map<ID, number>();
    for (const kitten of kittens) counts.set(kitten.litterId, (counts.get(kitten.litterId) ?? 0) + 1);
    return counts;
  }, [kittens]);
  const parentOptions = cats
    .filter((cat) => archived.some((litter) => litter.motherId === cat.id || litter.fatherId === cat.id))
    .sort((a, b) => a.callName.localeCompare(b.callName, 'de'))
    .map((cat) => ({ value: cat.id, label: cat.callName }));
  if (archived.some((litter) => !catMap.has(litter.motherId))) {
    parentOptions.push({ value: UNKNOWN_MOTHER, label: 'Unbekannte Mutter' });
  }
  const years = [...new Set(archived.map(archiveYear))].sort((a, b) => b.localeCompare(a));
  const filtered = archived.filter((litter) =>
    (!catFilter || (catFilter === UNKNOWN_MOTHER
      ? !catMap.has(litter.motherId)
      : litter.motherId === catFilter || litter.fatherId === catFilter)) &&
    (!yearFilter || archiveYear(litter) === yearFilter),
  );
  const groups = new Map<string, { title: string; litters: Litter[] }>();
  for (const litter of filtered) {
    const mother = catMap.get(litter.motherId);
    const key = groupBy === 'year' ? archiveYear(litter) : mother?.id ?? UNKNOWN_MOTHER;
    const title = groupBy === 'year'
      ? key === UNKNOWN_YEAR ? 'Ohne Jahresangabe' : key
      : mother?.callName ?? 'Unbekannte Mutter';
    const group = groups.get(key) ?? { title, litters: [] };
    group.litters.push(litter);
    groups.set(key, group);
  }
  const sortedGroups = [...groups.entries()].sort(([aKey, a], [bKey, b]) => {
    const unknown = groupBy === 'year' ? UNKNOWN_YEAR : UNKNOWN_MOTHER;
    if (aKey === unknown) return 1;
    if (bKey === unknown) return -1;
    return groupBy === 'year' ? bKey.localeCompare(aKey) : a.title.localeCompare(b.title, 'de');
  });

  return (
    <Stack gap="lg">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Katze (Mutter oder Vater)"
          value={catFilter}
          onChange={(event) => setCatFilter(event.target.value)}
          options={[{ value: '', label: 'Alle Katzen' }, ...parentOptions]}
        />
        <Select
          label="Jahr"
          value={yearFilter}
          onChange={(event) => setYearFilter(event.target.value)}
          options={[
            { value: '', label: 'Alle Jahre' },
            ...years.filter((year) => year !== UNKNOWN_YEAR).map((year) => ({ value: year, label: year })),
            ...(years.includes(UNKNOWN_YEAR) ? [{ value: UNKNOWN_YEAR, label: 'Ohne Jahresangabe' }] : []),
          ]}
        />
      </div>
      <Segmented
        label="Gruppierung"
        value={groupBy}
        onChange={setGroupBy}
        options={[{ value: 'cat', label: 'Katze' }, { value: 'year', label: 'Jahr' }]}
      />
      {sortedGroups.length === 0 ? (
        <EmptyState
          icon="paw"
          title={archived.length === 0 ? 'Noch keine archivierten Würfe' : 'Keine passenden Würfe'}
          description={archived.length === 0
            ? 'Abgeschlossene und abgebrochene Würfe erscheinen hier.'
            : undefined}
        />
      ) : sortedGroups.map(([key, group]) => (
        <Section key={key} title={group.title}>
          <List>
            {group.litters.map((litter) => {
              const mother = catMap.get(litter.motherId)?.callName ?? 'Unbekannte Mutter';
              const father = (litter.fatherId ? catMap.get(litter.fatherId)?.callName : undefined) ?? litter.fatherExternalName;
              const count = kittenCounts.get(litter.id) ?? 0;
              const dates = [
                litter.birthDate ? `Geboren ${formatDate(litter.birthDate)}` : undefined,
                litter.matingDate ? `Gedeckt ${formatDate(litter.matingDate)}` : undefined,
                !litter.birthDate && litter.dueDate ? `Termin ${formatDate(litter.dueDate)}` : undefined,
              ].filter(Boolean);
              return (
                <ListRow
                  key={litter.id}
                  leading={<Icon name="paw" size={20} className="text-text-faint" />}
                  title={father ? `${mother} × ${father}` : mother}
                  subtitle={
                    <span className="flex flex-col whitespace-normal">
                      <span>{dates.length > 0 ? dates.join(' · ') : 'Ohne Datumsangabe'}</span>
                      <span>{count} Kitten</span>
                      <span><LitterStatusBadge status={litter.status} /></span>
                    </span>
                  }
                  onClick={() => onOpen(litter.id)}
                />
              );
            })}
          </List>
        </Section>
      ))}
    </Stack>
  );
}
