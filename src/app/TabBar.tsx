import { NavLink, useLocation } from 'react-router';
import { Icon, type IconName } from '../ui/Icon';
import { useSettings } from '../db/useSettings';
import type { Settings } from '../types';

interface Tab {
  to: string;
  label: string;
  icon: IconName;
  /** Weitere Pfade, bei denen dieser Tab aktiv erscheint. */
  matches?: string[];
  visible?: (settings: Settings) => boolean;
}

const TABS: Tab[] = [
  { to: '/', label: 'Heute', icon: 'home' },
  {
    to: '/zucht',
    label: 'Zucht',
    icon: 'cat',
    matches: ['/wiegen'],
    visible: (settings) => settings.modules.cats || settings.modules.litters,
  },
  {
    to: '/warteliste',
    label: 'Warteliste',
    icon: 'users',
    visible: (settings) => settings.modules.waitlist,
  },
  {
    to: '/kalender',
    label: 'Kalender',
    icon: 'calendar',
    visible: (settings) => settings.modules.appointments,
  },
  { to: '/mehr', label: 'Mehr', icon: 'menu' },
];

export function TabBar() {
  const { pathname } = useLocation();
  const settings = useSettings();
  const tabs = TABS.filter((tab) => !tab.visible || (settings && tab.visible(settings)));

  function isActive(tab: Tab) {
    if (tab.to === '/') return pathname === '/';
    if (pathname.startsWith(tab.to)) return true;
    return tab.matches?.some((m) => pathname.startsWith(m)) ?? false;
  }

  return (
    <nav
      aria-label="Hauptbereiche"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur-xl safe-bottom"
    >
      <ul className="flex">
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 transition-colors',
                  active ? 'text-accent' : 'text-text-faint active:text-text-dim',
                ].join(' ')}
              >
                <Icon name={tab.icon} size={23} strokeWidth={active ? 2 : 1.7} />
                <span className="text-xs font-medium tracking-tight">{tab.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
