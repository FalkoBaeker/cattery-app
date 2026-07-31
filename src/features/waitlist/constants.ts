/**
 * Zuordnungen und kleine Helfer der Warteliste — ohne React-Komponenten,
 * damit das schnelle Neuladen im Entwicklungsbetrieb sauber bleibt.
 */

import type { BadgeTone, IconName } from '../../ui';
import type { ContactChannel, InterestStatus } from '../../types';

/** Farbe des Status-Kennzeichens. */
export const STATUS_TONE: Record<InterestStatus, BadgeTone> = {
  new: 'accent',
  contacted: 'neutral',
  shortlisted: 'warn',
  reserved: 'ok',
  completed: 'ok',
  declined: 'alert',
};

/** Reihenfolge der Status-Kette. „Abgesagt" steht bewusst daneben. */
export const STATUS_CHAIN: InterestStatus[] = [
  'new',
  'contacted',
  'shortlisted',
  'reserved',
  'completed',
];

export const CHANNEL_ICON: Record<ContactChannel, IconName> = {
  call: 'phone',
  whatsapp: 'whatsapp',
  email: 'mail',
  visit: 'users',
  other: 'list',
};

export const CHANNEL_ORDER: ContactChannel[] = ['call', 'whatsapp', 'email', 'visit', 'other'];

/**
 * Öffnet einen Verweis nach außen (tel:, mailto:, https://wa.me/…).
 *
 * `tel:` und `mailto:` werden vom iPhone direkt an Telefon und Mail
 * übergeben — dafür ist der direkte Weg der richtige, ein neues Fenster
 * bliebe leer zurück.
 *
 * Web-Adressen (wa.me) gehen bewusst in ein eigenes Fenster: Läuft die App
 * vom Home-Bildschirm, bleibt sie so unangetastet im Hintergrund stehen.
 * Wird das Fenster geblockt, bleibt der direkte Weg als Rückfallebene.
 */
export function openExternal(url: string): void {
  if (url.startsWith('tel:') || url.startsWith('mailto:')) {
    window.location.href = url;
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.href = url;
}
