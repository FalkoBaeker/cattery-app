import { useEffect, useState } from 'react';
import { Button, Callout, Sheet, Stack, TextArea, useToast } from '../../ui';
import { db, insertPlain, patch } from '../../db/db';
import { nowISO, formatDateTime } from '../../lib/date';
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

  useEffect(() => {
    if (appointment) setText('');
  }, [appointment]);

  async function save() {
    if (!appointment) return;
    const clean = text.trim();
    setSaving(true);
    try {
      if (clean) {
        if (appointment.interestId) {
          await insertPlain(db.interestNotes, {
            interestId: appointment.interestId,
            at: nowISO(),
            channel: 'visit',
            text: clean,
          });
        } else {
          const previous = appointment.note?.trim();
          await patch(db.appointments, appointment.id, {
            note: previous ? `${previous}\n\n${clean}` : clean,
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
