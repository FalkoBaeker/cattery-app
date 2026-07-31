/**
 * Benachrichtigungen für Termine.
 *
 * ------------------------------------------------------------------
 * Was diese App kann — und was nicht. Bitte hier nichts beschönigen.
 * ------------------------------------------------------------------
 * Es gibt keinen Server. Eine reine PWA kann sich deshalb **keine echten
 * geplanten Push-Nachrichten** schicken lassen: iOS stellt Web-Push nur
 * über einen fremden Server zu, und den gibt es hier bewusst nicht.
 *
 * Also läuft es so:
 *  - Beim Öffnen der App wird geprüft, welche Erinnerungen fällig sind —
 *    der Prüflauf startet beim Laden dieses Moduls, nicht erst, wenn der
 *    Kalender angetippt wird (siehe unten, „Start beim Öffnen der App").
 *  - Solange die App offen ist, prüft ein Zeitgeber jede Minute nach.
 *  - Kommt die App aus dem Hintergrund zurück, wird sofort nachgeprüft.
 *  - Ausgelöste Erinnerungen werden in `notificationLog` vermerkt
 *    (Schlüssel "appt:<id>:24h" bzw. ":1h"), damit nichts doppelt kommt.
 *
 * Folge: Wird die App tagelang nicht geöffnet, kann eine Mitteilung
 * ausbleiben. Deshalb zeigt der Kalender anstehende Termine **immer auch
 * als Karte in der App** — die Zustellung ist eine Zugabe, kein Versprechen.
 * Der Nutzerin wird das im Klartext gesagt (siehe NOTIFY_HONESTY).
 */

import { useCallback, useEffect, useState } from 'react';
import { db } from '../../db/db';
import { nowISO } from '../../lib/date';
import { dueReminders, type DueReminder } from './reminders';

/* ------------------------------------------------------------------ */
/*  Umgebung prüfen                                                    */
/* ------------------------------------------------------------------ */

export type NotifyState =
  | 'unsupported' /** Browser kennt keine Mitteilungen */
  | 'needs_install' /** iOS: erst nach „Zum Home-Bildschirm hinzufügen" */
  | 'ask' /** Berechtigung noch nicht erteilt, Frage steht noch aus */
  | 'granted'
  | 'denied';

export const NOTIFY_STATE_LABEL: Record<NotifyState, string> = {
  unsupported: 'Nicht möglich',
  needs_install: 'Erst zum Home-Bildschirm hinzufügen',
  ask: 'Noch nicht eingeschaltet',
  granted: 'Eingeschaltet',
  denied: 'In den iPhone-Einstellungen abgelehnt',
};

/** Läuft die App als installierte App (Home-Bildschirm), nicht im Browser-Tab? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const legacy = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  if (legacy === true) return true;
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true;
  } catch {
    return false;
  }
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS meldet sich seit Jahren als Macintosh — Touchpunkte verraten es.
  const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS;
}

function hasNotificationApi(): boolean {
  return typeof window !== 'undefined' && typeof window.Notification !== 'undefined';
}

/** Aktueller Zustand der Mitteilungen — Grundlage für alles in der Oberfläche. */
export function notifyState(): NotifyState {
  if (!hasNotificationApi()) {
    // Auf iOS fehlt die API im Browser-Tab und erscheint erst nach der
    // Installation. Das ist die häufigste Ursache — und behebbar.
    return isIOS() && !isStandalone() ? 'needs_install' : 'unsupported';
  }
  if (isIOS() && !isStandalone()) return 'needs_install';
  const permission = window.Notification.permission;
  if (permission === 'granted') return 'granted';
  if (permission === 'denied') return 'denied';
  return 'ask';
}

/** Können jetzt gerade Mitteilungen ausgelöst werden? */
export function canNotify(): boolean {
  return notifyState() === 'granted';
}

/**
 * Der Mitteilungs-Zustand als lebender Wert.
 *
 * Wird neu gelesen, sobald die App wieder in den Vordergrund kommt. Ohne das
 * bliebe der Warnhinweis stehen, nachdem die Mitteilungen gerade eben in den
 * iPhone-Einstellungen freigeschaltet wurden — die Berechtigung ändert sich
 * außerhalb der App, ohne dass sie davon etwas mitbekäme.
 */
