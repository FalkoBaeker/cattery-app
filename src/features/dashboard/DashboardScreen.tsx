/**
 * „Heute" — der erste Eindruck beim Öffnen der App.
 *
 * Hier steht ausschließlich, was jetzt dran ist. Keine Kennzahlen, keine
 * Verläufe, keine Statistik. Jeder Abschnitt verschwindet, sobald er leer ist.
 * Der Bildschirm schreibt nichts — er liest nur und führt weiter.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Badge,
  Button,
  Callout,
  Card,
  Icon,
  List,
  ListRow,
  Screen,
  Section,
  Spinner,
  Stack,
} from '../../ui';
import { db } from '../../db/db';
import { BrandImage } from '../../ui/BrandImage';
import { useSettings } from '../settings/useSettings';
import { InstallSheet, useInstallHint } from '../settings/install';
import { buildDashboard, type DashboardModel } from './dashboard';
import { WEIGHT_LEVEL_LABEL } from '../../domain/weight';
import {
  APPOINTMENT_KIND_LABEL,
  BREEDING_USE_STAGE_LABEL,
  CARE_TASK_LABEL,
  type Appointment,
  type ID,
} from '../../types';
import {
  dateOf,
  formatDate,
  formatDateWithWeekday,
  formatDeadline,
  formatTime,
  todayISO,
} from '../../lib/date';

/* ------------------------------------------------------------------ */
/*  Datenbeschaffung                                                   */
/* ------------------------------------------------------------------ */

