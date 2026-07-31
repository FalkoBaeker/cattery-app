/**
 * Datenbeschaffung für das Termin-Modul.
 *
 * Alles über `useLiveQuery`, damit die Oberfläche automatisch nachzieht.
 * Gelesen wird aus vielen Tabellen, geschrieben ausschließlich in
 * `appointments`, `interestNotes` (Nachbereitung, F85) und `notificationLog`.
 */

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  DEFAULT_SETTINGS,
  kittenLabel,
  type Appointment,
  type Cat,
  type ID,
  type Interest,
  type Kitten,
  type Litter,
  type Settings,
} from '../../types';
import { todayISO } from '../../lib/date';
import { buildCalendarEntries, type CalendarEntry, type CalendarNames } from './reminders';

/* ------------------------------------------------------------------ */
/*  Einstellungen                                                      */
/* ------------------------------------------------------------------ */

/**
 * Einstellungen als lebende Abfrage. Fehlt der Datensatz noch (frische
 * Installation), gelten die Vorgabewerte — der Bildschirm wartet nicht.
 *
 * `loading` ist wichtig, wo ein Feld mit einer Vorgabe aus den Einstellungen
 * befüllt wird: sonst steht das Formular schon da, bevor die Vorgabe bekannt
 * ist, und der Standard-Ort fehlt.
 */
export function useAppSettingsState(): { settings: Settings; loading: boolean } {
  // Das Hüllobjekt trennt „lädt noch" von „gibt es nicht".
  const result = useLiveQuery(async () => ({ value: await db.settings.get('singleton') }), []);
  return useMemo(() => {
    const stored = result?.value;
    if (!stored) return { settings: DEFAULT_SETTINGS, loading: result === undefined };
    return {
      loading: false,
      settings: {
        ...DEFAULT_SETTINGS,
        ...stored,
        seller: { ...DEFAULT_SETTINGS.seller, ...stored.seller },
        weight: { ...DEFAULT_SETTINGS.weight, ...stored.weight },
        schedule: { ...DEFAULT_SETTINGS.schedule, ...stored.schedule },
        modules: { ...DEFAULT_SETTINGS.modules, ...stored.modules },
        id: 'singleton' as const,
      },
    };
  }, [result]);
}

/* ------------------------------------------------------------------ */
/*  Namen für den Bezug                                                */
/* ------------------------------------------------------------------ */

export function litterTitle(litter: Litter, catNames: Map<ID, string>): string {
  const mother = catNames.get(litter.motherId);
  return mother ? `Wurf von ${mother}` : 'Wurf';
}

function buildNames(cats: Cat[], litters: Litter[], kittens: Kitten[], interests: Interest[]) {
  const catNames = new Map<ID, string>(cats.map((c) => [c.id, c.callName]));
  const litterNames = new Map<ID, string>(litters.map((l) => [l.id, litterTitle(l, catNames)]));
  const kittenNames = new Map<ID, string>(kittens.map((k) => [k.id, kittenLabel(k)]));
  const interestNames = new Map<ID, string>(interests.map((i) => [i.id, i.name]));
  const names: CalendarNames = {
    cats: catNames,
    litters: litterNames,
    kittens: kittenNames,
    interests: interestNames,
  };
  return names;
}

/* ------------------------------------------------------------------ */
/*  Kalender                                                           */
/* ------------------------------------------------------------------ */

export interface CalendarData {
  /** true, solange die Datenbank noch antwortet — nicht mit „leer" verwechseln. */
  loading: boolean;
  entries: CalendarEntry[];
  appointments: Appointment[];
  interests: Interest[];
  cats: Cat[];
  litters: Litter[];
  kittens: Kitten[];
  names: CalendarNames;
}

/**
 * Lädt alle Quellen des Kalenders in einem Rutsch. Ein einziger
 * `useLiveQuery` sorgt dafür, dass es genau einen Ladezustand gibt und die
 * Anzeige nicht stückweise aufpoppt.
 */
export function useCalendarData(today: string = todayISO()): CalendarData {
  const raw = useLiveQuery(async () => {
    const [appointments, careTasks, litters, healthTests, breedingUses, cats, kittens, interests] =
      await Promise.all([
        db.appointments.toArray(),
        db.careTasks.toArray(),
        db.litters.toArray(),
        db.healthTests.toArray(),
        db.breedingUses.toArray(),
        db.cats.toArray(),
        db.kittens.toArray(),
        db.interests.toArray(),
      ]);
    return { appointments, careTasks, litters, healthTests, breedingUses, cats, kittens, interests };
  }, []);

  return useMemo<CalendarData>(() => {
    if (!raw) {
      return {
        loading: true,
        entries: [],
        appointments: [],
        interests: [],
        cats: [],
        litters: [],
        kittens: [],
        names: {},
      };
    }
    // Gelöschte Interessenten liegen im Papierkorb und werden nicht angeboten.
    const interests = raw.interests.filter((i) => !i.deletedAt);
    const names = buildNames(raw.cats, raw.litters, raw.kittens, raw.interests);
    const entries = buildCalendarEntries(
      {
        appointments: raw.appointments,
        careTasks: raw.careTasks,
        litters: raw.litters,
        healthTests: raw.healthTests,
        breedingUses: raw.breedingUses,
        names,
      },
      today,
    );
    return {
      loading: false,
      entries,
      appointments: raw.appointments,
      interests,
      cats: raw.cats,
      litters: raw.litters,
      kittens: raw.kittens,
      names,
    };
  }, [raw, today]);
}

/* ------------------------------------------------------------------ */
/*  Einzelner Termin                                                   */
/* ------------------------------------------------------------------ */

export interface AppointmentFormData {
  loading: boolean;
  interests: Interest[];
  cats: Cat[];
  litters: Litter[];
  names: CalendarNames;
}

/** Auswahllisten für das Termin-Formular. */
export function useAppointmentFormData(): AppointmentFormData {
  const raw = useLiveQuery(async () => {
    const [cats, litters, kittens, interests] = await Promise.all([
      db.cats.toArray(),
      db.litters.toArray(),
      db.kittens.toArray(),
      db.interests.toArray(),
    ]);
    return { cats, litters, kittens, interests };
  }, []);

  return useMemo<AppointmentFormData>(() => {
    if (!raw) return { loading: true, interests: [], cats: [], litters: [], names: {} };
    const names = buildNames(raw.cats, raw.litters, raw.kittens, raw.interests);
    return {
      loading: false,
      interests: raw.interests
        .filter((i) => !i.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
      cats: raw.cats
        .filter((c) => c.status !== 'deceased')
        .sort((a, b) => a.callName.localeCompare(b.callName, 'de')),
      litters: raw.litters
        .filter((l) => l.status !== 'cancelled')
        .sort((a, b) => (b.birthDate ?? b.dueDate ?? '').localeCompare(a.birthDate ?? a.dueDate ?? '')),
      names,
    };
  }, [raw]);
}
