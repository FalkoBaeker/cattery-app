/**
 * Blatt für die Stammdaten eines Kittens.
 * Der Verkaufsstatus wirkt sofort auf den Fahrplan — siehe Hinweis im Blatt.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Callout,
  MoneyInput,
  NumberInput,
  Select,
  Sheet,
  TextArea,
  TextInput,
  useToast,
} from '../../ui';
import { KITTEN_SALE_STATUS_LABEL } from '../../types';
import type {
  CollarColorKey,
  ID,
  Interest,
  Kitten,
  KittenSaleStatus,
  Litter,
  Settings,
  SexOrUnknown,
} from '../../types';
import { db, patch } from '../../db/db';
import { syncLitterSchedule } from '../../domain/schedule';
import { addKitten, linkInterest, noonOf, revokeKittenDeath, syncBirthWeightEntry } from './data';
import { isLivingKitten, suggestCollarColor } from './litter';
import { CollarPicker, SexPicker } from './parts';

/** „Verstorben" wird über den eigenen, behutsamen Vorgang gesetzt. */
const SALE_OPTIONS = (Object.keys(KITTEN_SALE_STATUS_LABEL) as KittenSaleStatus[])
  .filter((s) => s !== 'deceased')
  .map((s) => ({ value: s, label: KITTEN_SALE_STATUS_LABEL[s] }));

