import { NavLink, useLocation } from 'react-router';
import { BrandImage, type BrandImageName } from '../ui/BrandImage';
import { useSettings } from '../db/useSettings';
import type { Settings } from '../types';

interface Tab {
  to: string;
  label: string;
  image: BrandImageName;
  /** Weitere Pfade, bei denen dieser Tab aktiv erscheint. */
  matches?: string[];
  visible?: (settings: Settings) => boolean;
}

const TABS: Tab[] = [
  { to: '/', label: 'Heute', image: 'today' },
  {
    to: '/zucht',
    label: 'Zucht',
    image: 'breeding',
    matches: ['/wiegen'],
    visible: (settings) => settings.modules.cats || settings.modules.litters,
  },
  {
    to: '/warteliste',
    label: 'Warteliste',
    image: 'waitlist',
    visible: (settings) => settings.modules.waitlist,
  },
  {
    to: '/kalender',
    label: 'Kalender',
    image: 'calendar',
    visible: (settings) => settings.modules.appointments,
  },
  { to: '/mehr', label: 'Mehr', image: 'more' },
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
      className="tab-bar fixed z-40 border backdrop-blur-xl"
    >
      <ul className="flex h-full items-stretch gap-0.5 p-1">
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <li key={tab.to} className="min-w-0 flex-1">
              <NavLink
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={[
                  'tab-link relative flex h-full flex-col items-center justify-center gap-0.5 rounded-xl pt-0.5 pb-1.5 transition-colors',
                  active ? 'tab-active text-accent' : 'text-text-faint active:text-text-dim',
                ].join(' ')}
              >
                <BrandImage name={tab.image} className="tab-art size-11 shrink-0" />
                <span className="whitespace-nowrap text-[0.625rem] leading-4 font-semibold">{tab.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
