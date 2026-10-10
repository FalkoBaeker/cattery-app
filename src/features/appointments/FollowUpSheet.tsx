import { useEffect, useState } from 'react';
import { Button, Callout, EventDateTimeField, Sheet, Stack, TextArea, useToast } from '../../ui';
import { db, insertPlain, patch } from '../../db/db';
import { formatDateTime, fromLocalInputValue, todayISO, toLocalInputValue } from '../../lib/date';
import type { Appointment } from '../../types';
import { appointmentTitle } from './reminders';

/**
 * Die Nachbereitung nach einem Termin (F85).
 *
 * Der Text landet im Verlauf des Interessenten — als Notiz mit dem Kanal
 * „Besuch". Ist kein Interessent verknüpft (das ist erlaubt), bleibt der Text
 * beim Termin selbst. Beides wird vorher gesagt, damit nichts überraschend
 * woanders auftaucht.
 */
export function FollowUpSheet({
  appointment,
  interestName,
  onClose,
}: {
  appointment: Appointment | null;
  interestName?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [at, setAt] = useState('');
  const eventTime = new Date(at).getTime();
  const validAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) && Number.isFinite(eventTime) &&
    toLocalInputValue(new Date(eventTime).toISOString()) === at && eventTime <= Date.now();

  useEffect(() => {
    if (appointment) {
      setText('');
      setAt(toLocalInputValue(appointment.startAt));
    }
  }, [appointment]);

  async function save() {
    if (!appointment) return;
    const clean = text.trim();
    if (clean && !validAt) {
      toast.error('Bitte einen gültigen Zeitpunkt bis jetzt eintragen.');
      return;
    }
    setSaving(true);
    try {
      if (clean) {
        if (appointment.interestId) {
          await insertPlain(db.interestNotes, {
            interestId: appointment.interestId,
            at: fromLocalInputValue(at),
            channel: 'visit',
            text: clean,
          });
        } else {
          const previous = appointment.note?.trim();
          const datedNote = `${formatDateTime(fromLocalInputValue(at))}\n${clean}`;
          await patch(db.appointments, appointment.id, {
            note: previous ? `${previous}\n\n${datedNote}` : datedNote,
          });
        }
      }
      await patch(db.appointments, appointment.id, { followUpDone: true });
      toast.success(
        clean
          ? appointment.interestId
            ? 'Im Verlauf des Interessenten gespeichert.'
            : 'Beim Termin gespeichert.'
          : 'Erledigt.',
      );
      onClose();
    } catch {
      toast.error('Das konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={appointment !== null}
      onClose={onClose}
      title="Wie war's?"
      footer={
        <div className="flex gap-2">
          <Button block onClick={onClose}>
            Abbrechen
          </Button>
          <Button block variant="primary" loading={saving} onClick={save}>
            Speichern
          </Button>
        </div>
      }
    >
      {appointment && (
        <Stack>
          <div>
            <p className="font-medium text-text">{appointmentTitle(appointment)}</p>
            <p className="text-[0.85rem] text-text-dim">{formatDateTime(appointment.startAt)}</p>
          </div>

          <EventDateTimeField
            label="Datum des Besuchs"
            value={at}
            onChange={setAt}
            max={todayISO()}
            error={at && !validAt ? 'Bitte einen gültigen Zeitpunkt bis jetzt eintragen.' : undefined}
          />

          <TextArea
            label="Notiz"
            rows={6}
            value={text}
            placeholder="Wie ist der Besuch gelaufen? Was ist besprochen worden?"
            onChange={(e) => setText(e.target.value)}
          />

          <Callout tone="neutral" icon="info">
            {appointment.interestId
              ? `Die Notiz landet im Verlauf von ${interestName ?? 'dem Interessenten'} — mit dem Kanal „Besuch".`
              : 'Zu diesem Termin ist kein Interessent verknüpft. Die Notiz bleibt deshalb beim Termin.'}
          </Callout>

          <p className="px-1 text-[0.82rem] leading-relaxed text-text-faint">
            Ohne Text wird die Frage einfach als erledigt abgehakt. Sie kommt kein zweites Mal.
          </p>
        </Stack>
      )}
    </Sheet>
  );
}
