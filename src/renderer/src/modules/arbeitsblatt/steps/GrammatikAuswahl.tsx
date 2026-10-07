import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  CloseButton,
  Group,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  UnstyledButton
} from '@mantine/core'
import { NurExperte, useAlleOptionen } from '../../../shared/components/NurExperte'
import { useElementSize } from '@mantine/hooks'
import { IconSearch, IconStar, IconStarFilled } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import {
  abweichungsHinweis,
  defaultSequence,
  einfuehrungsNiveau,
  GRAMMAR_TOPICS,
  grammarFormatLabel,
  grammarTopicsFor,
  needsSequence,
  teilformenFuer,
  topicStart,
  ueberNiveau
} from '../didactics/grammar'
import type { GrammarQuery, GrammarTopic } from '../didactics/grammar'
import {
  aufNiveau,
  fruehereBaende,
  grammatikKapitel,
  herkunftKarte,
  inStufe,
  lehrwerkeMitGrammatik,
  liesGemerkt,
  merkeLehrwerk,
  merkeZuletzt,
  mitUnitAuswahl,
  oberBereich,
  schalteFavorit,
  sucheThemen,
  teilZaehler,
  unitEintraege
} from '../didactics/grammatikAuswahl'
import { CEFR_SCALE, type CefrLevel } from '@shared/types'

export interface GrammatikWahl {
  themen: string[]
  teilformen: string[]
}

/**
 * Grammatik-Themenauswahl („Kombination", abgestimmt 06.10.2026; Recherche einstellungen-und-themenauswahl Teil B):
 *  - oben Lehrwerk-Schnellknöpfe („Alles bis Unit N", „Nur Unit N", „Alle anzeigen"),
 *  - Suche deutsch/englisch mit Filtern Lernjahr/Jahrgang und GER, Kacheln der Bereiche bei leerer Suche,
 *  - Master-Detail: links Themen mit Zähler gewählter Teilformen und Stern, rechts die Teilformen mit Status,
 *  - Auswahl immer sichtbar als Chips, Zuletzt benutzt und Favoriten.
 * Genutzt von Arbeitsblatt, Grammatiktest (über GrammarPicker), Klassenarbeit und Grammatiktraining (einzeln = ein Thema).
 * Datenformat unverändert: Themen-Kennungen, Teilformen „thema/teilform", keine Teilform = alle passenden.
 *
 * Standardmodus (07.10.2026): nur Suche, Bereiche und eine Themenliste mit Häkchen – ohne Filter Stufe/GER,
 * Zähler, Sterne, Länder-/Quellenhinweise und ohne die Teilformen-Seite. Ohne gewählte Teilformen gehen ohnehin
 * alle passenden an die KI; eine im Expertenmodus getroffene Einschränkung gilt weiter und steht unter „Alle Optionen".
 */