export function KittenEditorSheet({
  open,
  onClose,
  litter,
  kitten,
  siblings,
  interests,
  settings,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Darf beim Bearbeiten fehlen — ein Kitten bleibt auch ohne (noch)
   * vorhandenen Wurf bearbeitbar („Alles ist optional"). Zum Anlegen eines
   * neuen Kittens ist der Wurf nötig.
   */
  litter?: Litter;
  kitten?: Kitten;
  siblings: Kitten[];
  interests: Interest[];
  settings: Settings;
  onSaved?: (kittenId: ID) => void;
}) {
  const toast = useToast();

  const usedColors = useMemo(
    () => siblings.filter((k) => k.id !== kitten?.id).map((k) => k.collarColor),
    [siblings, kitten?.id],
  );

  /** Interessenten im Papierkorb gehören in keine Auswahl mehr. */
  const selectableInterests = useMemo(
    () => interests.filter((i) => !i.deletedAt || i.id === kitten?.interestId),
    [interests, kitten?.interestId],
  );

  const [collar, setCollar] = useState<CollarColorKey>('red');
  const [callName, setCallName] = useState('');
  const [sex, setSex] = useState<SexOrUnknown>('unknown');
  const [birthWeightG, setBirthWeightG] = useState<number | null>(null);
  const [chipNo, setChipNo] = useState('');
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [saleStatus, setSaleStatus] = useState<KittenSaleStatus>('available');
  const [interestId, setInterestId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const deathMarked = Boolean(kitten && !isLivingKitten(kitten));

  // Nur beim Öffnen füllen, damit Schreibvorgänge im Hintergrund kein
  // halb ausgefülltes Formular zurücksetzen.
  const filled = useRef(false);
  useEffect(() => {
    if (!open) {
      filled.current = false;
      return;
    }
    if (filled.current) return;
    filled.current = true;
    setCollar(kitten?.collarColor ?? suggestCollarColor(usedColors));
    setCallName(kitten?.callName ?? '');
    setSex(kitten?.sex ?? 'unknown');
    setBirthWeightG(kitten?.birthWeightG ?? null);
    setChipNo(kitten?.chipNo ?? '');
    setPriceCents(kitten?.priceCents ?? settings.defaultKittenPriceCents ?? null);
    setSaleStatus(deathMarked ? 'available' : (kitten?.saleStatus ?? 'available'));
    setInterestId(kitten?.interestId ?? '');
    setNotes(kitten?.notes ?? '');
  }, [open, kitten, usedColors, settings.defaultKittenPriceCents, deathMarked]);

  const statusChangesSchedule =
    kitten != null &&
    kitten.saleStatus !== saleStatus &&
    (saleStatus === 'sold_breeding_reserved' || kitten.saleStatus === 'sold_breeding_reserved');

  async function save() {
    setSaving(true);
    try {
      if (kitten) {
        const statusBefore = kitten.saleStatus;
        await patch(db.kittens, kitten.id, {
          collarColor: collar,
          callName: callName.trim() || undefined,
          sex,
          birthWeightG: birthWeightG ?? undefined,
          chipNo: chipNo.trim() || undefined,
          priceCents: priceCents ?? undefined,
          saleStatus: deathMarked ? statusBefore : saleStatus,
          notes: notes.trim() || undefined,
        });
        await linkInterest(kitten, interestId || undefined);
        // Die aus dem Geburtsgewicht erzeugte Wiegung mitziehen, sonst
        // widersprechen sich Kopfzeile und Gewichtskurve.
        await syncBirthWeightEntry(kitten, birthWeightG ?? undefined);
        await syncLitterSchedule(kitten.litterId, settings);

        if (!deathMarked && statusBefore !== saleStatus) {
          if (saleStatus === 'sold_breeding_reserved') {
            toast.show('Zuchtvorbehalt vermerkt — die Kastration steht nicht mehr im Fahrplan.', {
              tone: 'warn',
              durationMs: 6000,
            });
          } else if (statusBefore === 'sold_breeding_reserved') {
            toast.show('Zuchtvorbehalt aufgehoben — die Kastration steht wieder im Fahrplan.', {
              durationMs: 6000,
            });
          } else {
            toast.success('Kitten gespeichert');
          }
        } else {
          toast.success('Kitten gespeichert');
        }
        onSaved?.(kitten.id);
      } else {
        if (!litter) {
          // Sollte nicht vorkommen: Anlegen geht nur aus einem Wurf heraus.
          toast.error('Zum Anlegen eines Kittens fehlt der Wurf.');
          return;
        }
        const created = await addKitten(
          {
            litterId: litter.id,
            collarColor: collar,
            callName,
            sex,
            birthWeightG: birthWeightG ?? undefined,
            bornAt: litter.birthDate ? noonOf(litter.birthDate) : undefined,
            saleStatus,
            notes,
          },
          settings,
        );
        if (interestId) await linkInterest(created, interestId);
        toast.success('Kitten angelegt');
        onSaved?.(created.id);
      }
      onClose();
    } catch (e) {
      toast.error('Speichern fehlgeschlagen. Bitte noch einmal versuchen.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function revive() {
    if (!kitten) return;
    setSaving(true);
    try {
      await revokeKittenDeath(kitten, settings);
      toast.show('Vermerk aufgehoben');
      onClose();
    } catch (e) {
      toast.error('Der Vermerk konnte nicht aufgehoben werden. Bitte noch einmal versuchen.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title={kitten ? 'Kitten bearbeiten' : 'Kitten hinzufügen'}
      action={
        <Button variant="ghost" size="sm" onClick={save} loading={saving}>
          Sichern
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <CollarPicker value={collar} onChange={setCollar} used={usedColors} />

        <TextInput
          label="Rufname"
          value={callName}
          onChange={(e) => setCallName(e.target.value)}
          placeholder="kommt oft erst später"
          hint="Solange kein Rufname da ist, zählt die Halsbandfarbe."
        />

        <SexPicker value={sex} onChange={setSex} />

        <NumberInput
          label="Geburtsgewicht"
          suffix="g"
          value={birthWeightG}
          onValueChange={setBirthWeightG}
          placeholder="z. B. 95"
        />

        <TextInput
          label="Chipnummer"
          value={chipNo}
          onChange={(e) => setChipNo(e.target.value)}
          inputMode="numeric"
        />

        <MoneyInput label="Preis" valueCents={priceCents} onValueChange={setPriceCents} />

        {deathMarked ? (
          <Callout tone="neutral" icon="info" title="Als verstorben vermerkt">
            <p>Der Verkaufsstatus lässt sich deshalb hier nicht ändern.</p>
            <Button className="mt-2" size="sm" loading={saving} onClick={revive}>
              Vermerk aufheben
            </Button>
          </Callout>
        ) : (
          <Select
            label="Verkaufsstatus"
            value={saleStatus}
            onChange={(e) => setSaleStatus(e.target.value as KittenSaleStatus)}
            options={SALE_OPTIONS}
          />
        )}

        {statusChangesSchedule && (
          <Callout tone="warn" icon="alert" title="Das ändert den Fahrplan">
            <p>
              {saleStatus === 'sold_breeding_reserved'
                ? 'Bei Abgabe mit Zuchtnutzungsvorbehalt entfällt die Kastration — der Vertrag untersagt sie ausdrücklich. Der Punkt verschwindet nach dem Sichern aus dem Fahrplan.'
                : 'Ohne Zuchtvorbehalt gehört die Kastration wieder in den Fahrplan. Sie wird nach dem Sichern neu eingeplant.'}
            </p>
          </Callout>
        )}

        <Select
          label="Interessent"
          placeholder="keiner"
          value={interestId}
          onChange={(e) => setInterestId(e.target.value)}
          options={selectableInterests.map((i) => ({
            value: i.id,
            label: i.deletedAt ? `${i.name} (im Papierkorb)` : i.name,
          }))}
        />

        <TextArea label="Notizen" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  );
}
