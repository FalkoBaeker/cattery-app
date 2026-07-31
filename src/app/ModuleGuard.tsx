import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

import { useSettings } from '../db/useSettings';
import type { ModuleKey } from '../types';
import { Spinner } from '../ui';

/**
 * Verhindert, dass ausgeschaltete Bereiche über alte Lesezeichen oder die
 * Browser-Historie weiterhin geöffnet werden. Die Daten bleiben unberührt.
 */
export function ModuleGuard({
  modules,
  requireAll = false,
  redirectTo = '/',
  children,
}: {
  modules: ModuleKey[];
  requireAll?: boolean;
  redirectTo?: string;
  children: ReactNode;
}) {
  const settings = useSettings();

  if (!settings) {
    return (
      <div
        className="flex min-h-[60dvh] items-center justify-center text-text-faint"
        aria-label="Einstellungen werden geladen"
      >
        <Spinner size={26} />
      </div>
    );
  }

  const enabled = requireAll
    ? modules.every((module) => settings.modules[module])
    : modules.some((module) => settings.modules[module]);

  return enabled ? children : <Navigate to={redirectTo} replace />;
}
