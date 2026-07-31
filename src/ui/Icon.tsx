/**
 * Symbolsatz. Alles handgezeichnete SVG-Pfade auf 24×24 — keine Icon-Bibliothek,
 * damit die App vollständig offline und ohne Nachladen funktioniert.
 */
/* eslint-disable react/only-export-components -- ICON_NAMES ist die öffentliche, aus demselben Symbolsatz abgeleitete Prüfliste. */

export type IconName = keyof typeof PATHS;

const PATHS = {
  /* Navigation */
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6.5H9V21H4a1 1 0 0 1-1-1z',
  cat: 'M12 5.5c-3.9 0-7 2.9-7 6.4S8.1 18.5 12 18.5s7-2.9 7-6.6-3.1-6.4-7-6.4zM5.4 8.3 4.2 3.8l4.2 2M18.6 8.3l1.2-4.5-4.2 2M9.6 11.7h.01M14.4 11.7h.01',
  paw: 'M7.2 15.4c0-2.4 2.1-3.9 4.8-3.9s4.8 1.5 4.8 3.9c0 2.2-1.7 3.6-4.8 3.6s-4.8-1.4-4.8-3.6z M5.6 9.6a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z M9.8 7.4a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z M14.2 7.4a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z M18.4 9.6a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z',
  scale: 'M4 21h16M12 3a2.5 2.5 0 0 1 2.5 2.5h-5A2.5 2.5 0 0 1 12 3zM5.5 21 7.5 7.5h9L18.5 21M9 12h6',
  list: 'M4 6h16M4 12h16M4 18h11',
  calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5zM8 3v4M16 3v4M4 10h16',
  menu: 'M4 7h16M4 12h16M4 17h16',

  /* Aktionen */
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M20 6.5 9.5 17 4 11.5',
  x: 'M18 6 6 18M6 6l12 12',
  edit: 'M4.5 19.5h4L20 8l-4-4L4.5 15.5zM14.5 5.5l4 4',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13.5h9l1-13.5M10 11v6M14 11v6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 16 16',
  share:
    'M12 3v13M8.5 6.5 12 3l3.5 3.5M5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6',
  download: 'M12 3v13M8.5 12.5 12 16l3.5-3.5M4 20h16',
  upload: 'M12 21V8M8.5 11.5 12 8l3.5 3.5M4 4h16',
  copy: 'M9 9h10.5v10.5H9zM15 9V4.5H4.5V15H9',
  refresh: 'M20 11a8 8 0 1 0-1.5 6M20 5v6h-6',

  /* Pfeile */
  'chevron-right': 'm9.5 18 6-6-6-6',
  'chevron-left': 'm14.5 18-6-6 6-6',
  'chevron-down': 'm6 9.5 6 6 6-6',
  'chevron-up': 'm18 14.5-6-6-6 6',
  'arrow-left': 'M19 12H5M11.5 18.5 5 12l6.5-6.5',
  'arrow-right': 'M5 12h14M12.5 5.5 19 12l-6.5 6.5',

  /* Zustände */
  alert: 'M12 3.5 2.5 20.5h19zM12 10v4.5M12 17.5h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.5h.01',
  'check-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.2l2.8 2.8L16 9.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5.3l3.2 1.9',
  bell: 'M18 9.5a6 6 0 1 0-12 0c0 5-2.2 6.5-2.2 6.5h16.4S18 14.5 18 9.5zM10.2 20a2 2 0 0 0 3.6 0',
  star: 'm12 3.5 2.6 5.6 6 .8-4.4 4.3 1.1 6.1L12 17.4l-5.3 2.9 1.1-6.1L3.4 9.9l6-.8z',

  /* Kontakt */
  phone:
    'M6 3.5h3.5l1.8 4.5-2.4 1.6a12.5 12.5 0 0 0 5.5 5.5l1.6-2.4 4.5 1.8V18a2.5 2.5 0 0 1-2.5 2.5A16.5 16.5 0 0 1 3.5 6 2.5 2.5 0 0 1 6 3.5z',
  whatsapp: 'M20.5 12a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.2-4.3A8.5 8.5 0 1 1 20.5 12z',
  mail: 'M3.5 6.5A1.5 1.5 0 0 1 5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5zM4 7l8 5.5L20 7',
  user: 'M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c0-3.6 3.4-5.5 7.5-5.5s7.5 1.9 7.5 5.5',
  users:
    'M9.5 12a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM3 20.5c0-3.3 2.9-5 6.5-5s6.5 1.7 6.5 5M16.5 5.2a3.4 3.4 0 0 1 0 6.6M18 15.6c2 .6 3.5 2.1 3.5 4.4',

  /* Dokumente */
  document: 'M6 3h7l5 5v13H6zM13 3v5h5M9 13h6M9 17h4',
  camera:
    'M4 8.5h3l1.8-3h6.4l1.8 3h3v11H4zM12 16.8a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z',
  image: 'M4 5.5h16v13H4zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4 16l4.5-4 4 3.5L16 12l4 4',
  folder: 'M3.5 6.5A1 1 0 0 1 4.5 5.5h4l2 2.5h8a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1z',
  contract: 'M6 3h7l5 5v13H6zM13 3v5h5M9 12h6M9 15.5h6M9 19h3',

  /* Medizin */
  syringe: 'M19 2.5 21.5 5M17 4.5 19.5 7M14.5 7 17.5 10l-7.5 7.5H6.5V14zM9.5 12l3 3',
  pill: 'M10.6 3.9a4.8 4.8 0 0 1 6.8 6.8l-6.7 6.7a4.8 4.8 0 0 1-6.8-6.8zM7.2 7.3l6.8 6.8',
  scissors: 'M6.5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6.5 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM20 4 8.7 15.3M20 20 8.7 8.7',
  chip: 'M6.5 6.5h11v11h-11zM9.5 9.5h5v5h-5M9 6.5V3.5M15 6.5V3.5M9 20.5v-3M15 20.5v-3M6.5 9H3.5M6.5 15H3.5M20.5 9h-3M20.5 15h-3',
  heart: 'M12 20s-7.5-4.4-7.5-9.4A4.1 4.1 0 0 1 12 7.8a4.1 4.1 0 0 1 7.5 2.8c0 5-7.5 9.4-7.5 9.4z',

  /* Sonstiges */
  euro: 'M17.5 6.2a6.8 6.8 0 1 0 0 11.6M4.5 10h8.5M4.5 14h8.5',
  chart: 'M3.5 20.5h17M6 17V11M11 17V5.5M16 17v-8',
  settings:
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5',
  drag: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  moon: 'M20 13.5A8.5 8.5 0 0 1 10.5 4a8.5 8.5 0 1 0 9.5 9.5z',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3',
  lock: 'M6.5 10.5h11v10h-11zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3',
  eye: 'M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z',
  weight: 'M5 8.5h14l1.5 12h-17zM12 3a2.8 2.8 0 0 1 2.8 2.8c0 .9-.3 1.7-.8 2.2H10c-.5-.5-.8-1.3-.8-2.2A2.8 2.8 0 0 1 12 3z',
} as const;

/** Icons, die mit dickerem, punktförmigem Strich besser aussehen. */
const DOT_ICONS = new Set<string>(['drag']);

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /**
   * Sichtbarer Name für Screenreader. Ohne Angabe gilt das Symbol als
   * rein dekorativ und wird ausgeblendet.
   */
  title?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, className, title, strokeWidth }: IconProps) {
  const isDot = DOT_ICONS.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? (isDot ? 2.6 : 1.7)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ flexShrink: 0 }}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[];