export function useNotifyState(): [NotifyState, () => void] {
  const [state, setState] = useState<NotifyState>(() => notifyState());
  const refresh = useCallback(() => setState(notifyState()), []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return [state, refresh];
}

/* ------------------------------------------------------------------ */
/*  Erklärtexte (Oberfläche)                                           */
/* ------------------------------------------------------------------ */

/**
 * Der Text vor dem Systemdialog. Man hat genau einen Versuch: sagt man dem
 * iPhone einmal Nein, lässt sich das nur noch in den iPhone-Einstellungen
 * ändern. Deshalb wird vorher erklärt, worum es geht.
 */
export const NOTIFY_ASK_TEXT = {
  title: 'Erinnerungen einschalten',
  lead: 'Gleich fragt dich dein iPhone, ob diese App dir Mitteilungen schicken darf.',
  points: [
    'Diese Frage kommt nur ein einziges Mal. Sagst du hier Nein, lässt sie sich nur noch in den iPhone-Einstellungen wieder umstellen.',
    'Die App schickt dir damit ausschließlich Termin-Erinnerungen: 24 Stunden vorher und noch einmal 1 Stunde vorher. Sonst nichts.',
    'Es geht nichts ins Internet. Die Erinnerung entsteht auf diesem Gerät.',
  ],
} as const;

/** Die ehrliche Erklärung, wie zuverlässig das Ganze ist. Wird angezeigt. */
export const NOTIFY_HONESTY = {
  title: 'So zuverlässig sind die Erinnerungen',
  points: [
    'Die App läuft nur auf diesem iPhone. Es gibt keinen Server, der Mitteilungen verschickt.',
    'Erinnerungen kommen nur, wenn die App zum Home-Bildschirm hinzugefügt wurde. In einem Browser-Tab erlaubt iOS keine Mitteilungen.',
    'Geprüft wird, sobald du die App öffnest — und dann jede Minute, solange sie offen ist. Bleibt die App tagelang zu, kann eine Mitteilung ausbleiben.',
    'Verlass dich deshalb nicht allein darauf: Der Kalender zeigt anstehende Termine immer auch hier als Karte.',
  ],
} as const;

/** Kurzanleitung für die Installation — ohne Fachbegriffe. */
export const INSTALL_HINT = [
  'Safari öffnen und diese Seite aufrufen.',
  'Unten auf das Teilen-Symbol tippen (Quadrat mit Pfeil nach oben).',
  '„Zum Home-Bildschirm" wählen und bestätigen.',
  'Die App danach über das neue Symbol auf dem Home-Bildschirm starten.',
] as const;

/* ------------------------------------------------------------------ */
/*  Berechtigung anfordern                                             */
/* ------------------------------------------------------------------ */

export type PermissionResult = NotificationPermission | 'unsupported';

/**
 * Fordert die Berechtigung an. **Vorher** muss die Oberfläche erklärt haben,
 * worum es geht (NOTIFY_ASK_TEXT) — der Systemdialog kommt nur einmal.
 * Muss aus einer Nutzeraktion heraus aufgerufen werden.
 */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  if (!hasNotificationApi()) return 'unsupported';
  try {
    const result = await window.Notification.requestPermission();
    return result;
  } catch {
    return 'unsupported';
  }
}

/* ------------------------------------------------------------------ */
/*  Auslösen                                                           */
/* ------------------------------------------------------------------ */

function iconUrl(): string | undefined {
  try {
    return new URL('icon-192.png', document.baseURI).href;
  } catch {
    return undefined;
  }
}

/**
 * Zeigt eine Mitteilung. Bevorzugt über den Service Worker — auf iOS ist
 * `new Notification(...)` in der installierten App nicht erlaubt.
 * Liefert false, wenn nichts gezeigt werden konnte.
 */
