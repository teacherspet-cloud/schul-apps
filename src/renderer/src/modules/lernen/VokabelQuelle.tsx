/**
 * Vokabeln für die Lern-App wählen (03.10.2026): aus einem Lehrwerk (Band › Unit › Abschnitt, mit den
 * Beispielsätzen des Buchs) oder aus einer eigenen Liste der App „Vokabelliste". Für konkrete englische
 * Wörter sucht sie passende OpenMoji-Symbole (ohne Kosten, nur bei eindeutigem Treffer).
 * Genutzt von „Zum Lernen freigeben" und vom Reihen-Schritt „Vokabeln".
 */
import { useAppSettings } from '../../shared/settingsStore'
import HaeufigSelect from '../../shared/components/HaeufigSelect'
import { eigeneWerte } from '../../shared/haeufig'
import { Group, Loader, MultiSelect, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import type { Textbook, TextbookMeta } from '@shared/types'
import type { Vokabel } from '@shared/vokabeltrainer'
import { kernform } from '@shared/vokabeltrainer'
import { notifyError } from '../../shared/util'

export interface VokabelAuswahl {
  titel: string
  sprache: string
  fach: string
  woerter: Vokabel[]
  /** Herkunft aus dem Lehrwerk – für den Vokabelweg der Lernenden (03.10.2026) */
  quelle?: { lehrwerk: string; unit: string; abschnitte: string[] }
}

const FACH_ZU: Record<string, string> = {
  en: 'Englisch',
  fr: 'Französisch',
  es: 'Spanisch',
  it: 'Italienisch',
  la: 'Latein',
  ru: 'Russisch',
  nl: 'Niederländisch',
  pt: 'Portugiesisch',
  tr: 'Türkisch',
  zh: 'Chinesisch',
  pl: 'Polnisch',
  cs: 'Tschechisch',
  // Kurzname = Fachkennung „daz" – so passt der Abgleich mit den eigenen Fächern
  de: 'DaZ'
}

/** Passendes OpenMoji für ein konkretes englisches Wort (nur eindeutige Treffer) */
async function bildFuer(term: string): Promise<string | undefined> {
  const kern = kernform(term).toLowerCase()
  if (!kern || kern.includes(' ') || kern.length < 3) return undefined
  try {
    const treffer = await window.api.images.searchOpenMoji(kern)
    const t = treffer.find((h) => h.annotation.toLowerCase() === kern || h.tags.toLowerCase().split(/,\s*/).includes(kern))
    if (!t) return undefined
    const svg = await window.api.images.openMojiSvg(t.hexcode)
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
  } catch {
    return undefined
  }
}

/** Bilder für die Wörter einer Auswahl ergänzen (Englisch) – nacheinander, höchstens 80 */
export async function mitBildern(a: VokabelAuswahl): Promise<VokabelAuswahl> {
  if (a.sprache !== 'en') return a
  const woerter: Vokabel[] = []
  for (const [i, v] of a.woerter.entries()) {
    const bild = i < 80 && !v.bild ? await bildFuer(v.term) : undefined
    woerter.push(bild ? { ...v, bild } : v)
  }
  return { ...a, woerter }
}

export function VokabelQuelle({ wahl }: { wahl: (a: VokabelAuswahl | null) => void }): React.JSX.Element {
  const [art, setArt] = useState<'buch' | 'liste'>('buch')
  const [buecher, setBuecher] = useState<TextbookMeta[]>([])
  /*
   * Fach → Lehrwerk → Band (06.10.2026, Wunsch der Lehrkraft): erst die Fremdsprache (nur, wenn in den Einstellungen
   * mehr als eine hinterlegt ist), dann die Reihe (Green Line), dann der Band (Green Line 1).
   */
  const eigeneFaecher = useAppSettings((x) => x.settings.eigeneFaecher)
  const [sprache, setSprache] = useState<string | null>(null)
  const [reihe, setReihe] = useState<string | null>(null)
  const [bandId, setBandId] = useState<string | null>(null)
  const [buch, setBuch] = useState<Textbook | null>(null)
  const [unit, setUnit] = useState<string | null>(null)
  const [abschnitte, setAbschnitte] = useState<string[]>([])
  const [listen, setListen] = useState<
    { id: string; name: string; language?: string; source?: string; entries: { term: string; translation: string; pos?: string; note?: string }[] }[]
  >([])
  const [liste, setListe] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void window.api.textbooks.list().then(
      (l) => setBuecher(l),
      () => setBuecher([])
    )
    void window.api.library.list().then(setListen, () => setListen([]))
  }, [])
  // Fremdsprachen der Lehrkraft, für die es Lehrwerke gibt (ohne Angabe: alle mit Lehrwerk)
  const vorhanden = [...new Set(buecher.map((b) => b.language))]
  // Seit 07.10.2026 alle Sprachen wählbar – die eigenen stehen im Fachfeld oben (im Standardmodus nur sie, weitere per Eintippen)
  const eigene = eigeneWerte(
    eigeneFaecher ?? [],
    vorhanden.map((code) => ({ value: code, label: FACH_ZU[code] ?? code }))
  )
  const sprachen = vorhanden.sort((a, b) => (FACH_ZU[a] ?? a).localeCompare(FACH_ZU[b] ?? b, 'de'))
  const vorschlag = sprachen.length === 1 ? sprachen[0] : eigene.length === 1 ? eigene[0] : null
  const spracheJetzt = sprache && sprachen.includes(sprache) ? sprache : vorschlag
  const reiheVon = (b: TextbookMeta): string => b.reihe || b.name.replace(/\s*\d+\s*$/, '') || b.name
  const reihen = [...new Set(buecher.filter((b) => b.language === spracheJetzt).map(reiheVon))].sort((a, b) => a.localeCompare(b, 'de'))
  const baende = buecher
    .filter((b) => b.language === spracheJetzt && reiheVon(b) === reihe)
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
  const mehrereAusgaben = new Set(baende.map((b) => b.ausgabe ?? '')).size > 1
  const bandWaehlen = (id: string | null): void => {
    setBandId(id)
    setUnit(null)
    setAbschnitte([])
    if (!id) return setBuch(null)
    setLaeuft(true)
    void window.api.textbooks
      .get(id)
      .then(setBuch, (e: unknown) => notifyError(e))
      .finally(() => setLaeuft(false))
  }
  const units = buch?.units ?? []
  const sections = useMemo(() => units.find((u) => u.name === unit)?.sections ?? [], [units, unit])

  // Auswahl melden
  useEffect(() => {
    if (art === 'buch') {
      if (!buch || !unit || !abschnitte.length) return wahl(null)
      const woerter: Vokabel[] = sections
        .filter((s) => abschnitte.includes(s.name))
        .flatMap((s, si) =>
          s.entries
            .filter((e) => !e.explained && e.term && e.translation)
            .map((e, i) => ({
              id: `b${si}-${i}`,
              term: e.term,
              translation: e.translation,
              ...(e.example ? { example: e.example } : {}),
              ...(e.exampleTranslation ? { exampleTranslation: e.exampleTranslation } : {}),
              ...(e.pos ? { pos: e.pos } : {}),
              ...(e.note ? { note: e.note } : {})
            }))
        )
      wahl({
        titel: [buch.name, unit, abschnitte.join(', ')].join(' - '),
        sprache: buch.language,
        fach: FACH_ZU[buch.language] ?? buch.language,
        woerter,
        quelle: { lehrwerk: buch.id, unit, abschnitte }
      })
    } else {
      const l = listen.find((x) => x.id === liste)
      if (!l) return wahl(null)
      wahl({
        titel: l.source || l.name,
        sprache: l.language ?? 'en',
        fach: FACH_ZU[l.language ?? 'en'] ?? '',
        woerter: l.entries
          .filter((e) => e.term && e.translation)
          .map((e, i) => ({ id: `l${i}`, term: e.term, translation: e.translation, ...(e.pos ? { pos: e.pos } : {}), ...(e.note ? { note: e.note } : {}) }))
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art, buch, unit, abschnitte, liste, sections])

  return (
    <Stack gap="xs" data-vokabel-quelle>
      <SegmentedControl
        value={art}
        onChange={(v) => setArt(v as 'buch' | 'liste')}
        data={[
          { value: 'buch', label: 'Aus dem Lehrwerk' },
          { value: 'liste', label: 'Eigene Liste' }
        ]}
      />
      {art === 'buch' ? (
        <>
          {sprachen.length > 1 && (
            <HaeufigSelect
              art="fach"
              label="Fach"
              data={sprachen.map((c) => ({ value: c, label: FACH_ZU[c] ?? c }))}
              value={spracheJetzt}
              onChange={(c) => {
                setSprache(c)
                setReihe(null)
                bandWaehlen(null)
              }}
              placeholder="Fremdsprache wählen …"
              data-vokabel-fach
            />
          )}
          <Group grow align="end">
            <Select
              label="Lehrwerk"
              searchable
              data={reihen}
              value={reihe}
              onChange={(x) => {
                setReihe(x)
                bandWaehlen(null)
              }}
              disabled={!spracheJetzt}
              placeholder={spracheJetzt ? 'z. B. Green Line' : 'zuerst das Fach'}
              data-vokabel-buch
            />
            <Select
              label="Band"
              data={baende.map((b) => ({ value: b.id, label: mehrereAusgaben && b.ausgabe ? `${b.name} (${b.ausgabe})` : b.name }))}
              value={bandId}
              onChange={bandWaehlen}
              disabled={!reihe}
              placeholder="z. B. Green Line 1"
              data-vokabel-band
            />
          </Group>
          <Group grow align="end">
            <Select
              label="Unit"
              data={units.map((u) => u.name)}
              value={unit}
              onChange={(u) => (setUnit(u), setAbschnitte([]))}
              disabled={!buch}
              data-vokabel-unit
            />
          </Group>
          {laeuft && <Loader size="sm" />}
          {unit && (
            <MultiSelect
              label="Abschnitte"
              data={sections.map((s) => ({ value: s.name, label: `${s.name} (${s.entries.length})` }))}
              value={abschnitte}
              onChange={setAbschnitte}
              placeholder="z. B. Station 1"
              data-vokabel-abschnitte
            />
          )}
        </>
      ) : (
        <Select
          label="Vokabelliste"
          searchable
          data={listen.map((l) => ({ value: l.id, label: l.source ? `${l.name} (${l.source})` : l.name }))}
          value={liste}
          onChange={setListe}
          placeholder={listen.length ? 'wählen …' : 'noch keine Liste in der App „Vokabelliste"'}
        />
      )}
      <Text size="xs" c="dimmed">
        Beispielsätze aus dem Lehrwerk werden übernommen; zu greifbaren englischen Wörtern sucht die App passende Symbole.
      </Text>
    </Stack>
  )
}
