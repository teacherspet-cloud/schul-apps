/**
 * „Jetzt freischalten" oder „Planen …" (09.10.2026, abgestimmt mit der Lehrkraft; Regeln in shared/freigabePlan.ts):
 * in jedem Freigabe-Dialog – Vokabeln, Grammatik, Arbeitsblatt, Tafelbild, Schreibaufgabe, Unterrichtsreihe.
 *  - Nur Datum und Uhrzeit (kein Stundenplan); Vorgabe: nächster Schultag 7:30.
 *  - Optional ein Ende („bis") für Material ohne eigenes Fristfeld – danach können die Lernenden nur noch ansehen.
 *  - Vokabeln mit mehreren Abschnitten: „nacheinander freischalten" – je Abschnitt ein Datum, vorbelegt im gewählten
 *    Abstand und einzeln verschiebbar; der Testtermin kann am letzten Abschnitt hängen.
 * Bis zum Zeitpunkt sehen die Lernenden nur einen grauen Hinweis „Demnächst" im Fachordner.
 */
import { Badge, Group, NumberInput, SegmentedControl, Stack, Switch, Text, TextInput } from '@mantine/core'
import { IconClock } from '@tabler/icons-react'
import { abschnittsTermine, kurzDatum, naechsterSchultag, testterminNach } from '@shared/freigabePlan'

/** Kurzangabe „geplant ab Mo., 13.10., 07:30" (leer, wenn nichts mehr aussteht) */
export const geplantText = (ab: number | null | undefined): string => (ab && ab > Date.now() ? `geplant ab ${kurzDatum(ab)}, ${zeitFeld(new Date(ab))}` : '')

/** Uhr „geplant ab …" in den Listen der Lehrkraft (Kurs-Abschnitte, Blätter, Reihen, Grammatik) */
export function GeplantMarke({ ab }: { ab: number | null | undefined }): React.JSX.Element | null {
  if (!ab || ab <= Date.now()) return null
  return (
    <Badge size="sm" variant="light" color="gray" tt="none" leftSection={<IconClock size={12} />} data-geplant-ab={ab}>
      geplant ab {kurzDatum(ab)}, {zeitFeld(new Date(ab))}
    </Badge>
  )
}

/** Ereignis nach jeder (geplanten) Freigabe – „Geplant" in „Meine Klassen" lädt neu */
export const PLAN_GEAENDERT = 'sa-plan-geaendert'
export const planGeaendert = (): void => void window.dispatchEvent(new Event(PLAN_GEAENDERT))

const zweistellig = (n: number): string => String(n).padStart(2, '0')
export const datumFeld = (d: Date): string => `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`
export const zeitFeld = (d: Date): string => `${zweistellig(d.getHours())}:${zweistellig(d.getMinutes())}`
/** „2026-10-12" + „07:30" → ms (Ortszeit); leer/ungültig → null */
export const ausFeldern = (datum: string, zeit: string): number | null => {
  if (!datum) return null
  const t = new Date(`${datum}T${zeit || '07:30'}:00`).getTime()
  return Number.isFinite(t) ? t : null
}
/** datetime-local ↔ ms */
const lokalFeld = (ms: number): string => `${datumFeld(new Date(ms))}T${zeitFeld(new Date(ms))}`
const ausLokal = (v: string): number | null => {
  const t = v ? new Date(v).getTime() : NaN
  return Number.isFinite(t) ? t : null
}

export interface PlanWahl {
  modus: 'jetzt' | 'planen'
  datum: string
  zeit: string
  /** Ende (optional) */
  bisDatum: string
  bisZeit: string
  /** Vokabeln: Abschnitte nacheinander */
  nacheinander: boolean
  abstand: number
  /** datetime-local je Abschnitt (nur mit `nacheinander`) */
  termine: string[]
  /** Testtermin am letzten Abschnitt */
  testKoppeln: boolean
}

export function planStart(): PlanWahl {
  const d = naechsterSchultag()
  return { modus: 'jetzt', datum: datumFeld(d), zeit: zeitFeld(d), bisDatum: '', bisZeit: '23:59', nacheinander: false, abstand: 7, termine: [], testKoppeln: false }
}

