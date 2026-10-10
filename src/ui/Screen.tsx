import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { IconButton } from './Button';

export interface ScreenProps {
  title: string;
  /** Kleine Zeile unter dem Titel. */
  subtitle?: string;
  /** Zurück-Pfeil links oben. */
  back?: boolean | (() => void);
  /** Knöpfe rechts oben. */
  actions?: ReactNode;
  children: ReactNode;
  /** Fester Bereich unter der Kopfzeile, z. B. Filterleiste. */
  toolbar?: ReactNode;
  /** Ohne seitlichen Innenabstand (für randlose Listen). */
  flush?: boolean;
}

/**
 * Rahmen für jede Seite: sichere Bereiche oben, scrollbarer Inhalt,
 * unten Platz für die Tab-Leiste.
 */
export function Screen({
  title,
  subtitle,
  back,
  actions,
  children,
  toolbar,
  flush,
}: ScreenProps) {
  const navigate = useNavigate();
  const onBack = typeof back === 'function' ? back : () => navigate(-1);

  return (
    <div className="app-screen flex min-h-full flex-col">
      <header className="screen-header sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-xl safe-top">
        <div className="screen-header-row flex min-h-15 items-center gap-1 px-2 py-2">
          {back ? (
            <IconButton icon="arrow-left" label="Zurück" size="sm" onClick={onBack} />
          ) : (
            <span className="w-1" />
          )}
          <div className="min-w-0 flex-1 px-1">
            <h1 className="screen-title truncate text-[1.15rem] leading-tight font-semibold text-text">
              {title}
            </h1>
            {subtitle && <p className="truncate text-[0.8rem] text-text-dim">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        </div>
        {toolbar && <div className="px-3 pb-2">{toolbar}</div>}
      </header>

      <main
        className={[
          'flex-1',
          flush ? '' : 'px-4',
          'pt-4',
          // Platz für Tab-Leiste plus sicherer Bereich.
          'pb-[calc(env(safe-area-inset-bottom)+7rem)]',
        ].join(' ')}
      >
        {children}
      </main>
    </div>
  );
}

/** Vertikaler Abstand zwischen Abschnitten einer Seite. */
export function Stack({
  children,
  gap = 'md',
  className = '',
}: {
  children: ReactNode;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const g = gap === 'sm' ? 'gap-2' : gap === 'lg' ? 'gap-6' : 'gap-4';
  return <div className={['flex flex-col', g, className].join(' ')}>{children}</div>;
}