export default function GrammatikAuswahl({
  query,
  wahl,
  onChange,
  lehrwerk,
  einzeln = false,
  teilformenWaehlbar = true,
  beschreibung
}: {
  query: GrammarQuery
  wahl: GrammatikWahl
  onChange: (w: GrammatikWahl) => void
  /** Lehrwerk der Lerngruppe (knownVocab), sonst wählbar */
  lehrwerk?: { buch?: string; unit?: string }
  /** Nur ein Thema (Grammatiktraining, Klassenarbeit) */
  einzeln?: boolean
  /** false = Teilformen nur zur Orientierung zeigen (Klassenarbeit speichert nur den Themennamen) */
  teilformenWaehlbar?: boolean
  beschreibung?: string
}): React.JSX.Element {
  const fach = query.subjectId
  const { themen, teilformen } = wahl
  const [suche, setSuche] = useState('')
  const [alle, setAlle] = useState(false)
  const [stufe, setStufe] = useState<string | null>(null)
  const [niveauFilter, setNiveauFilter] = useState<string | null>(null)
  const [bereich, setBereich] = useState<string | null>(null)
  const [fokus, setFokus] = useState<string | null>(themen[0] ?? null)
  const [gemerkt, setGemerkt] = useState(liesGemerkt)
  const { ref, width } = useElementSize()
  const schmal = width > 0 && width < 560
  const voll = useAlleOptionen()

  // Lehrwerk: das der Lerngruppe, sonst das zuletzt gewählte (nur Bände mit hinterlegter Unit-Grammatik)
  const baende = useMemo(() => (fach === 'englisch' ? lehrwerkeMitGrammatik() : []), [fach])
  const startBuch =
    lehrwerk?.buch && baende.includes(lehrwerk.buch) ? lehrwerk.buch : gemerkt.lehrwerk && baende.includes(gemerkt.lehrwerk.buch) ? gemerkt.lehrwerk.buch : null
  const [buch, setBuch] = useState<string | null>(startBuch)
  const kapitel = buch ? grammatikKapitel(buch) : []
  const startUnit =
    buch && lehrwerk?.buch === buch && lehrwerk.unit && kapitel.includes(lehrwerk.unit)
      ? lehrwerk.unit
      : gemerkt.lehrwerk?.buch === buch
      ? gemerkt.lehrwerk?.unit
      : undefined
  const [unit, setUnit] = useState<string | null>(startUnit && kapitel.includes(startUnit) ? startUnit : null)
  // Wechselt das Lehrwerk der Lerngruppe (Wortschatz-Auswahl), zieht die Leiste mit
  useEffect(() => {
    if (lehrwerk?.buch && baende.includes(lehrwerk.buch)) {
      setBuch(lehrwerk.buch)
      if (lehrwerk.unit && grammatikKapitel(lehrwerk.buch).includes(lehrwerk.unit)) setUnit(lehrwerk.unit)
    }
  }, [lehrwerk?.buch, lehrwerk?.unit, baende])
  const [mitFrueheren, setMitFrueheren] = useState(false)
  const [unitModus, setUnitModus] = useState<'bis' | 'nur' | null>(null)
  const [unitHinweis, setUnitHinweis] = useState('')
  const frueher = buch ? fruehereBaende(buch) : []
  const herkunft = useMemo(() => (buch ? herkunftKarte(fach, buch, frueher) : new Map<string, string>()), [fach, buch, frueher.join('|')])
  const eintraege = useMemo(
    () => (buch && unit && unitModus ? unitEintraege(fach, buch, unit, unitModus, unitModus === 'bis' && mitFrueheren ? frueher : []) : []),
    [fach, buch, unit, unitModus, mitFrueheren, frueher.join('|')]
  )

  const fachThemen = useMemo(() => GRAMMAR_TOPICS.filter((t) => t.subject === fach), [fach])
  const passend = useMemo(() => grammarTopicsFor(query), [JSON.stringify(query)])
  const passendIds = new Set(passend.map((t) => t.id))
  const nachId = (id: string): GrammarTopic | undefined => fachThemen.find((t) => t.id === id)
  const sequence = query.sequence ?? defaultSequence(fach, query.grade)
  const niveau = needsSequence(fach) && query.cefrLevel ? query.cefrLevel : undefined
  const skala = fachThemen[0]?.scale ?? 'lernjahr'
  const skalaWort = skala === 'erwerbsstufe' ? 'Erwerbsstufe' : skala === 'jahrgang' ? 'Jahrgang' : 'Lernjahr'

  // ---------- Auswahl ändern
  const setze = (neu: GrammatikWahl, dazu?: string): void => {
    onChange(neu)
    if (dazu) setGemerkt((g) => ({ ...g, zuletzt: { ...g.zuletzt, [fach]: merkeZuletzt(fach, dazu) } }))
  }
  const ohneTeile = (id: string): string[] => teilformen.filter((k) => !k.startsWith(`${id}/`))
  const umschalten = (id: string): void => {
    setFokus(id)
    if (themen.includes(id)) return setze({ themen: themen.filter((x) => x !== id), teilformen: ohneTeile(id) })
    if (einzeln) return setze({ themen: [id], teilformen: teilformen.filter((k) => k.startsWith(`${id}/`)) }, id)
    setze({ themen: [...themen, id], teilformen }, id)
  }
  const waehleTeile = (t: GrammarTopic, keys: string[] | null): void => {
    // null = alle passenden (keine Einschränkung); [] = Thema abwählen
    if (keys && !keys.length) return setze({ themen: themen.filter((x) => x !== t.id), teilformen: ohneTeile(t.id) })
    const liste = teilformenFuer(t, query)
    const allePassenden = liste.filter((x) => x.status !== 'spaeter').map((x) => `${t.id}/${x.teil.id}`)
    const gleich = keys && keys.length === allePassenden.length && keys.every((k) => allePassenden.includes(k))
    const basisThemen = einzeln ? [t.id] : themen.includes(t.id) ? themen : [...themen, t.id]
    const basisTeile = einzeln ? [] : ohneTeile(t.id)
    setze({ themen: basisThemen, teilformen: keys && !gleich ? [...basisTeile, ...keys] : basisTeile }, themen.includes(t.id) ? undefined : t.id)
  }
  const unitWahl = (modus: 'bis' | 'nur'): void => {
    if (!buch || !unit) return
    setUnitModus(modus)
    setSuche('')
    setBereich(null)
    const liste = unitEintraege(fach, buch, unit, modus, modus === 'bis' && mitFrueheren ? frueher : [])
    const unsicher = liste.filter((e) => !e.sicher).length
    if (einzeln) {
      setUnitHinweis(`${liste.length} Grammatikangaben aus ${modus === 'bis' ? `${buch} bis ${unit}` : unit} – Thema in der Liste wählen.`)
      return
    }
    const neu = mitUnitAuswahl(liste, themen, teilformen)
    const dazu = neu.themen.length - themen.length
    setUnitHinweis(
      `${dazu ? `${dazu} ${dazu === 1 ? 'Thema' : 'Themen'} übernommen` : 'Nichts Neues übernommen'}${
        unsicher ? ` · ${unsicher} Angabe${unsicher === 1 ? '' : 'n'} nicht sicher zugeordnet – mit „?" markiert, bitte selbst wählen` : ''
      }.`
    )
    if (dazu || neu.teilformen.length !== teilformen.length) setze(neu)
    if (!fokus && neu.themen[0]) setFokus(neu.themen[0])
  }

  // ---------- Was die Liste zeigt
  const suchAktiv = suche.trim().length > 0
  let liste: GrammarTopic[]
  // Unit-Ansicht: Themen der Units (sicher und vorgeschlagen), sonst Katalog
  const unitIds = new Map<string, { kapitel: string; sicher: boolean; phrase: string }>()
  for (const e of eintraege)
    for (const id of e.ids) {
      const alt = unitIds.get(id)
      if (!alt || (!alt.sicher && e.sicher))
        unitIds.set(id, { kapitel: mitFrueheren && e.band !== buch ? `${e.band}, ${e.kapitel}` : e.kapitel, sicher: e.sicher, phrase: e.phrase })
    }
  if (unitModus && eintraege.length) liste = [...unitIds.keys()].map(nachId).filter((t): t is GrammarTopic => Boolean(t))
  else if (suchAktiv) liste = sucheThemen(fachThemen, suche)
  else liste = alle ? fachThemen : passend
  if (stufe) liste = liste.filter((t) => inStufe(t, Number(stufe), query))
  if (niveauFilter) liste = liste.filter((t) => aufNiveau(t, niveauFilter))
  const vorBereich = liste
  if (bereich && !unitModus) liste = liste.filter((t) => oberBereich(t.area) === bereich)
  // Bei der Suche: Passendes vor Unpassendem
  if (suchAktiv && !unitModus) liste = [...liste.filter((t) => passendIds.has(t.id)), ...liste.filter((t) => !passendIds.has(t.id))]

  const gruppen = new Map<string, GrammarTopic[]>()
  for (const t of liste) {
    const g = unitModus && eintraege.length ? unitIds.get(t.id)?.kapitel ?? '' : suchAktiv ? 'Treffer' : t.area
    gruppen.set(g, [...(gruppen.get(g) ?? []), t])
  }
  if (!unitModus && !suchAktiv) for (const l of gruppen.values()) l.sort((a, b) => a.from - b.from || a.label.localeCompare(b.label))
  const nichtZugeordnet = eintraege.filter((e) => !e.ids.length)

  const kacheln = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of vorBereich) m.set(oberBereich(t.area), (m.get(oberBereich(t.area)) ?? 0) + 1)
    return [...m.entries()]
  }, [vorBereich.map((t) => t.id).join('|')])

  const stufen = useMemo(() => {
    const s = new Set<number>()
    for (const t of fachThemen) {
      const lo = t.scale === 'lernjahr' ? topicStart(t, sequence) : t.from
      const hi = t.scale === 'lernjahr' ? topicStart({ ...t, from: t.to, lateStart: undefined }, sequence) : t.to
      for (let i = lo; i <= Math.min(hi, lo + 12); i++) s.add(i)
    }
    return [...s].sort((a, b) => a - b).map(String)
  }, [fachThemen, sequence])
  const niveaus = useMemo(() => CEFR_SCALE.filter((c) => fachThemen.some((t) => einfuehrungsNiveau(t.level) === c)) as string[], [fachThemen])

  const favoriten = (gemerkt.favoriten[fach] ?? []).map(nachId).filter((t): t is GrammarTopic => Boolean(t))
  const zuletzt = (gemerkt.zuletzt[fach] ?? []).map(nachId).filter((t): t is GrammarTopic => Boolean(t))
  const gewaehlt = themen.map(nachId).filter((t): t is GrammarTopic => Boolean(t))
  const zaehler = (t: GrammarTopic) => teilZaehler(t, query, teilformen)
  const teilSumme = gewaehlt.reduce((s, t) => s + zaehler(t).gewaehlt, 0)
  const fokusThema = fokus ? nachId(fokus) : undefined
  const stern = (id: string): void => setGemerkt((g) => ({ ...g, favoriten: { ...g.favoriten, [fach]: schalteFavorit(fach, id) } }))

  return (
    <Stack gap="xs" ref={ref} data-grammatik-auswahl>
      {baende.length > 0 && (
        <Paper withBorder p="xs" radius="sm" data-lehrwerk-leiste>
          <Group gap="xs" align="flex-end" wrap="wrap">
            <Select
              size="xs"
              label="Lehrwerk"
              placeholder="Band wählen"
              data={baende}
              value={buch}
              onChange={(v) => {
                setBuch(v)
                setUnit(null)
                setUnitModus(null)
                setUnitHinweis('')
              }}
              w={150}
              data-lehrwerk-buch
            />
            <Select
              size="xs"
              label="bis Kapitel"
              placeholder="Unit"
              data={kapitel}
              value={unit}
              disabled={!buch}
              onChange={(v) => {
                setUnit(v)
                setUnitModus(null)
                setUnitHinweis('')
                if (buch && v) merkeLehrwerk(buch, v)
              }}
              w={150}
              data-lehrwerk-unit
            />
            <Button size="xs" variant={unitModus === 'bis' ? 'filled' : 'light'} disabled={!unit} onClick={() => unitWahl('bis')} data-unit-bis>
              Alles bis {unit ?? 'Unit …'}
            </Button>
            <Button size="xs" variant={unitModus === 'nur' ? 'filled' : 'light'} disabled={!unit} onClick={() => unitWahl('nur')} data-unit-nur>
              Nur {unit ?? 'Unit …'}
            </Button>
            <Button
              size="xs"
              variant={!unitModus ? 'filled' : 'subtle'}
              onClick={() => {
                setUnitModus(null)
                setUnitHinweis('')
              }}
              data-unit-alle
            >
              Alle anzeigen
            </Button>
            {frueher.length > 0 && (
              <Switch size="xs" label={`mit ${frueher.join(', ')}`} checked={mitFrueheren} onChange={(e) => setMitFrueheren(e.currentTarget.checked)} mb={4} />
            )}
          </Group>
          {unitHinweis && (
            <Text size="xs" c="dimmed" mt={4} data-unit-hinweis>
              {unitHinweis}
            </Text>
          )}
          {!lehrwerk?.buch && !buch && (
            <Text size="xs" c="dimmed" mt={4}>
              Mit Band und Unit wählt die App die Grammatik der Units vor (Green Line). Die Zuordnung ist eine Orientierung – Unsicheres wird nur vorgeschlagen.
            </Text>
          )}
        </Paper>
      )}

      <Group gap="xs" align="flex-end" wrap="wrap">
        <TextInput
          style={{ flex: 1, minWidth: 200 }}
          label="Grammatikthema"
          description={beschreibung}
          placeholder="suchen – deutsch oder englisch (Perfekt, passive, if-Satz …)"
          leftSection={<IconSearch size={14} />}
          value={suche}
          onChange={(e) => {
            setSuche(e.currentTarget.value)
            if (e.currentTarget.value) setUnitModus(null)
          }}
          rightSection={suche ? <CloseButton size="sm" onClick={() => setSuche('')} aria-label="Suche leeren" /> : null}
          data-grammatik-suche
        />
        {voll && (
          <>
            <Select size="sm" w={120} label={skalaWort} placeholder="alle" data={stufen} value={stufe} onChange={setStufe} clearable data-filter-stufe />
            {niveaus.length > 0 && (
              <Select
                size="sm"
                w={100}
                label="GER"
                placeholder="alle"
                data={niveaus}
                value={niveauFilter}
                onChange={setNiveauFilter}
                clearable
                data-filter-ger
              />
            )}
            <Switch label="Alle Themen des Fachs" checked={alle} onChange={(e) => setAlle(e.currentTarget.checked)} mb={8} />
          </>
        )}
      </Group>

      {/* Auswahl immer sichtbar */}
      <Group gap={6} wrap="wrap" data-auswahl-chips>
        <Text size="xs" fw={600} data-auswahl-zaehler>
          {gewaehlt.length
            ? `${gewaehlt.length} ${gewaehlt.length === 1 ? 'Thema' : 'Themen'}${voll ? `, ${teilSumme} Teilform${teilSumme === 1 ? '' : 'en'}` : ''}`
            : 'Noch kein Thema gewählt'}
        </Text>
        {gewaehlt.map((t) => {
          const z = zaehler(t)
          return (
            <Badge
              key={t.id}
              variant={fokus === t.id ? 'filled' : 'light'}
              size="lg"
              radius="sm"
              style={{ textTransform: 'none', cursor: 'pointer' }}
              onClick={() => setFokus(t.id)}
              rightSection={
                <CloseButton
                  size="xs"
                  aria-label={`${t.label} entfernen`}
                  onClick={(e) => {
                    e.stopPropagation()
                    umschalten(t.id)
                  }}
                />
              }
              data-auswahl-chip={t.id}
            >
              {t.label}
              {voll && z.gesamt > 0 ? (z.passend ? ` · ${z.gewaehlt}/${z.passend}` : ' · später') : ''}
            </Badge>
          )
        })}
        {gewaehlt.length > 1 && (
          <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setze({ themen: [], teilformen: [] })}>
            Auswahl leeren
          </Button>
        )}
      </Group>

      {(favoriten.length > 0 || zuletzt.length > 0) && !suchAktiv && (
        <Stack gap={2}>
          {favoriten.length > 0 && <Schnellzeile titel="★ Favoriten" liste={favoriten} themen={themen} waehle={umschalten} />}
          {zuletzt.length > 0 && (
            <Schnellzeile titel="Zuletzt" liste={zuletzt.filter((t) => !favoriten.includes(t)).slice(0, 6)} themen={themen} waehle={umschalten} />
          )}
        </Stack>
      )}

      {!suchAktiv && !unitModus && kacheln.length > 1 && (
        <SimpleGrid cols={{ base: 2, xs: 3, md: schmal ? 3 : 5 }} spacing={6} data-bereich-kacheln>
          {kacheln.map(([b, n]) => (
            <UnstyledButton
              key={b}
              onClick={() => setBereich(bereich === b ? null : b)}
              data-bereich={b}
              style={{
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 6,
                padding: '4px 8px',
                background: bereich === b ? 'var(--mantine-primary-color-light)' : undefined
              }}
            >
              <Text size="xs" fw={600} truncate>
                {b}
              </Text>
              <Text size="10px" c="dimmed">
                {n} {n === 1 ? 'Thema' : 'Themen'}
              </Text>
            </UnstyledButton>
          ))}
        </SimpleGrid>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: schmal || !voll ? '1fr' : 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 8 }}>
        <Paper withBorder radius="sm" p={4}>
          <ScrollArea.Autosize mah={schmal ? 280 : 380} type="auto">
            <Stack gap={0} data-themenliste>
              {[...gruppen.entries()].map(([g, l]) => (
                <div key={g}>
                  <Text size="xs" fw={600} c="dimmed" mt={6} mb={2} px={4}>
                    {g}
                  </Text>
                  {l.map((t) => {
                    const u = unitIds.get(t.id)
                    return (
                      <ThemaZeile
                        key={t.id}
                        t={t}
                        gewaehlt={themen.includes(t.id)}
                        fokus={fokus === t.id}
                        favorit={(gemerkt.favoriten[fach] ?? []).includes(t.id)}
                        zaehler={zaehler(t)}
                        niveau={niveau}
                        abweichung={abweichungsHinweis(t, query)}
                        stateId={query.stateId}
                        ausserhalb={!passendIds.has(t.id) ? `${skalaWort} ${t.stage}` : ''}
                        herkunft={u ? (u.sicher ? '' : `? „${u.phrase}"`) : herkunft.get(t.id) ? `aus ${herkunft.get(t.id)}` : ''}
                        unsicher={Boolean(u && !u.sicher)}
                        umschalten={() => umschalten(t.id)}
                        oeffnen={() => setFokus(t.id)}
                        stern={() => stern(t.id)}
                        einfach={!voll}
                      />
                    )
                  })}
                </div>
              ))}
              {!liste.length && (
                <Text size="xs" c="dimmed" p="sm">
                  Kein Thema gefunden. {stufe || niveauFilter || bereich ? 'Filter lockern oder ' : ''}
                  {!alle && !suchAktiv ? 'mit dem Schalter „Alle Themen des Fachs" die gesamte Liste zeigen.' : ''}
                </Text>
              )}
              {nichtZugeordnet.length > 0 && (
                <Text size="xs" c="dimmed" p={4}>
                  Ohne passendes Katalogthema: {nichtZugeordnet.map((e) => `„${e.phrase}" (${e.kapitel})`).join(', ')}
                </Text>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Paper>
        <NurExperte geaendert={teilformen.length > 0 && 'Teilformen eingeschränkt'}>
          <Paper withBorder radius="sm" p="xs" data-thema-detail>
            <ScrollArea.Autosize mah={schmal ? undefined : 380} type="auto">
              {fokusThema ? (
                <ThemaDetail
                  t={fokusThema}
                  query={query}
                  gewaehlt={themen.includes(fokusThema.id)}
                  teilformen={teilformen}
                  niveau={niveau}
                  skalaWort={skalaWort}
                  sequence={sequence}
                  waehlbar={teilformenWaehlbar}
                  waehleTeile={(keys) => waehleTeile(fokusThema, keys)}
                  umschalten={() => umschalten(fokusThema.id)}
                />
              ) : (
                <Text size="xs" c="dimmed">
                  Thema links anklicken: Hier erscheinen seine Teilformen mit Status für die Lerngruppe (bilden / nur erkennen / später).
                </Text>
              )}
            </ScrollArea.Autosize>
          </Paper>
        </NurExperte>
      </div>
    </Stack>
  )
}

