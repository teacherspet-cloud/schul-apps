/**
 * „Verlauf der Bewertung" (23.10.2026, Prüfung des Schulträgers, Punkt 8 – menschliche Aufsicht über KI-Bewertungen):
 * kleiner Dialog für die Lehrkraft. Zeigt je Person und Test bzw. Schritt, was die KI vorgeschlagen hat und was daraus
 * wurde (bestätigt, geändert, selbst entschieden) – mit Zeitpunkt. Daten: src/server/bewertungSpur.ts.
 */
import { Badge, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import { IconHistory } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { holen } from '../../modules/onlinetest/serverApi'

export interface VerlaufEintrag {
  id: string
  art: 'onlinetest' | 'abschluss' | 'mitarbeit'
  quelle: 'ki' | 'lehrkraft' | 'bestaetigt' | 'geaendert'
  zeit: number
  kiVorschlag?: unknown
  entscheidung?: unknown
}

const QUELLE: Record<VerlaufEintrag['quelle'], { text: string; farbe: string }> = {
  ki: { text: 'KI-Vorschlag', farbe: 'violet' },
  bestaetigt: { text: 'von der Lehrkraft bestätigt', farbe: 'green' },
  geaendert: { text: 'von der Lehrkraft geändert', farbe: 'orange' },
  lehrkraft: { text: 'von der Lehrkraft entschieden', farbe: 'blue' }
}

type Urteil = { status?: string; punkte?: number; pruefen?: string; knapp?: boolean; frage?: boolean }

const urteilText = (u: Urteil): string => {
  const was =
    u.status === 'richtig' ? (u.knapp ? 'knapp richtig' : 'richtig') : u.frage ? 'zu allgemein' : u.pruefen ? `falsch (zu entscheiden: ${u.pruefen})` : 'falsch'
  return `${was}, ${u.punkte ?? 0} P.`
}

/** Kurzfassung eines Vorschlags bzw. einer Entscheidung – je Art */
export function verlaufText(art: VerlaufEintrag['art'], wert: unknown, einheitName: (id: string) => string = (id) => id): string {
  if (!wert || typeof wert !== 'object') return ''
  const w = wert as Record<string, unknown>
  if (w.einheiten && typeof w.einheiten === 'object') {
    const liste = Object.entries(w.einheiten as Record<string, Urteil>).map(([k, u]) => `${einheitName(k)}: ${urteilText(u)}`)
    return `${w.alle ? 'alle bestätigt – ' : ''}${liste.join(' · ')}`
  }
  if (art === 'abschluss' && Array.isArray(w.kriterien)) {
    const k = w.kriterien as { kriterium: string; punkte: number; max: number; einschaetzung: string }[]
    const p = k.reduce((s, x) => s + (Number(x.punkte) || 0), 0)
    const m = k.reduce((s, x) => s + (Number(x.max) || 0), 0)
    return `${p} von ${m} Punkten · ${k.map((x) => `${x.kriterium}: ${x.einschaetzung}`).join(' · ')}`
  }
  if (typeof w.geschafft === 'boolean') return `${w.geschafft ? 'geschafft' : 'noch nicht geschafft'}${typeof w.text === 'string' && w.text ? ` – ${w.text.slice(0, 200)}` : ''}`
  if (typeof w.note === 'string') return `Mitarbeit ${w.note}${typeof w.begruendung === 'string' && w.begruendung ? ` – ${w.begruendung.slice(0, 200)}` : ''}`
  return ''
}

/** Knopf + Dialog. `pfad`: Server-Pfad, der `{ eintraege }` liefert (Onlinetest: /server/onlinetest/<id>/spur?teilnahme=…) */
export function BewertungsVerlauf({ pfad, einheitName }: { pfad: string; einheitName?: (id: string) => string }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [liste, setListe] = useState<VerlaufEintrag[] | null>(null)
  const [fehler, setFehler] = useState('')
  useEffect(() => {
    if (!offen) return
    setListe(null)
    setFehler('')
    void holen<{ eintraege: VerlaufEintrag[] }>(pfad).then(
      (d) => setListe(d.eintraege ?? []),
      (e: unknown) => setFehler(e instanceof Error ? e.message : String(e))
    )
  }, [offen, pfad])
  return (
    <>
      <Button size="xs" variant="subtle" leftSection={<IconHistory size={14} />} onClick={() => setOffen(true)} data-bewertung-verlauf>
        Verlauf der Bewertung
      </Button>
      {offen && (
        <Modal opened onClose={() => setOffen(false)} title="Verlauf der Bewertung" size="lg">
          <Stack gap="xs" data-verlauf-liste>
            <Text size="xs" c="dimmed">
              Was die KI vorgeschlagen hat und was die Lehrkraft daraus gemacht hat. Wird mit dem Konto der Person gelöscht.
            </Text>
            {fehler && (
              <Text size="sm" c="red">
                {fehler}
              </Text>
            )}
            {!liste && !fehler && <Loader size="sm" />}
            {liste?.length === 0 && (
              <Text size="sm" c="dimmed">
                Noch keine Einträge.
              </Text>
            )}
            {liste?.map((e) => {
              const vorschlag = verlaufText(e.art, e.kiVorschlag, einheitName)
              const entscheidung = verlaufText(e.art, e.entscheidung, einheitName)
              return (
                <Stack key={e.id} gap={2} data-verlauf-eintrag={e.quelle}>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">
                      {new Date(e.zeit).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                    </Text>
                    <Badge size="xs" variant="light" color={QUELLE[e.quelle]?.farbe ?? 'gray'}>
                      {QUELLE[e.quelle]?.text ?? e.quelle}
                    </Badge>
                  </Group>
                  {vorschlag && (
                    <Text size="sm">
                      <b>KI:</b> {vorschlag}
                    </Text>
                  )}
                  {entscheidung && e.quelle !== 'ki' && (
                    <Text size="sm">
                      <b>Entscheidung:</b> {entscheidung}
                    </Text>
                  )}
                </Stack>
              )
            })}
          </Stack>
        </Modal>
      )}
    </>
  )
}