function useDashboardData() {
  return useLiveQuery(async () => {
    const [
      cats,
      litters,
      kittens,
      weights,
      careTasks,
      appointments,
      healthTests,
      breedingUses,
      interests,
      documents,
      contracts,
      costs,
      revenues,
    ] = await Promise.all([
      db.cats.toArray(),
      db.litters.toArray(),
      db.kittens.toArray(),
      db.weights.toArray(),
      db.careTasks.toArray(),
      db.appointments.toArray(),
      db.healthTests.toArray(),
      db.breedingUses.toArray(),
      db.interests.toArray(),
      db.documents.toArray(),
      db.contracts.toArray(),
      db.costs.toArray(),
      db.revenues.toArray(),
    ]);
    return {
      cats,
      litters,
      kittens,
      weights,
      careTasks,
      appointments,
      healthTests,
      breedingUses,
      interests,
      documents,
      contracts,
      costs,
      revenues,
    };
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Bildschirm                                                         */
/* ------------------------------------------------------------------ */

export function DashboardScreen() {
  const navigate = useNavigate();
  const settings = useSettings();
  const data = useDashboardData();
  const install = useInstallHint();
  const [guideOpen, setGuideOpen] = useState(false);

  const today = todayISO();

  const model: DashboardModel | undefined = useMemo(() => {
    if (!settings || !data) return undefined;
    return buildDashboard({
      today,
      settings,
      lastBackupAt: settings.lastBackupAt,
      ...data,
    });
  }, [settings, data, today]);

  const interestNames = useMemo(() => {
    const map = new Map<ID, string>();
    for (const i of data?.interests ?? []) map.set(i.id, i.name);
    return map;
  }, [data]);

  /* --- Ladezustand ------------------------------------------------- */

  if (!settings || !data || !model) {
    return (
      <Screen title="Heute" subtitle={formatDateWithWeekday(today)}>
        <div className="flex flex-col items-center gap-3 py-16 text-text-faint">
          <Spinner size={26} />
          <p className="text-sm">Einen Moment …</p>
        </div>
      </Screen>
    );
  }

  const modules = settings.modules;
  const showWeights = modules.weights && modules.litters;
  const showTasks = modules.litters;
  const showAppointments = modules.appointments;
  const showHealth = modules.cats;
  const showBreedingUse = modules.contracts;

  const weightAlerts = showWeights ? model.weightAlerts : [];
  const weighReminders = showWeights ? model.weighReminders : [];
  const careTasks = showTasks ? model.careTasks : [];
  const appointmentsToday = showAppointments ? model.appointmentsToday : [];
  const appointmentsTomorrow = showAppointments ? model.appointmentsTomorrow : [];
  const healthTests = showHealth ? model.healthTests : [];
  const breedingDeadlines = showBreedingUse ? model.breedingDeadlines : [];

  const nothingOpen =
    weightAlerts.length === 0 &&
    weighReminders.length === 0 &&
    careTasks.length === 0 &&
    appointmentsToday.length === 0 &&
    appointmentsTomorrow.length === 0 &&
    healthTests.length === 0 &&
    breedingDeadlines.length === 0 &&
    !model.backup.due;

  /* --- Allererster Start ------------------------------------------- */

  if (!model.hasAnyData) {
    return (
      <Screen title="Heute" subtitle={formatDateWithWeekday(today)}>
        <FirstRun
          onCats={() => navigate('/zucht')}
          onSettings={() => navigate('/mehr/einstellungen')}
          onInstall={() => setGuideOpen(true)}
          standalone={install.standalone}
          showCats={modules.cats}
        />
        <InstallSheet
          open={guideOpen || install.open}
          onClose={() => {
            setGuideOpen(false);
            install.close();
          }}
          standalone={install.standalone}
        />
      </Screen>
    );
  }

  /* --- Alltag ------------------------------------------------------- */

  return (
    <Screen title="Heute" subtitle={formatDateWithWeekday(today)}>
      <Stack gap="lg">
        {nothingOpen && <AllClear />}

        {weightAlerts.length > 0 && (
          <Section title="Warnungen">
            <List>
              {weightAlerts.map((a) => (
                <ListRow
                  key={a.kittenId}
                  leading={
                    <span className={a.level === 'critical' ? 'text-alert' : 'text-warn'}>
                      <Icon name="alert" size={20} />
                    </span>
                  }
                  title={a.kittenName}
                  subtitle={a.reasons[0] ?? a.litterName}
                  trailing={
                    <Badge tone={a.level === 'critical' ? 'alert' : 'warn'}>
                      {WEIGHT_LEVEL_LABEL[a.level]}
                    </Badge>
                  }
                  onClick={() => navigate(`/zucht/kitten/${a.kittenId}`)}
                />
              ))}
            </List>
          </Section>
        )}

        {weighReminders.length > 0 && (
          <Section title="Heute noch nicht gewogen">
            <List>
              {weighReminders.map((r) => (
                <ListRow
                  key={r.litterId}
                  leading={
                    <span className="text-accent">
                      <Icon name="scale" size={20} />
                    </span>
                  }
                  title={r.litterName}
                  subtitle={
                    r.pending === r.total
                      ? `${r.total === 1 ? 'Das Kitten ist' : `Alle ${r.total} Kitten sind`} dran · ${r.reason}`
                      : `${r.pending} von ${r.total} Kitten offen · ${r.reason}`
                  }
                  trailing={<Badge tone="accent">Wiegen</Badge>}
                  onClick={() => navigate(`/wiegen/${r.litterId}`)}
                />
              ))}
            </List>
          </Section>
        )}

        {appointmentsToday.length > 0 && (
          <Section title="Termine heute">
            <List>
              {appointmentsToday.map((a) => (
                <AppointmentRow
                  key={a.id}
                  appointment={a}
                  interestNames={interestNames}
                  onClick={() => navigate(`/kalender/${a.id}`)}
                />
              ))}
            </List>
          </Section>
        )}

        {appointmentsTomorrow.length > 0 && (
          <Section title="Termine morgen">
            <List>
              {appointmentsTomorrow.map((a) => (
                <AppointmentRow
                  key={a.id}
                  appointment={a}
                  interestNames={interestNames}
                  onClick={() => navigate(`/kalender/${a.id}`)}
                />
              ))}
            </List>
          </Section>
        )}

        {careTasks.length > 0 && (
          <Section title="Fahrplan">
            <List>
              {careTasks.map(({ task, context, overdueDays }) => (
                <ListRow
                  key={task.id}
                  leading={
                    <span className={overdueDays > 0 ? 'text-alert' : 'text-text-dim'}>
                      <Icon name={taskIcon(task.kind)} size={20} />
                    </span>
                  }
                  title={task.title}
                  subtitle={[context, task.detail].filter(Boolean).join(' · ') || CARE_TASK_LABEL[task.kind]}
                  trailing={
                    overdueDays > 0 ? (
                      <Badge tone="alert">
                        {overdueDays === 1 ? '1 Tag über' : `${overdueDays} Tage über`}
                      </Badge>
                    ) : (
                      <span className="text-[0.85rem] text-text-dim">
                        {formatDate(task.dueDate)}
                      </span>
                    )
                  }
                  onClick={() => navigate(careTaskTarget(task.litterId, task.kittenId, task.catId))}
                />
              ))}
            </List>
          </Section>
        )}

        {healthTests.length > 0 && (
          <Section title="Gesundheitstests">
            <List>
              {healthTests.map((h) => (
                <ListRow
                  key={h.test.id}
                  leading={
                    <span className={h.dueInDays < 0 ? 'text-alert' : 'text-warn'}>
                      <Icon name="heart" size={20} />
                    </span>
                  }
                  title={`${h.label} · ${h.catName}`}
                  subtitle={
                    h.dueInDays < 0
                      ? `Abgelaufen am ${formatDate(h.test.nextDueDate)}`
                      : `Läuft ab am ${formatDate(h.test.nextDueDate)}`
                  }
                  trailing={
                    <Badge tone={h.dueInDays < 0 ? 'alert' : 'warn'}>
                      {h.dueInDays < 0
                        ? 'abgelaufen'
                        : h.dueInDays === 0
                          ? 'heute'
                          : `${h.dueInDays} T.`}
                    </Badge>
                  }
                  onClick={() => navigate(`/zucht/katze/${h.test.catId}`)}
                />
              ))}
            </List>
          </Section>
        )}

        {breedingDeadlines.length > 0 && (
          <Section title="Zuchtnutzung">
            <List>
              {breedingDeadlines.map(({ use, dueInDays }) => (
                <ListRow
                  key={use.id}
                  leading={
                    <span className={dueInDays < 0 ? 'text-alert' : 'text-text-dim'}>
                      <Icon name="clock" size={20} />
                    </span>
                  }
                  title={use.catName}
                  subtitle={`${BREEDING_USE_STAGE_LABEL[use.stage]} · Frist ${formatDate(use.deadlineDate)}`}
                  trailing={
                    <Badge tone={dueInDays < 0 ? 'alert' : dueInDays <= 31 ? 'warn' : 'neutral'}>
                      {formatDeadline(use.deadlineDate, today)}
                    </Badge>
                  }
                  onClick={() => navigate(`/mehr/zuchtnutzung/${use.id}`)}
                />
              ))}
            </List>
          </Section>
        )}

        {model.backup.due && (
          <Section title="Sicherung">
            <Callout tone="warn" icon="download" title="Zeit für eine Sicherung">
              <p>
                {model.backup.neverBackedUp
                  ? 'Es wurde noch nie gesichert. Ohne Sicherungsdatei sind alle Daten weg, wenn das iPhone verloren geht oder zurückgesetzt wird.'
                  : `Die letzte Sicherung ist ${model.backup.daysSince} Tage her (eingestellt: alle ${model.backup.intervalDays} Tage).`}
              </p>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  icon="download"
                  onClick={() => navigate('/mehr/einstellungen')}
                >
                  Jetzt sichern
                </Button>
              </div>
            </Callout>
          </Section>
        )}
      </Stack>

      <InstallSheet
        open={guideOpen || install.open}
        onClose={() => {
          setGuideOpen(false);
          install.close();
        }}
        standalone={install.standalone}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/*  Bausteine                                                          */
/* ------------------------------------------------------------------ */

function AppointmentRow({
  appointment,
  interestNames,
  onClick,
}: {
  appointment: Appointment;
  interestNames: Map<ID, string>;
  onClick: () => void;
}) {
  const person = appointment.interestId ? interestNames.get(appointment.interestId) : undefined;
  const subtitleParts = [
    APPOINTMENT_KIND_LABEL[appointment.kind],
    person,
    appointment.location,
  ].filter(Boolean) as string[];

  return (
    <ListRow
      leading={
        <span className="text-accent">
          <Icon name="calendar" size={20} />
        </span>
      }
      title={appointment.title?.trim() || person || APPOINTMENT_KIND_LABEL[appointment.kind]}
      subtitle={subtitleParts.join(' · ')}
      trailing={
        <span className="tabular">
          {formatTime(appointment.startAt)}
          <span className="sr-only"> Uhr am {formatDate(dateOf(appointment.startAt))}</span>
        </span>
      }
      onClick={onClick}
    />
  );
}

/** Ruhiger Zustand, wenn nichts offen ist. Kein Jubel, nur Ruhe. */
function AllClear() {
  return (
    <Card className="flex flex-col items-center gap-2 py-8 text-center">
      <BrandImage name="today" className="empty-art size-24" />
      <p className="font-medium text-text">Für heute ist alles erledigt.</p>
      <p className="max-w-xs text-sm leading-relaxed text-text-dim">
        Sobald etwas ansteht — wiegen, ein Termin, ein Fahrplan-Punkt — steht es hier.
      </p>
    </Card>
  );
}

/** Einführung beim allerersten Start. Drei Schritte, mehr nicht. */
function FirstRun({
  onCats,
  onSettings,
  onInstall,
  standalone,
  showCats,
}: {
  onCats: () => void;
  onSettings: () => void;
  onInstall: () => void;
  standalone: boolean;
  showCats: boolean;
}) {
  return (
    <Stack gap="lg">
      <section className="flex flex-col items-center px-3 pt-1 text-center">
        <BrandImage name="cat-family" className="empty-art mb-2 size-36" />
        <h2 className="text-[1.2rem] font-semibold text-text">Willkommen</h2>
        <p className="mt-1.5 max-w-md text-[0.92rem] leading-relaxed text-text-dim">
          Die App startet leer. Alles Weitere entsteht mit der Zeit — Wurf für Wurf.
          Das sind die ersten sinnvollen Schritte:
        </p>
      </section>

      <List>
        {showCats && (
          <ListRow
            leading={<StepNumber n={1} />}
            title="Zuchttiere anlegen"
            subtitle="Die Königinnen und den Kater eintragen"
            onClick={onCats}
          />
        )}
        <ListRow
          leading={<StepNumber n={showCats ? 2 : 1} />}
          title="Einstellungen ausfüllen"
          subtitle="Name und Anschrift für die Verträge, Zwingername, Verein"
          onClick={onSettings}
        />
        <ListRow
          leading={<StepNumber n={showCats ? 3 : 2} />}
          title="App zum Home-Bildschirm"
          subtitle={
            standalone ? 'Bereits erledigt' : 'Ohne diesen Schritt kommen keine Erinnerungen an'
          }
          onClick={onInstall}
        />
      </List>

      <Callout tone="neutral" icon="lock" title="Alles bleibt auf diesem iPhone">
        Es gibt keinen Server und kein Konto. Nichts wird hochgeladen. Genau deshalb ist
        die regelmäßige Sicherung nach iCloud Drive wichtig.
      </Callout>
    </Stack>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-[0.9rem] font-semibold text-accent tabular">
      {n}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Kleinkram                                                          */
/* ------------------------------------------------------------------ */

function taskIcon(kind: string) {
  switch (kind) {
    case 'deworming':
      return 'pill' as const;
    case 'vaccination':
      return 'syringe' as const;
    case 'chip':
      return 'chip' as const;
    case 'neuter':
      return 'scissors' as const;
    case 'litter_registration':
      return 'document' as const;
    case 'handover_allowed':
      return 'paw' as const;
    case 'health_test':
      return 'heart' as const;
    default:
      return 'check-circle' as const;
  }
}

function careTaskTarget(litterId?: ID, kittenId?: ID, catId?: ID): string {
  if (kittenId) return `/zucht/kitten/${kittenId}`;
  if (litterId) return `/zucht/wurf/${litterId}`;
  if (catId) return `/zucht/katze/${catId}`;
  return '/zucht';
}
