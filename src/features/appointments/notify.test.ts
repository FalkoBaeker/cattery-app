import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, insert, wipeDatabase } from '../../db/db';
import {
  canNotify,
  firedKeys,
  markFired,
  notifyState,
  pruneReminderLog,
  resetReminders,
  runReminderCheck,
} from './notify';

/** Merkt sich, was an Mitteilungen ausgelöst wurde. */
const shown: { title: string; body?: string; tag?: string }[] = [];

function stubNotification(permission: NotificationPermission) {
  class FakeNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = async () => permission;
    constructor(title: string, options?: NotificationOptions) {
      shown.push({ title, body: options?.body, tag: options?.tag });
    }
  }
  vi.stubGlobal('Notification', FakeNotification);
}

function inHours(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString();
}

beforeEach(async () => {
  shown.length = 0;
  await wipeDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notifyState', () => {
  it('meldet ehrlich, wenn der Browser keine Mitteilungen kennt', () => {
    // jsdom bringt keine Notification-API mit.
    expect(notifyState()).toBe('unsupported');
    expect(canNotify()).toBe(false);
  });

  it('erkennt erteilte und abgelehnte Berechtigung', () => {
    stubNotification('granted');
    expect(notifyState()).toBe('granted');
    expect(canNotify()).toBe(true);

    stubNotification('denied');
    expect(notifyState()).toBe('denied');

    stubNotification('default');
    expect(notifyState()).toBe('ask');
  });
});

describe('Merker in notificationLog', () => {
  it('vermerkt Schlüssel und liest sie wieder', async () => {
    await markFired(['appt:a1:24h', 'appt:a1:1h']);
    const keys = await firedKeys();
    expect(keys.has('appt:a1:24h')).toBe(true);
    expect(keys.has('appt:a1:1h')).toBe(true);
  });

  it('kommt mit einer leeren Liste zurecht', async () => {
    await markFired([]);
    expect((await firedKeys()).size).toBe(0);
  });

  it('vergisst die Merker eines verschobenen Termins', async () => {
    await markFired(['appt:a1:24h', 'appt:a1:1h', 'appt:a2:24h']);
    await resetReminders('a1');
    const keys = await firedKeys();
    expect(keys.has('appt:a1:24h')).toBe(false);
    expect(keys.has('appt:a2:24h')).toBe(true);
  });

  it('räumt Merker zu gelöschten Terminen weg', async () => {
    const a = await insert(db.appointments, {
      kind: 'vet',
      startAt: inHours(48),
      remind24h: true,
      remind1h: true,
    });
    await markFired([`appt:${a.id}:24h`, 'appt:verschwunden:24h']);
    await pruneReminderLog();
    const keys = await firedKeys();
    expect(keys.has(`appt:${a.id}:24h`)).toBe(true);
    expect(keys.has('appt:verschwunden:24h')).toBe(false);
  });
});

describe('runReminderCheck', () => {
  it('löst eine fällige Erinnerung aus und vermerkt sie', async () => {
    stubNotification('granted');
    const a = await insert(db.appointments, {
      kind: 'meet_breeder',
      title: 'Familie Meyer',
      startAt: inHours(2),
      remind24h: true,
      remind1h: true,
    });

    const result = await runReminderCheck();
    expect(result.shown).toHaveLength(1);
    expect(shown[0].title).toContain('Familie Meyer');

    const keys = await firedKeys();
    expect(keys.has(`appt:${a.id}:24h`)).toBe(true);

    // Ein zweiter Durchlauf schickt nichts noch einmal.
    const again = await runReminderCheck();
    expect(again.shown).toHaveLength(0);
    expect(shown).toHaveLength(1);
  });

  it('vermerkt nichts, wenn gar nicht zugestellt werden kann', async () => {
    // Keine Notification-API — die Erinnerung darf nicht als erledigt gelten,
    // sonst kommt sie nie, auch wenn es später ginge.
    const a = await insert(db.appointments, {
      kind: 'pickup',
      startAt: inHours(2),
      remind24h: true,
      remind1h: true,
    });

    const result = await runReminderCheck();
    expect(result.delivered).toBe(false);
    expect(result.due).toHaveLength(1);
    expect((await firedKeys()).has(`appt:${a.id}:24h`)).toBe(false);
  });

  it('lässt abgesagte Termine in Ruhe', async () => {
    stubNotification('granted');
    await insert(db.appointments, {
      kind: 'vet',
      startAt: inHours(2),
      remind24h: true,
      remind1h: true,
      cancelledAt: new Date().toISOString(),
    });
    const result = await runReminderCheck();
    expect(result.shown).toHaveLength(0);
    expect(shown).toHaveLength(0);
  });

  it('bleibt bei einer leeren Datenbank still', async () => {
    stubNotification('granted');
    const result = await runReminderCheck();
    expect(result.shown).toEqual([]);
    expect(result.due).toEqual([]);
  });
});