export async function showNotification(
  title: string,
  body: string,
  tag: string,
): Promise<boolean> {
  if (!canNotify()) return false;
  // Die App wird unter einem Unterpfad ausgeliefert (GitHub Pages), deshalb
  // niemals mit führendem Schrägstrich arbeiten.
  const icon = iconUrl();
  const options: NotificationOptions = {
    body,
    // Gleicher Tag = die Mitteilung ersetzt sich selbst statt sich zu stapeln.
    tag,
    lang: 'de',
    icon,
    badge: icon,
    data: { tag },
  };

  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return true;
    }
  } catch {
    /* Weiter mit dem einfachen Weg. */
  }

  try {
    new window.Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Merker in der Datenbank                                            */
/* ------------------------------------------------------------------ */

/**
 * `notificationLog` hat `key` als Primärschlüssel und keine Zeitstempel-
 * Felder, passt also nicht zu insert/patch aus db.ts. Deshalb direkt `put`.
 */
export async function markFired(keys: string[], at: string = nowISO()): Promise<void> {
  if (keys.length === 0) return;
  await db.notificationLog.bulkPut(keys.map((key) => ({ key, firedAt: at })));
}

export async function firedKeys(): Promise<Set<string>> {
  const rows = await db.notificationLog.toArray();
  return new Set(rows.map((r) => r.key));
}

/** Vergisst die Merker eines Termins — nötig, wenn er verschoben wird. */
export async function resetReminders(appointmentId: string): Promise<void> {
  await db.notificationLog.bulkDelete([
    `appt:${appointmentId}:24h`,
    `appt:${appointmentId}:1h`,
  ]);
}

/** Räumt Merker zu Terminen weg, die es nicht mehr gibt. */
export async function pruneReminderLog(): Promise<void> {
  const [rows, ids] = await Promise.all([
    db.notificationLog.toArray(),
    db.appointments.toCollection().primaryKeys(),
  ]);
  const alive = new Set(ids as string[]);
  const dead = rows
    .filter((r) => r.key.startsWith('appt:'))
    .filter((r) => !alive.has(r.key.split(':')[1]))
    .map((r) => r.key);
  if (dead.length > 0) await db.notificationLog.bulkDelete(dead);
}

/* ------------------------------------------------------------------ */
/*  Prüflauf                                                           */
/* ------------------------------------------------------------------ */

export interface ReminderRunResult {
  /** Was tatsächlich als Mitteilung gezeigt wurde. */
  shown: DueReminder[];
  /** Was fällig war — auch wenn die Zustellung nicht möglich war. */
  due: DueReminder[];
  /** Konnte überhaupt zugestellt werden? */
  delivered: boolean;
}

/**
 * Ein Durchlauf: fällige Erinnerungen suchen, auslösen, vermerken.
 *
 * Ist die Zustellung nicht möglich (keine Berechtigung, App nicht
 * installiert), wird **nichts** vermerkt — dann kann die Erinnerung später
 * noch kommen, sobald es geht. Verpasst ist verpasst wäre hier das
 * schlechtere Verhalten.
 */
export async function runReminderCheck(now: string = nowISO()): Promise<ReminderRunResult> {
  const [appointments, fired] = await Promise.all([
    db.appointments.toArray(),
    firedKeys(),
  ]);
  const check = dueReminders(appointments, now, fired);
  if (check.notify.length === 0) return { shown: [], due: [], delivered: canNotify() };

  if (!canNotify()) return { shown: [], due: check.notify, delivered: false };

  const shown: DueReminder[] = [];
  // Vermerkt wird streng je Termin: Scheitert die Zustellung für einen von
  // mehreren, darf dessen Erinnerung nicht als erledigt gelten.
  const keys: string[] = [];
  for (const reminder of check.notify) {
    const ok = await showNotification(reminder.title, reminder.body, reminder.key);
    if (!ok) continue;
    shown.push(reminder);
    keys.push(...reminder.markKeys);
  }

  if (keys.length > 0) await markFired(keys, now);
  return { shown, due: check.notify, delivered: shown.length > 0 };
}

/* ------------------------------------------------------------------ */
/*  Zeitgeber                                                          */
/* ------------------------------------------------------------------ */

export const REMINDER_TICK_MS = 60_000;

/**
 * Startet die Prüfung: einmal sofort, danach jede Minute, außerdem jedes Mal,
 * wenn die App wieder in den Vordergrund kommt. Gibt eine Abmeldefunktion
 * zurück.
 */
export function startReminderRunner(intervalMs: number = REMINDER_TICK_MS): () => void {
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void runReminderCheck().catch(() => {
      /* Eine fehlgeschlagene Prüfung darf die App nicht stören. */
    });
  };

  tick();
  const handle = window.setInterval(tick, intervalMs);
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    window.clearInterval(handle);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/* ------------------------------------------------------------------ */
/*  Genau ein Prüflauf für die ganze App                               */
/* ------------------------------------------------------------------ */

let running: (() => void) | null = null;
let users = 0;

/**
 * Sorgt dafür, dass **genau ein** Prüflauf läuft, egal wie viele Stellen ihn
 * anfordern. Gibt eine Abmeldung zurück; erst wenn sich der letzte Nutzer
 * abmeldet, hört der Prüflauf auf.
 */
export function ensureReminderRunner(): () => void {
  users += 1;
  if (!running) running = startReminderRunner();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    users = Math.max(0, users - 1);
    if (users === 0 && running) {
      running();
      running = null;
    }
  };
}

/** Nur für Tests: Prüflauf und Zähler in den Ausgangszustand bringen. */
export function stopReminderRunner(): void {
  if (running) running();
  running = null;
  users = 0;
}

/**
 * Hängt den Prüflauf an die Lebensdauer einer Komponente.
 *
 * Startet ihn nicht doppelt: unter der Haube steht der eine Prüflauf aus
 * `ensureReminderRunner`. Der Bildschirm hält ihn nur zusätzlich am Leben.
 */
export function useReminderRunner(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    return ensureReminderRunner();
  }, [enabled]);
}