/** Beginn der Planung (ms) oder null bei „jetzt" */
export const planAb = (w: PlanWahl): number | null => (w.modus === 'planen' ? ausFeldern(w.datum, w.zeit) : null)
export const planBis = (w: PlanWahl): number | null => (w.bisDatum ? ausFeldern(w.bisDatum, w.bisZeit || '23:59') : null)
export const istGeplantWahl = (w: PlanWahl): boolean => (planAb(w) ?? 0) > Date.now()

/** Termine je Abschnitt aus Beginn und Abstand (neu vorbelegt) */
export function termineVorbelegen(w: PlanWahl, anzahl: number): string[] {
  const ab = ausFeldern(w.datum, w.zeit) ?? naechsterSchultag().getTime()
  return abschnittsTermine(ab, anzahl, w.abstand).map(lokalFeld)
}

/**
 * Anfragekörper `plan` (Server: freigabePlan.ts planAus). `mitEnde`: das Ende gehört in die Planung (Material ohne eigenes
 * Fristfeld). `abschnitte`: Zahl der neuen Vokabelabschnitte (für „nacheinander").
 */
export function planKoerper(w: PlanWahl, o: { mitEnde?: boolean; abschnitte?: number } = {}): { plan?: Record<string, unknown> } {
  const plan: Record<string, unknown> = {}
  if (w.modus === 'planen') {
    if (w.nacheinander && (o.abschnitte ?? 0) > 1) {
      const termine = (w.termine.length === o.abschnitte ? w.termine : termineVorbelegen(w, o.abschnitte!)).map(ausLokal)
      plan.teile = termine
    } else plan.ab = planAb(w)
    if (w.testKoppeln) plan.testAbstand = w.abstand
  }
  if (o.mitEnde && planBis(w)) plan.bis = planBis(w)
  return Object.keys(plan).length ? { plan } : {}
}

/** Testtermin, wenn er am letzten Abschnitt hängt (zur Anzeige) */
export function gekoppelterTest(w: PlanWahl, abschnitte: number): number | null {
  if (w.modus !== 'planen' || !w.testKoppeln) return null
  const termine = w.nacheinander && abschnitte > 1 ? (w.termine.length === abschnitte ? w.termine.map(ausLokal) : termineVorbelegen(w, abschnitte).map(ausLokal)) : [planAb(w)]
  const letzter = termine[termine.length - 1]
  return letzter ? testterminNach(letzter, w.abstand) : null
}

/** Beschriftung des Freigabe-Knopfs */
export const planKnopf = (w: PlanWahl, sonst: string): string => (w.modus === 'planen' ? 'Planen' : sonst)

/** Erfolgsmeldung nach einer geplanten Freigabe */
export function planMeldung(w: PlanWahl, was = 'Freigabe'): string {
  const ab = planAb(w)
  return ab ? `${was} geplant ab ${kurzDatum(ab)}, ${zeitFeld(new Date(ab))} Uhr – bis dahin sehen die Lernenden nur „Demnächst“ im Fachordner.` : ''
}