function Schnellzeile({
  titel,
  liste,
  themen,
  waehle
}: {
  titel: string
  liste: GrammarTopic[]
  themen: string[]
  waehle: (id: string) => void
}): React.JSX.Element | null {
  if (!liste.length) return null
  return (
    <Group gap={4} wrap="wrap">
      <Text size="xs" c="dimmed" w={70}>
        {titel}
      </Text>
      {liste.map((t) => (
        <Button
          key={t.id}
          size="compact-xs"
          variant={themen.includes(t.id) ? 'light' : 'default'}
          onClick={() => waehle(t.id)}
          data-schnellwahl={t.id}
          style={{ fontWeight: 400 }}
        >
          {t.label}
        </Button>
      ))}
    </Group>
  )
}

function ThemaZeile({
  t,
  gewaehlt,
  fokus,
  favorit,
  zaehler,
  niveau,
  abweichung,
  stateId,
  ausserhalb,
  herkunft,
  unsicher,
  umschalten,
  oeffnen,
  stern,
  einfach
}: {
  t: GrammarTopic
  gewaehlt: boolean
  fokus: boolean
  favorit: boolean
  zaehler: ReturnType<typeof teilZaehler>
  niveau?: CefrLevel
  abweichung: string
  stateId?: string
  ausserhalb: string
  herkunft: string
  unsicher: boolean
  umschalten: () => void
  oeffnen: () => void
  stern: () => void
  /** Standardmodus: ohne Zähler, Stern und Länder-/Quellenhinweise */
  einfach?: boolean
}): React.JSX.Element {
  const ueber = ueberNiveau(t, niveau)
  return (
    <Group
      gap={6}
      wrap="nowrap"
      px={4}
      py={3}
      onClick={oeffnen}
      data-thema={t.id}
      data-fokus={fokus || undefined}
      style={{ cursor: 'pointer', borderRadius: 4, background: fokus ? 'var(--mantine-primary-color-light)' : undefined }}
    >
      <Checkbox
        size="xs"
        checked={gewaehlt}
        onChange={umschalten}
        onClick={(e) => e.stopPropagation()}
        aria-label={`${t.label} wählen`}
        data-thema-wahl={t.id}
      />
      <Group gap={6} wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
        <Text size="xs" span fw={gewaehlt ? 600 : undefined}>
          {t.label}
        </Text>
        {t.term && t.term !== t.label && (
          <Text size="xs" span c="dimmed" fs="italic" lineClamp={1}>
            {t.term}
          </Text>
        )}
        <Badge size="xs" variant="light" color={ueber ? 'orange' : 'gray'} data-niveau data-ueber-niveau={ueber || undefined}>
          {t.level}
        </Badge>
        {ausserhalb && (
          <Badge size="xs" variant="light" color="blue">
            {ausserhalb}
          </Badge>
        )}
        {herkunft && (
          <Badge size="xs" variant="light" color={unsicher ? 'orange' : 'indigo'} style={{ textTransform: 'none' }} data-herkunft>
            {herkunft}
          </Badge>
        )}
        {t.receptive && (
          <Badge size="xs" variant="light" color="teal" title="Zunächst nur erkennen, nicht selbst bilden">
            nur erkennen
          </Badge>
        )}
        {!einfach && t.contested && (
          <Badge size="xs" variant="light" color="orange" title={`Die Quellen nennen ${t.from} bis ${t.to}.`}>
            Quellen uneins
          </Badge>
        )}
        {!einfach && abweichung && (
          <Badge size="xs" variant="light" color="grape" title={abweichung} data-land-abweichung>
            {stateId}
          </Badge>
        )}
      </Group>
      {!einfach && zaehler.gesamt > 0 && (
        <Text size="xs" c={gewaehlt ? (zaehler.eingeschraenkt ? 'blue' : undefined) : 'dimmed'} style={{ whiteSpace: 'nowrap' }} data-teil-zaehler={t.id}>
          {!zaehler.passend ? 'später' : gewaehlt ? `${zaehler.gewaehlt}/${zaehler.passend}` : `${zaehler.passend} Teilf.`}
        </Text>
      )}
      {!einfach && (
        <ActionIcon
          size="sm"
          variant="subtle"
          color={favorit ? 'yellow' : 'gray'}
          aria-label={favorit ? 'Favorit entfernen' : 'Als Favorit merken'}
          onClick={(e) => {
            e.stopPropagation()
            stern()
          }}
          data-favorit={t.id}
        >
          {favorit ? <IconStarFilled size={14} /> : <IconStar size={14} />}
        </ActionIcon>
      )}
    </Group>
  )
}

