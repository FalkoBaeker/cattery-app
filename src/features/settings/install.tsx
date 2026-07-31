/**
 * Installations-Assistent.
 *
 * Die App muss auf dem Home-Bildschirm liegen. Sonst gibt es keine
 * Erinnerungen und Safari darf die Datenbank bei Speicherdruck verwerfen.
 * Deshalb erklärt die App den Weg einmal freundlich — und danach nie wieder,
 * wenn sie einmal weggeklickt wurde.
 */
/* eslint-disable react/only-export-components -- Erkennung, Hook und Anleitung bilden bewusst eine gemeinsame Installations-API. */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Button, Callout, Sheet } from '../../ui';

/* ------------------------------------------------------------------ */
/*  Erkennung                                                          */
/* ------------------------------------------------------------------ */

/** Läuft die App bereits als eigenständige App vom Home-Bildschirm? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // Safari auf dem iPhone kennt display-mode erst spät — deshalb beides.
  const legacy = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  if (legacy === true) return true;
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  „Einmal weggeklickt bleibt weggeklickt"                            */
/* ------------------------------------------------------------------ */

export const INSTALL_HINT_KEY = 'cattery.installHinweisWeggeklickt';

export function isInstallHintDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_HINT_KEY) === '1';
  } catch {
    // Privater Modus ohne Speicher: dann eben jedes Mal fragen.
    return false;
  }
}

export function dismissInstallHint(): void {
  try {
    localStorage.setItem(INSTALL_HINT_KEY, '1');
  } catch {
    /* ohne Speicher lässt sich nichts merken — kein Grund abzustürzen */
  }
}

/** Nur für den Fall, dass sie den Hinweis wiedersehen möchte. */
export function resetInstallHint(): void {
  try {
    localStorage.removeItem(INSTALL_HINT_KEY);
  } catch {
    /* siehe oben */
  }
}

/**
 * Soll der Hinweis von selbst erscheinen? Nur, wenn die App im Browser
 * läuft und noch nie weggeklickt wurde.
 */
export function shouldOfferInstall(): boolean {
  return !isStandalone() && !isInstallHintDismissed();
}

/** Steuert das Blatt, das beim ersten Start von selbst aufgeht. */
export function useInstallHint() {
  const [open, setOpen] = useState(false);
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    setStandalone(isStandalone());
    if (shouldOfferInstall()) setOpen(true);
  }, []);

  const close = useCallback(() => {
    dismissInstallHint();
    setOpen(false);
  }, []);

  return { open, close, standalone };
}

/* ------------------------------------------------------------------ */
/*  Bebilderte Anleitung                                               */
/* ------------------------------------------------------------------ */

/** Das Teilen-Symbol aus der Safari-Leiste. */
function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" aria-hidden="true">
      <path
        d="M12 3v11M8.5 6.5 12 3l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 10.5H5a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8.5a1 1 0 0 0-1-1h-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Das Symbol des Menüpunkts „Zum Home-Bildschirm". */
function HomeScreenGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" aria-hidden="true">
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M12 8.5v7M8.5 12h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Der Knopf „Hinzufügen" oben rechts. */
function AddGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" aria-hidden="true">
      <rect
        x="2.5"
        y="6"
        width="19"
        height="12"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M7.5 12h9M13.5 9l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Step({
  number,
  glyph,
  title,
  children,
}: {
  number: number;
  glyph: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-surface-2 text-accent">
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-text">
          <span className="text-text-faint tabular">{number}. </span>
          {title}
        </p>
        <p className="mt-0.5 text-[0.88rem] leading-relaxed text-text-dim">{children}</p>
      </div>
    </li>
  );
}

/** Die eigentliche Anleitung — auch in den Einstellungen wiederverwendbar. */
export function InstallGuide({ standalone }: { standalone?: boolean }) {
  if (standalone) {
    return (
      <Callout tone="ok" icon="check-circle" title="Die App liegt auf dem Home-Bildschirm">
        Alles eingerichtet. Erinnerungen können ankommen, und die Daten sind vor dem
        Aufräumen durch Safari geschützt.
      </Callout>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[0.95rem] leading-relaxed text-text-dim">
        Die App läuft gerade im Browser. Auf dem Home-Bildschirm startet sie schneller,
        füllt den ganzen Bildschirm und darf Erinnerungen anzeigen.
      </p>

      <ol className="flex flex-col gap-4">
        <Step number={1} glyph={<ShareGlyph />} title="Teilen-Symbol antippen">
          In Safari unten in der Leiste — das Quadrat mit dem Pfeil nach oben.
        </Step>
        <Step number={2} glyph={<HomeScreenGlyph />} title={'„Zum Home-Bildschirm"'}>
          Etwas nach unten wischen, bis der Eintrag in der Liste erscheint.
        </Step>
        <Step number={3} glyph={<AddGlyph />} title={'„Hinzufügen" antippen'}>
          Oben rechts bestätigen. Danach die App vom Home-Bildschirm aus öffnen.
        </Step>
      </ol>

      <Callout tone="warn" icon="bell" title="Ohne diesen Schritt keine Erinnerungen">
        Termine und Fahrplan-Punkte melden sich nur, wenn die App vom Home-Bildschirm
        aus läuft. Im Browser bleibt sie stumm.
      </Callout>
    </div>
  );
}

/** Blatt für den ersten Start und für die Einstellungen. */
export function InstallSheet({
  open,
  onClose,
  standalone,
}: {
  open: boolean;
  onClose: () => void;
  standalone?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="App zum Home-Bildschirm"
      footer={
        <Button block variant="primary" size="lg" onClick={onClose}>
          Verstanden
        </Button>
      }
    >
      <InstallGuide standalone={standalone} />
    </Sheet>
  );
}
