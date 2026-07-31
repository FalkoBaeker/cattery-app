import { useNavigate } from 'react-router-dom';
import { Icon, List, ListRow, Screen, Spinner, Stack, type IconName } from '../../ui';
import { useSettings } from '../settings/useSettings';
import type { ModuleKey } from '../../types';

interface Entry {
  to: string;
  label: string;
  description: string;
  icon: IconName;
  /** Fehlt der Schlüssel, ist der Eintrag immer sichtbar. */
  module?: ModuleKey;
}

const ENTRIES: Entry[] = [
  {
    to: '/mehr/dokumente',
    label: 'Dokumente',
    description: 'Stammbäume, Impfpässe, Testergebnisse',
    icon: 'folder',
    module: 'documents',
  },
  {
    to: '/mehr/vertraege',
    label: 'Verträge',
    description: 'Kaufverträge und Zuchtnutzung',
    icon: 'contract',
    module: 'contracts',
  },
  {
    to: '/mehr/kosten',
    label: 'Kosten',
    description: 'Ausgaben und Erlöse je Wurf',
    icon: 'euro',
    module: 'costs',
  },
  {
    to: '/mehr/einstellungen',
    label: 'Einstellungen',
    description: 'Stammdaten, Fahrplan, Sicherung',
    icon: 'settings',
  },
];

export function MoreScreen() {
  const navigate = useNavigate();
  const settings = useSettings();

  if (!settings) {
    return (
      <Screen title="Mehr">
        <div className="flex justify-center py-12 text-text-faint">
          <Spinner size={24} />
        </div>
      </Screen>
    );
  }

  const visible = ENTRIES.filter((e) => !e.module || settings.modules[e.module]);

  return (
    <Screen title="Mehr" subtitle={settings.seller.catteryName?.trim() || undefined}>
      <Stack gap="lg">
        <List>
          {visible.map((entry) => (
            <ListRow
              key={entry.to}
              leading={
                <span className="flex size-9 items-center justify-center rounded-[var(--radius-field)] bg-surface-2 text-accent">
                  <Icon name={entry.icon} size={20} />
                </span>
              }
              title={entry.label}
              subtitle={entry.description}
              onClick={() => navigate(entry.to)}
            />
          ))}
        </List>

        <p className="px-2 text-center text-[0.78rem] leading-relaxed text-text-faint">
          Alle Daten liegen ausschließlich auf diesem iPhone.
          <br />
          Ohne Sicherung sind sie bei Verlust des Geräts weg.
        </p>
      </Stack>
    </Screen>
  );
}