const STATUS_FARBE = { bilden: 'blue', erkennen: 'teal', spaeter: 'gray' } as const
const STATUS_NAME = { bilden: 'bilden', erkennen: 'nur erkennen', spaeter: 'später' } as const

/** Rechte Seite: Teilformen mit Status, Knöpfe Alle / Keine / Nur bilden, darunter alles Wissenswerte zum Thema */
function ThemaDetail({
  t,
  query,
  gewaehlt,
  teilformen,
  niveau,
  skalaWort,
  sequence,
  waehlbar,
  waehleTeile,
  umschalten
}: {
  t: GrammarTopic
  query: GrammarQuery
  gewaehlt: boolean
  teilformen: string[]
  niveau?: CefrLevel
  skalaWort: string
  sequence: ReturnType<typeof defaultSequence>
  waehlbar: boolean
  waehleTeile: (keys: string[] | null) => void
  umschalten: () => void
}): React.JSX.Element {
  const liste = teilformenFuer(t, query)
  const key = (id: string): string => `${t.id}/${id}`
  const eigene = teilformen.filter((k) => k.startsWith(`${t.id}/`))
  // Wirksam gewählt: Thema gewählt und (ohne Einschränkung alle passenden, sonst die genannten)
  const drin = (id: string, status: string): boolean => gewaehlt && (eigene.length ? eigene.includes(key(id)) : status !== 'spaeter')
  const wirksam = liste.filter((x) => drin(x.teil.id, x.status)).map((x) => key(x.teil.id))
  const teilUmschalten = (id: string): void => {
    const k = key(id)
    waehleTeile(wirksam.includes(k) ? wirksam.filter((x) => x !== k) : [...wirksam, k])
  }
  const nurBilden = liste.filter((x) => x.status === 'bilden').map((x) => key(x.teil.id))
  const abw = abweichungsHinweis(t, query)
  const ueber = ueberNiveau(t, niveau)
  return (
    <Stack gap={6} data-teilformen={t.id}>
      <Group justify="space-between" gap={6} wrap="wrap">
        <div>
          <Text size="sm" fw={600}>
            {t.label}
          </Text>
          {t.term && t.term !== t.label && (
            <Text size="xs" c="dimmed" fs="italic">
              {t.term}
            </Text>
          )}
        </div>
        {(!liste.length || !waehlbar) && (
          <Button size="compact-xs" variant={gewaehlt ? 'light' : 'filled'} onClick={umschalten}>
            {gewaehlt ? 'Abwählen' : 'Wählen'}
          </Button>
        )}
      </Group>
      {liste.length > 0 && (
        <>
          <Group gap={4} display={waehlbar ? undefined : 'none'}>
            <Text size="xs" c="dimmed">
              Teilformen:
            </Text>
            <Button size="compact-xs" variant="light" onClick={() => waehleTeile(null)} data-teil-alle>
              Alle passenden
            </Button>
            <Button size="compact-xs" variant="light" color="gray" onClick={() => waehleTeile([])} data-teil-keine>
              Keine
            </Button>
            <Button size="compact-xs" variant="light" disabled={!nurBilden.length} onClick={() => waehleTeile(nurBilden)} data-teil-bilden>
              Nur bilden
            </Button>
          </Group>
          <Stack gap={3}>
            {liste.map(({ teil, status, hinweis }) => (
              <Checkbox
                key={teil.id}
                size="xs"
                checked={waehlbar ? drin(teil.id, status) : status !== 'spaeter'}
                disabled={!waehlbar}
                onChange={() => teilUmschalten(teil.id)}
                data-teilform={teil.id}
                label={
                  <Group gap={6} wrap="wrap">
                    <Text size="xs" span c={status === 'spaeter' ? 'dimmed' : undefined}>
                      {teil.label}
                    </Text>
                    {teil.term && (
                      <Text size="xs" span c="dimmed" fs="italic">
                        {teil.term}
                      </Text>
                    )}
                    <Badge size="xs" variant="light" color={STATUS_FARBE[status]} title={hinweis}>
                      {STATUS_NAME[status]}
                    </Badge>
                    {(teil.erkennen || teil.bilden) && (
                      <Text size="10px" span c="dimmed">
                        {[teil.erkennen && `erk. ${teil.erkennen}`, teil.bilden && `bild. ${teil.bilden}`, teil.sicher && `sicher ${teil.sicher}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    )}
                    {teil.beispiele?.[0] && (
                      <Text size="10px" span c="dimmed">
                        „{teil.beispiele[0]}“
                      </Text>
                    )}
                  </Group>
                }
              />
            ))}
          </Stack>
          <Text size="10px" c="dimmed">
            {waehlbar
              ? 'Ohne Einschränkung gehen alle passenden Teilformen an die KI; „nur erkennen“ nur in Auswahl- und Fehleraufgaben, „später“ gar nicht.'
              : 'Teilformen zur Orientierung: Status für diese Lerngruppe.'}
          </Text>
        </>
      )}
      {t.description && <Text size="xs">{t.description}</Text>}
      {t.examples && t.examples.length > 0 && (
        <Text size="xs">
          <b>Beispiele:</b> {t.examples.join(' · ')}
        </Text>
      )}
      {t.errors && (
        <Text size="xs">
          <b>Typische Fehler:</b> {t.errors}
        </Text>
      )}
      {t.formats.length > 0 && (
        <Text size="xs">
          <b>Passende Übungsformate:</b> {t.formats.map(grammarFormatLabel).join(' · ')}
        </Text>
      )}
      {(t.erkennen || t.bilden || t.sicher) && (
        <Text size="xs">
          <b>GER:</b> {[t.erkennen && `erkennen ${t.erkennen}`, t.bilden && `bilden ${t.bilden}`, t.sicher && `sicher ${t.sicher}`].filter(Boolean).join(' · ')}
        </Text>
      )}
      {t.source && (
        <Text size="xs" c="dimmed">
          Einordnung: {t.source}
        </Text>
      )}
      {t.contested && (
        <Text size="xs" c="orange">
          Die ausgewerteten Lehrpläne und Lehrwerke setzen dieses Thema zwischen {skalaWort} {topicStart(t, sequence)} und {t.to} an – bitte prüfen, ob es zur
          Lerngruppe passt.
        </Text>
      )}
      {ueber && (
        <Text size="xs" c="orange">
          Eingeführt auf {t.level} – deutlich über dem gewählten Niveau {niveau}. Bitte prüfen, ob es zur Lerngruppe passt.
        </Text>
      )}
      {t.receptive && (
        <Text size="xs" c="teal">
          Auf dieser Stufe zunächst nur erkennen, nicht selbst bilden – das Material sollte keine Produktionsaufgabe dazu enthalten.
        </Text>
      )}
      {abw && (
        <Alert color="grape" p={6}>
          <Text size="xs">Abweichung im Lehrplan: {abw}</Text>
        </Alert>
      )}
    </Stack>
  )
}