export default function FreigabePlanen({
  wert,
  aendern,
  mitEnde = false,
  endeText = 'Danach lässt sich das Material nur noch ansehen.',
  abschnitte,
  mitTest = false
}: {
  wert: PlanWahl
  aendern: (w: PlanWahl) => void
  /** Feld „bis" (für Material ohne eigenes Fristfeld) */
  mitEnde?: boolean
  endeText?: string
  /** Vokabeln: Titel der neuen Abschnitte – ab zwei gibt es „nacheinander freischalten" */
  abschnitte?: string[]
  /** Vokabeln: Testtermin an den letzten Abschnitt koppeln */
  mitTest?: boolean
}): React.JSX.Element {
  const setze = (p: Partial<PlanWahl>): void => {
    const neu = { ...wert, ...p }
    // Beginn oder Abstand geändert: Termine je Abschnitt neu vorbelegen
    if (abschnitte && neu.nacheinander && ('datum' in p || 'zeit' in p || 'abstand' in p || 'nacheinander' in p))
      neu.termine = termineVorbelegen(neu, abschnitte.length)
    aendern(neu)
  }
  const n = abschnitte?.length ?? 0
  const test = gekoppelterTest(wert, n)
  return (
    <Stack gap="xs" data-freigabe-planen>
      <SegmentedControl
        value={wert.modus}
        onChange={(v) => setze({ modus: v as PlanWahl['modus'] })}
        data={[
          { value: 'jetzt', label: 'Jetzt freischalten' },
          { value: 'planen', label: 'Planen …' }
        ]}
        data-plan-modus
      />
      {wert.modus === 'planen' && (
        <>
          <Group align="flex-end" gap="xs">
            <TextInput
              type="date"
              label={wert.nacheinander && n > 1 ? 'Erster Abschnitt ab' : 'Freischalten ab'}
              value={wert.datum}
              onChange={(e) => setze({ datum: e.currentTarget.value })}
              leftSection={<IconClock size={14} />}
              data-plan-datum
            />
            <TextInput type="time" label="Uhrzeit" value={wert.zeit} onChange={(e) => setze({ zeit: e.currentTarget.value })} w={120} data-plan-zeit />
          </Group>
          <Text size="xs" c="dimmed">
            Bis dahin sehen die Lernenden nur einen grauen Hinweis „Demnächst“ im Fachordner – ohne Inhalt. Verschieben, früher freischalten oder absagen
            geht in „Meine Klassen“ unter „Geplant“.
          </Text>
          {n > 1 && (
            <Switch
              label="Abschnitte nacheinander freischalten"
              description="Je Abschnitt ein eigenes Datum – vorbelegt im gewählten Abstand, jedes einzeln verschiebbar."
              checked={wert.nacheinander}
              onChange={(e) => setze({ nacheinander: e.currentTarget.checked })}
              data-plan-nacheinander
            />
          )}
          {(n > 1 && wert.nacheinander) || mitTest ? (
            <NumberInput
              label={n > 1 && wert.nacheinander ? 'Abstand (Tage)' : 'Test nach (Tagen)'}
              min={1}
              max={60}
              value={wert.abstand}
              onChange={(v) => setze({ abstand: Math.max(1, Math.min(60, Number(v) || 7)) })}
              w={160}
              data-plan-abstand
            />
          ) : null}
          {n > 1 && wert.nacheinander && (
            <Stack gap={4} data-plan-termine>
              {abschnitte!.map((titel, i) => (
                <Group key={i} gap="xs" wrap="nowrap">
                  <Text size="sm" style={{ flex: 1 }} lineClamp={1}>
                    {titel}
                  </Text>
                  <TextInput
                    type="datetime-local"
                    size="xs"
                    value={wert.termine[i] ?? ''}
                    onChange={(e) => {
                      const termine = wert.termine.length === n ? [...wert.termine] : termineVorbelegen(wert, n)
                      termine[i] = e.currentTarget.value
                      aendern({ ...wert, termine })
                    }}
                    data-plan-termin={i}
                  />
                </Group>
              ))}
            </Stack>
          )}
          {mitTest && (
            <Switch
              label={n > 1 ? 'Testtermin an den letzten Abschnitt koppeln' : 'Testtermin an die Freischaltung koppeln'}
              description={
                test
                  ? `Testtermin: ${kurzDatum(test)}, 8:00 Uhr – rückt mit, wenn der Abschnitt verschoben wird.`
                  : 'Der Test liegt dann den gewählten Abstand nach der Freischaltung.'
              }
              checked={wert.testKoppeln}
              onChange={(e) => setze({ testKoppeln: e.currentTarget.checked })}
              data-plan-test
            />
          )}
        </>
      )}
      {mitEnde && (
        <Group align="flex-end" gap="xs">
          <TextInput
            type="date"
            label="Bis (optional)"
            description={endeText}
            value={wert.bisDatum}
            onChange={(e) => setze({ bisDatum: e.currentTarget.value })}
            data-plan-bis
          />
          {wert.bisDatum && <TextInput type="time" label="Uhrzeit" value={wert.bisZeit} onChange={(e) => setze({ bisZeit: e.currentTarget.value })} w={120} />}
        </Group>
      )}
    </Stack>
  )
}
