/**
 * Vorwissen der Lerngruppe in der Oberfläche (13.10.2026, abgestimmt mit der Lehrkraft; Server: server/vorwissen.ts,
 * Zusammenfassung: shared/vorwissenLerngruppe.ts).
 *
 *  - `ladeVorwissen`: Jahrgang, Lehrwerk, bekannte Wörter und Vorwissen (als Text) einer eigenen Lerngruppe.
 *  - `feldMitVorwissen`: den Text ins Feld „Vorwissen der Lerngruppe" setzen – ein früher übernommener Text wird ersetzt,
 *    Eigenes der Lehrkraft bleibt stehen.
 *  - `LerngruppeWahl`: „Für Lerngruppe (optional)" im ersten Schritt von Arbeitsblatt und Unterrichtsreihe – nur mit dem
 *    Schul-Apps-Server; offline (Exe ohne Server) erscheint nichts und alles bleibt wie bisher.
 */
import { Loader, Select, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import type { LerngruppeBezug, VorwissenAntwort } from '@shared/vorwissenLerngruppe'
import { fachAusName } from '@shared/faecher'
import type { KnownVocab } from './knownVocab'
import { STRICT_UP_TO_GRADE } from './knownVocab'
import { aufServer } from './plattform'
import { holen } from '../modules/onlinetest/serverApi'
import { notifyError } from './util'

export type { LerngruppeBezug, VorwissenAntwort }

export const ladeVorwissen = (gruppeId: string): Promise<VorwissenAntwort> =>
  holen<VorwissenAntwort>(`/server/vorwissen?gruppe=${encodeURIComponent(gruppeId)}`)

/** Text ins Feld: leer oder unverändert übernommen → ersetzen; sonst den alten Block ersetzen bzw. anhängen */
export function feldMitVorwissen(feld: string, alt: string | undefined, neu: string): string {
  const f = (feld ?? '').trim()
  const n = neu.trim()
  if (!f) return n
  if (alt?.trim() && f === alt.trim()) return n
  if (alt?.trim() && f.includes(alt.trim())) return f.replace(alt.trim(), n).trim()
  if (!n || f.includes(n)) return f
  return `${f}\n\n${n}`
}

/** Bekannter Wortschatz aus den Kursen der Lerngruppe (für Sprachfächer) */
export function knownVocabAus(a: VorwissenAntwort, grade: number): KnownVocab | undefined {
  if (!a.woerter.length) return undefined
  const stand = a.lehrwerk?.buch ? `${a.lehrwerk.buch}${a.lehrwerk.unit ? ` bis ${a.lehrwerk.unit}` : ''}` : ''
  return {
    words: a.woerter,
    total: a.wortZahl,
    strict: grade <= STRICT_UP_TO_GRADE,
    source: `Kurs ${a.gruppe.name}${stand ? ` (${stand})` : ''}`,
    ...(a.lehrwerk?.buch ? { buch: a.lehrwerk.buch } : {}),
    ...(a.lehrwerk?.unit ? { unit: a.lehrwerk.unit } : {})
  }
}

interface GruppeKurz {
  id: string
  name: string
  fach: string
  ausgeblendet?: number
}

/**
 * „Für Lerngruppe (optional)": eigene Lerngruppen (passendes Fach zuerst). Beim Wählen lädt sie das Vorwissen und gibt es
 * zurück; „Keine" (leeren) gibt null.
 */
export function LerngruppeWahl({
  wert,
  fachId,
  onWahl
}: {
  wert?: LerngruppeBezug | null
  fachId?: string
  onWahl: (g: LerngruppeBezug | null, a: VorwissenAntwort | null) => void
}): React.JSX.Element | null {
  const [gruppen, setGruppen] = useState<GruppeKurz[] | null>(null)
  const [laedt, setLaedt] = useState(false)
  useEffect(() => {
    if (!aufServer()) return
    holen<{ gruppen: GruppeKurz[] }>('/server/lerngruppen').then(
      (d) => setGruppen(d.gruppen.filter((g) => !g.ausgeblendet)),
      () => setGruppen([])
    )
  }, [])
  if (!aufServer() || !gruppen?.length) return null
  const passt = (g: GruppeKurz): boolean => Boolean(fachId && fachAusName(g.fach)?.id === fachId)
  const liste = [...gruppen].sort((a, b) => Number(passt(b)) - Number(passt(a)) || a.name.localeCompare(b.name, 'de', { numeric: true }))
  const waehlen = async (id: string | null): Promise<void> => {
    if (!id) return onWahl(null, null)
    const g = gruppen.find((x) => x.id === id)
    if (!g) return
    setLaedt(true)
    try {
      onWahl({ id: g.id, name: g.name }, await ladeVorwissen(g.id))
    } catch (e) {
      notifyError(e, 'Vorwissen nicht geladen')
    } finally {
      setLaedt(false)
    }
  }
  return (
    <div data-lerngruppe-wahl>
      <Select
        label="Für Lerngruppe (optional)"
        description="Füllt Jahrgang, Lehrwerk und Vorwissen aus dem, was die Schul-Apps über diese Lernenden wissen – alles bleibt änderbar."
        placeholder="Keine"
        clearable
        searchable
        data={liste.map((g) => ({ value: g.id, label: g.fach ? `${g.name} – ${g.fach}` : g.name }))}
        value={wert?.id ?? null}
        onChange={(v) => void waehlen(v)}
        rightSection={laedt ? <Loader size={14} /> : undefined}
        comboboxProps={{ withinPortal: true }}
        data-lerngruppe-select
      />
      {wert && !laedt && (
        <Text size="xs" c="dimmed" mt={4} data-lerngruppe-uebernommen>
          Vorwissen von {wert.name} übernommen – im Feld „Vorwissen der Lerngruppe“ prüfen und anpassen.
        </Text>
      )}
    </div>
  )
}
