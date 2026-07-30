import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon';

interface Tab {
  to: string;
  label: string;
  icon: IconName;
  /** Weitere Pfade, bei denen dieser Tab aktiv erscheint. */
  matches?: string[];
}

const TABS: Tab[] = [
  { to: '/', label: 'Heute', icon: 'home' },
  { to: '/zucht', label: 'Zucht', icon: 'cat', matches: ['/wiegen'] },
  { to: '/warteliste', label: 'Warteliste', icon: 'users' },
  { to: '/kalender', label: 'Kalender', icon: 'calendar' },
  { to: '/mehr', label: 'Mehr', icon: 'menu' },
];

export function TabBar() {
  const { pathname } = useLocation();

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
        {TABS.map((tab) => {
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
                <span className="text-[0.66rem] font-medium tracking-tight">{tab.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
