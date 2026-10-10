/**
 * „Materialien" am Telefon (10.10.2026, Entscheidung der Lehrkraft „Option 1"; Befunde der Analyse mit Bildschirmfotos).
 *
 * Vorher stand am Telefon derselbe Baum wie am PC: Jahrgangs-Chips, „Auswählen", aufklappbare Fächer und Ordner mit
 * gekürzten Namen („G…"), Ablageziele zum Ziehen, Zauberstäbe – auf 390 Punkten Breite kaum zu lesen und zu treffen.
 * Jetzt eine eigene Ansicht NUR am Telefon (PC und iPad behalten den Baum, shell/Themenuebersicht.tsx):
 *
 *  - Oben: Suche (Titel, Thema, Unit, Fach), Fach-Chips in EINER waagerecht rollenden Zeile (eigene Fächer + „Alle";
 *    ohne eigene Fächer alle Fächer mit Material), „Zuletzt" (5, wählbar wie auf der Startseite).
 *  - „Themen – <Fach>": je Thema eine Zeile mit Ordner, vollem Namen (bis zwei Zeilen), Zahl und Pfeil. Antippen öffnet
 *    eine Ebene je Bildschirm mit „‹ <Fach>" zurück (Lehrwerk: Band › Unit). Die Zurück-Geste des Browsers bzw. von
 *    Android geht ebenfalls eine Ebene hoch (Eintrag im Verlauf je Ebene).
 *  - Im Thema: Art-Chips nur für vorhandene Arten, Zeilen mit App-Bild, Titel (bricht um), „Arbeitsblatt · Kl. 9"
 *    (ohne das Fach – es steht oben), ⋯ nur mit Öffnen, Verschieben nach …, Für Fachschaft freigeben, Löschen;
 *    „▸ Unterthemen (n)", am Ende „▸ Von der Fachschaft (n)"; unten fest „+ Neu in diesem Thema".
 *  - Kein Ziehen, keine Mehrfachauswahl, keine „Ablegen in"-Chips, kein Zauberstab „automatisch einsortiert".
 *  - Doppelte Themen (frei getipptes „Green Line 2 Unit 1" neben der Lehrwerks-Unit): Inhalt erscheint IN der Unit
 *    (shared/materialienMobil.ts). Vokabellisten mit passender Quelle („Green Line 2 – Unit 3") stehen in ihrer Unit.
 *  - Material, das FÜR eine Unterrichtsreihe entstanden ist, bleibt ausgeblendet (Regel vom 10.10.2026).
 */
import { ActionIcon, Badge, Button, Collapse, Group, Menu, Modal, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconDots, IconFolder, IconFolderOpen, IconFolderShare, IconPlus, IconSearch, IconShare, IconTrash, IconUsers, IconX } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { kinderVon, materialSchluessel, nachfahrenVon, type Themenbereich } from '@shared/themen'
import {
  doppelteEinheiten,
  einheitenNachSchluessel,
  einheitSchluessel,
  einheitZuText,
  materialSuche,
  ohneReiheErzeugtes,
  pfadText,
  typChips,
  typVon,
  untertitel,
  type MaterialTyp
} from '@shared/materialienMobil'
import { modules } from '../../modules/registry'
import { fachAnzeige, ladeMaterialien, neueste, type Material } from '../../shell/materialien'
import { useSichtbareProgramme } from '../../shell/programme'
import { AnzahlWahl, useStartAnzahl } from '../../shell/StartAnzahl'
import { useAppSettings } from '../settingsStore'
import { useReiheZuordnung } from '../reiheZuordnung'
import { abgleichen, ladeThemen, neuImBereich, useThemen, zuordnungVergessen } from '../themenbereiche'
import { chronologisch, zeitpunktVon } from '../themenChronologie'
import { neuAnlegen, openDocument } from '../navigation'
import { setzeFachVorgabe } from '../fachVorgabe'
import { useMenueFokus } from '../menueFokus'
import { notifyError } from '../util'
import { fachIdVon } from '../fachfarben'
import { FachOrdnerSymbol } from './FachFarbe'
import { freigabeOeffnen, freigebbar, fuerFachschaftFreigeben, useFachschaftEintraege, useFreigegeben, type Freigabe } from './Fachordner'
import { VerschiebenDialog } from './Themenbereiche'

/** Einzahl je App – die Namen der Leiste stehen in der Mehrzahl („Arbeitsblätter") */
const EINZAHL: Record<string, string> = {
  arbeitsblatt: 'Arbeitsblatt',
  vokabeltest: 'Vokabeltest',
  grammatiktest: 'Grammatiktest',
  lernzielkontrolle: 'Lernzielkontrolle',
  klassenarbeit: 'Klassenarbeit',
  tafelbild: 'Tafelbild',
  vokabelliste: 'Vokabelliste',
  elternbrief: 'Elternbrief'
}
/** Apps, in denen „+ Neu in diesem Thema" anlegt (wie die übergreifende Seite; Vokabellisten sind Bestand) */
const NEU_APPS = ['arbeitsblatt', 'vokabeltest', 'grammatiktest', 'lernzielkontrolle', 'klassenarbeit', 'tafelbild']

const FACH_KEY = 'schul-apps-materialien-fach'
const lies = (): string | null => {
  try {
    return localStorage.getItem(FACH_KEY)
  } catch {
    return null
  }
}
const merke = (v: string): void => {
  try {
    localStorage.setItem(FACH_KEY, v)
  } catch {
    // ohne Speicher gilt die Wahl, solange die Seite steht
  }
}

const modul = (id: string): (typeof modules)[number] | undefined => modules.find((m) => m.id === id)
const anzahlText = (n: number): string => (n === 1 ? '1 Material' : `${n} Materialien`)
const OHNE = 'ohne'

export default function MaterialienMobil(): React.JSX.Element {
  const daten = useThemen((s) => s.daten)
  const [roh, setRoh] = useState<Material[] | null>(null)
  const [neuLaden, setNeuLaden] = useState(0)
  const reiheZuordnung = useReiheZuordnung((z) => z.zuordnung)
  const reiheEinblenden = useReiheZuordnung((z) => z.einblenden)
  const eigeneFaecher = useAppSettings((s) => s.settings.eigeneFaecher)
  const sichtbareProgramme = useSichtbareProgramme()
  const fachschaft = useFachschaftEintraege()
  const [suche, setSuche] = useState('')
  const [fachWahl, setFachWahl] = useState<string | null>(lies)
  /** Ebenen unter dem Fach: Kennungen der Bereiche (OHNE = „Ohne Thema"); Fach dazu, weil „Alle" mehrere zeigt */
  const [ebene, setEbene] = useState<{ fachId: string; pfad: string[] } | null>(null)
  const [typ, setTyp] = useState<MaterialTyp | 'alle'>('alle')
  const [verschieben, setVerschieben] = useState<string[] | null>(null)
  const [loeschen, setLoeschen] = useState<Material | null>(null)
  const [nZuletzt, setNZuletzt] = useStartAnzahl('materialien-zuletzt')

  useEffect(() => {
    let weg = false
    void ladeThemen().catch(notifyError)
    void useReiheZuordnung.getState().laden()
    void ladeMaterialien().then((liste) => {
      if (weg) return
      setRoh(liste)
      // Wie die übrigen Ansichten: Neues einsortieren, Verwaistes wegräumen
      void abgleichen(liste.filter((m) => m.moduleId !== 'vokabelliste'))
    })
    return () => {
      weg = true
    }
  }, [neuLaden])

  const alle = useMemo(() => ohneReiheErzeugtes(roh ?? [], reiheZuordnung, reiheEinblenden), [roh, reiheZuordnung, reiheEinblenden])

  // ---------- Bereiche, doppelte Units ----------
  const doppelt = useMemo(() => doppelteEinheiten(daten.bereiche), [daten.bereiche])
  const units = useMemo(() => einheitenNachSchluessel(daten.bereiche), [daten.bereiche])
  const nachId = useMemo(() => new Map(daten.bereiche.map((b) => [b.id, b])), [daten.bereiche])
  /** Bereich eines Materials – der doppelte Ordner zählt als seine Unit; Vokabellisten über ihre Quelle */
  const bereichIdVon = (m: Material): string | null => {
    if (m.moduleId === 'vokabelliste') return einheitZuText(daten.bereiche, m.fachId, m.thema || m.name, units)?.id ?? null
    const id = daten.zuordnungen[materialSchluessel(m.moduleId, m.id)]?.bereichId ?? null
    if (!id || !nachId.has(id)) return null
    return doppelt.get(id) ?? id
  }
  const fachVon = (m: Material): string => {
    const id = bereichIdVon(m)
    return (id ? nachId.get(id)?.fachId : undefined) ?? m.fachId
  }
  const jahrgaengeIn = (id: string): number[] => {
    const ids = new Set([id, ...nachfahrenVon(daten, id)])
    return alle.filter((m) => m.grade && ids.has(bereichIdVon(m) ?? '')).map((m) => m.grade!)
  }
  const kinder = (fachId: string, elternId: string | null): Themenbereich[] =>
    chronologisch(
      kinderVon(daten, fachId, elternId).filter((b) => !doppelt.has(b.id)),
      (b) => zeitpunktVon(b, daten.bereiche, {}, jahrgaengeIn)
    )
  const direkt = (fachId: string, id: string): Material[] =>
    alle.filter((m) => (id === OHNE ? !bereichIdVon(m) && fachVon(m) === fachId : bereichIdVon(m) === id))
  const gesamt = (fachId: string, id: string): number =>
    id === OHNE ? direkt(fachId, OHNE).length : [id, ...nachfahrenVon(daten, id)].reduce((n, x) => n + direkt(fachId, x).length, 0)

  // ---------- Fächer ----------
  const mitMaterial = useMemo(() => {
    const set = new Set(alle.map(fachVon))
    for (const b of daten.bereiche) set.add(b.fachId)
    return [...set].sort((a, b) => fachAnzeige(a).localeCompare(fachAnzeige(b), 'de'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alle, daten])
  const eigene = useMemo(() => (eigeneFaecher ?? []).map((f) => fachIdVon(f) ?? f), [eigeneFaecher])
  const chips = eigene.length ? eigene : mitMaterial
  const fach = fachWahl === 'alle' ? 'alle' : fachWahl && chips.includes(fachWahl) ? fachWahl : (chips.find((f) => mitMaterial.includes(f)) ?? chips[0] ?? 'alle')
  const faecherSicht = fach === 'alle' ? mitMaterial : [fach]
  const waehleFach = (f: string): void => {
    setFachWahl(f)
    merke(f)
    setEbene(null)
  }

  // ---------- Ebenen im Verlauf des Browsers ----------
  useEffect(() => {
    const zurueck = (ev: PopStateEvent): void => {
      const tiefe = Number((ev.state as { materialienTiefe?: number } | null)?.materialienTiefe ?? 0)
      setEbene((e) => (!e || tiefe >= e.pfad.length ? e : tiefe === 0 ? null : { ...e, pfad: e.pfad.slice(0, tiefe) }))
      setTyp('alle')
    }
    window.addEventListener('popstate', zurueck)
    return () => window.removeEventListener('popstate', zurueck)
  }, [])
  const hinein = (fachId: string, id: string): void => {
    const pfad = ebene && ebene.fachId === fachId ? [...ebene.pfad, id] : [id]
    try {
      window.history.pushState({ ...(window.history.state ?? {}), materialienTiefe: pfad.length }, '', window.location.href)
    } catch {
      // ohne Verlauf (eingebettet): nur der Knopf „‹" führt zurück
    }
    setEbene({ fachId, pfad })
    setTyp('alle')
    document.querySelector('[data-materialien-mobil]')?.scrollTo({ top: 0 })
  }
  const hoch = (): void => {
    const st = window.history.state as { materialienTiefe?: number } | null
    if (st?.materialienTiefe) window.history.back()
    else setEbene((e) => (!e || e.pfad.length <= 1 ? null : { ...e, pfad: e.pfad.slice(0, -1) }))
  }

  // ---------- Zeilen ----------
  const themaZeile = (fachId: string, b: Themenbereich | null): React.JSX.Element => {
    const id = b?.id ?? OHNE
    const n = gesamt(fachId, id)
    return (
      <UnstyledButton key={id} className="mm-zeile" onClick={() => hinein(fachId, id)} data-mm-thema={b?.name ?? 'Ohne Thema'} aria-label={`${b?.name ?? 'Ohne Thema'} öffnen, ${anzahlText(n)}`}>
        <Group gap="sm" wrap="nowrap" align="center">
          {b ? <FachOrdnerSymbol fach={fachId} groesse={26} /> : <IconFolder size={26} color="var(--mantine-color-dimmed)" style={{ flex: 'none' }} />}
          <Text fw={600} size="md" lineClamp={2} style={{ flex: 1, minWidth: 0 }}>
            {b?.name ?? 'Ohne Thema'}
          </Text>
          <Text size="sm" c="dimmed" style={{ flex: 'none' }}>
            {n}
          </Text>
          <IconChevronRight size={18} style={{ flex: 'none', opacity: 0.6 }} />
        </Group>
      </UnstyledButton>
    )
  }

  const materialZeile = (m: Material): React.JSX.Element => (
    <MaterialZeile
      key={`${m.moduleId}:${m.id}`}
      m={m}
      onVerschieben={m.moduleId === 'vokabelliste' ? undefined : () => setVerschieben([materialSchluessel(m.moduleId, m.id)])}
      onLoeschen={() => setLoeschen(m)}
    />
  )

  const fachschaftIn = (fachId: string, b: Themenbereich | null): Freigabe[] => {
    const imFach = (fachschaft ?? []).filter((f) => !f.eigen && (fachIdVon(f.fach) ?? f.fach) === fachId)
    if (!b) return imFach
    // Im Thema: Freigaben, deren Thema den Namen trägt (auch als Lehrwerks-Unit „Green Line 2 Unit 1")
    const pfad = pfadText(daten.bereiche, b)
    const name = b.name.toLocaleLowerCase('de')
    return imFach.filter((f) => {
      const t = (f.thema ?? '').toLocaleLowerCase('de')
      if (!t) return false
      if (t === name || t.split('›').pop()!.trim() === name) return true
      const unit = einheitZuText(daten.bereiche, fachId, f.thema, units)
      return !!unit && (unit.id === b.id || pfad === pfadText(daten.bereiche, unit))
    })
  }

  // ---------- Suche ----------
  const treffer = useMemo(
    () =>
      materialSuche(alle, suche, (m) => {
        const id = bereichIdVon(m)
        const b = id ? nachId.get(id) : undefined
        return `${b ? pfadText(daten.bereiche, b) : ''} ${fachAnzeige(fachVon(m))}`
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alle, suche, daten]
  )

  const geladen = roh !== null
  const offenesFach = ebene?.fachId ?? null
  const offenId = ebene?.pfad[ebene.pfad.length - 1] ?? null
  const offen = offenId && offenId !== OHNE ? (nachId.get(offenId) ?? null) : null
  // Gelöschter Bereich: zurück zur Übersicht
  useEffect(() => {
    if (offenId && offenId !== OHNE && useThemen.getState().geladen && !nachId.has(offenId)) setEbene(null)
  }, [offenId, nachId])

  return (
    <div className="mm-seite" data-materialien-mobil>
      {ebene && offenesFach ? (
        <ThemaEbene
          fachId={offenesFach}
          bereich={offen}
          zurueckText={ebene.pfad.length > 1 ? (nachId.get(ebene.pfad[ebene.pfad.length - 2])?.name ?? fachAnzeige(offenesFach)) : fachAnzeige(offenesFach)}
          onZurueck={hoch}
          materialien={direkt(offenesFach, offenId ?? OHNE)}
          unterthemen={offen ? kinder(offenesFach, offen.id) : []}
          themaZeile={(b) => themaZeile(offenesFach, b)}
          materialZeile={materialZeile}
          fachschaft={fachschaftIn(offenesFach, offen)}
          typ={typ}
          setTyp={setTyp}
          neuApps={sichtbareProgramme.filter((p) => NEU_APPS.includes(p.id))}
        />
      ) : (
        <Stack gap="md" p="md" pb={40}>
          <Title order={2}>Materialien</Title>
          <TextInput
            value={suche}
            onChange={(e) => setSuche(e.currentTarget.value)}
            placeholder="Suchen: Titel, Thema, Unit, Fach"
            aria-label="Materialien durchsuchen"
            leftSection={<IconSearch size={18} />}
            rightSection={
              suche ? (
                <ActionIcon variant="subtle" color="gray" aria-label="Suche leeren" onClick={() => setSuche('')}>
                  <IconX size={16} />
                </ActionIcon>
              ) : undefined
            }
            size="md"
            data-mm-suche
          />
          {suche.trim() ? (
            <Stack gap={6} data-mm-treffer={treffer.length}>
              <Text size="sm" c="dimmed">
                {treffer.length ? `${anzahlText(treffer.length)} gefunden` : 'Nichts gefunden.'}
              </Text>
              {treffer.map(materialZeile)}
            </Stack>
          ) : (
            <>
              {chips.length > 0 && (
                <div className="mm-chips" role="tablist" aria-label="Fach" data-mm-faecher>
                  {[...chips, 'alle'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={fach === f}
                      className="mm-chip"
                      data-aktiv={fach === f}
                      data-mm-fach={f}
                      onClick={() => waehleFach(f)}
                    >
                      {f === 'alle' ? 'Alle' : fachAnzeige(f)}
                    </button>
                  ))}
                </div>
              )}
              {geladen && (
                <Zuletzt
                  liste={neueste(
                    alle.filter((m) => fach === 'alle' || fachVon(m) === fach),
                    nZuletzt || Infinity
                  )}
                  materialZeile={materialZeile}
                  wahl={<AnzahlWahl karte="materialien-zuletzt" wert={nZuletzt} setzen={setNZuletzt} />}
                />
              )}
              {!geladen && <Text c="dimmed">Lädt …</Text>}
              {geladen &&
                faecherSicht.map((f) => {
                  const oben = kinder(f, null)
                  const lose = direkt(f, OHNE).length
                  const fs = fachschaftIn(f, null)
                  return (
                    <Stack key={f} gap={6} data-mm-themen={f}>
                      <Text fw={700} size="lg" mt="xs">
                        Themen – {fachAnzeige(f)}
                      </Text>
                      {!oben.length && !lose && <Text c="dimmed">Noch keine Materialien in diesem Fach.</Text>}
                      {oben.map((b) => themaZeile(f, b))}
                      {lose > 0 && themaZeile(f, null)}
                      {fs.length > 0 && <FachschaftAbschnitt liste={fs} />}
                    </Stack>
                  )
                })}
            </>
          )}
        </Stack>
      )}
      <VerschiebenDialog
        schluessel={verschieben}
        materialien={alle}
        fachVon={fachVon}
        onClose={() => setVerschieben(null)}
        onFertig={() => undefined}
      />
      <LoeschenFrage m={loeschen} onClose={() => setLoeschen(null)} onFertig={() => setNeuLaden((n) => n + 1)} />
    </div>
  )
}

/** „Zuletzt" – die zuletzt bearbeiteten des Fachs, Anzahl wählbar (wie die Startseite) */
function Zuletzt({ liste, materialZeile, wahl }: { liste: Material[]; materialZeile: (m: Material) => React.JSX.Element; wahl: React.ReactNode }): React.JSX.Element | null {
  if (!liste.length) return null
  return (
    <Stack gap={6} data-mm-zuletzt>
      <Group gap={6}>
        <Text fw={700} size="lg">
          Zuletzt
        </Text>
        {wahl}
      </Group>
      {liste.map(materialZeile)}
    </Stack>
  )
}

/** Eine Ebene: ein Thema mit seinen Materialien, Unterthemen und Freigaben der Fachschaft */
function ThemaEbene(p: {
  fachId: string
  bereich: Themenbereich | null
  zurueckText: string
  onZurueck: () => void
  materialien: Material[]
  unterthemen: Themenbereich[]
  themaZeile: (b: Themenbereich) => React.JSX.Element
  materialZeile: (m: Material) => React.JSX.Element
  fachschaft: Freigabe[]
  typ: MaterialTyp | 'alle'
  setTyp: (t: MaterialTyp | 'alle') => void
  neuApps: { id: string; name: string }[]
}): React.JSX.Element {
  const chips = typChips(p.materialien.map((m) => m.moduleId))
  const typ = chips.some((c) => c.typ === p.typ) ? p.typ : 'alle'
  const gezeigt = [...p.materialien]
    .filter((m) => typ === 'alle' || typVon(m.moduleId) === typ)
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))
  // Ohne eigenes Material oder bei einem Lehrwerks-Band (Units darunter): die Unterthemen gleich offen
  const lehrwerk = !!p.bereich && (p.bereich.herkunft === 'lehrwerk' || p.unterthemen.some((u) => einheitSchluessel(`${p.bereich!.name} ${u.name}`)))
  const [unterOffen, setUnterOffen] = useState(!p.materialien.length || lehrwerk)
  useEffect(() => setUnterOffen(!p.materialien.length || lehrwerk), [p.bereich?.id])
  const neu = async (modulId: string): Promise<void> => {
    if (!p.bereich) return
    try {
      setzeFachVorgabe(modulId, p.bereich.fachId)
      const id = await neuAnlegen(modulId)
      if (id) await neuImBereich(modulId, id, p.bereich)
    } catch (e) {
      notifyError(e)
    }
  }
  return (
    <div className="mm-ebene" data-mm-ebene={p.bereich?.name ?? 'Ohne Thema'}>
      <Stack gap="sm" p="md">
        <UnstyledButton onClick={p.onZurueck} className="mm-zurueck" data-mm-zurueck aria-label={`Zurück zu ${p.zurueckText}`}>
          <Group gap={2} wrap="nowrap">
            <IconChevronLeft size={20} />
            <Text size="md" fw={500} lineClamp={1}>
              {p.zurueckText}
            </Text>
          </Group>
        </UnstyledButton>
        <Group gap="sm" wrap="nowrap" align="flex-start">
          {p.bereich ? <FachOrdnerSymbol fach={p.fachId} groesse={30} offen /> : <IconFolder size={30} style={{ flex: 'none' }} />}
          <Title order={3} style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
            {p.bereich?.name ?? 'Ohne Thema'}
          </Title>
        </Group>
        {chips.length > 0 && (
          <div className="mm-chips" role="tablist" aria-label="Art" data-mm-arten>
            {chips.map((c) => (
              <button
                key={c.typ}
                type="button"
                role="tab"
                aria-selected={typ === c.typ}
                className="mm-chip"
                data-aktiv={typ === c.typ}
                data-mm-art={c.typ}
                onClick={() => p.setTyp(c.typ)}
              >
                {c.name} {c.n}
              </button>
            ))}
          </div>
        )}
        {!p.materialien.length && !p.unterthemen.length && <Text c="dimmed">Hier liegt noch nichts.</Text>}
        <Stack gap={6}>{gezeigt.map(p.materialZeile)}</Stack>
        {p.unterthemen.length > 0 && (
          <Stack gap={6}>
            <UnstyledButton onClick={() => setUnterOffen(!unterOffen)} data-mm-unterthemen={p.unterthemen.length} aria-expanded={unterOffen}>
              <Group gap={4}>
                {unterOffen ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                <Text fw={700}>Unterthemen ({p.unterthemen.length})</Text>
              </Group>
            </UnstyledButton>
            <Collapse expanded={unterOffen}>
              <Stack gap={6}>{p.unterthemen.map(p.themaZeile)}</Stack>
            </Collapse>
          </Stack>
        )}
        {p.fachschaft.length > 0 && <FachschaftAbschnitt liste={p.fachschaft} />}
      </Stack>
      {p.bereich && p.neuApps.length > 0 && (
        <div className="mm-neu" data-mm-neu>
          {p.neuApps.length === 1 ? (
            <Button fullWidth size="md" leftSection={<IconPlus size={18} />} onClick={() => void neu(p.neuApps[0].id)}>
              Neu in diesem Thema
            </Button>
          ) : (
            <Menu position="top" withinPortal width="target">
              <Menu.Target>
                <Button fullWidth size="md" leftSection={<IconPlus size={18} />}>
                  Neu in diesem Thema
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {p.neuApps.map((a) => (
                  <Menu.Item key={a.id} onClick={() => void neu(a.id)} data-mm-neu-app={a.id}>
                    {EINZAHL[a.id] ?? a.name}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}
        </div>
      )}
    </div>
  )
}

/** „▸ Von der Fachschaft (n)" – zugeklappt am Ende */
function FachschaftAbschnitt({ liste }: { liste: Freigabe[] }): React.JSX.Element {
  const [auf, setAuf] = useState(false)
  return (
    <Stack gap={6} mt="xs" data-mm-fachschaft={liste.length}>
      <UnstyledButton onClick={() => setAuf(!auf)} aria-expanded={auf}>
        <Group gap={4}>
          {auf ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
          <IconUsers size={16} />
          <Text fw={700}>Von der Fachschaft ({liste.length})</Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={auf}>
        <Stack gap={6}>
          {liste.map((f) => {
            const app = modul(f.art)
            return (
              <UnstyledButton key={f.id} className="mm-zeile" onClick={() => void freigabeOeffnen(f)} data-mm-freigabe={f.titel}>
                <Group gap="sm" wrap="nowrap">
                  {app?.leistenbild ? <img src={app.leistenbild} width={32} height={32} alt="" style={{ borderRadius: 7, flex: 'none' }} /> : null}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={600} size="sm" style={{ overflowWrap: 'anywhere' }}>
                      {f.titel}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {untertitel(EINZAHL[f.art] ?? app?.name ?? '', f.jahrgang)} · {f.vonName}
                    </Text>
                  </div>
                </Group>
              </UnstyledButton>
            )
          })}
        </Stack>
      </Collapse>
    </Stack>
  )
}

/** Eine Materialzeile: App-Bild, Titel (bricht um), „Arbeitsblatt · Kl. 9", ⋯ mit vier Punkten */
function MaterialZeile({ m, onVerschieben, onLoeschen }: { m: Material; onVerschieben?: () => void; onLoeschen: () => void }): React.JSX.Element {
  const app = modul(m.moduleId)
  const oeffnen = (): void => void openDocument(m.moduleId, m.id)
  const { menue, weiter } = useMenueFokus()
  const freigegeben = useFreigegeben(m.moduleId, m.id)
  const loeschbar = ['arbeitsblatt', 'klassenarbeit', 'lernzielkontrolle', 'grammatiktest', 'vokabeltest'].includes(m.moduleId)
  return (
    <div className="mm-zeile mm-material" data-mm-material={m.name} data-art={m.moduleId}>
      <Group gap="sm" wrap="nowrap" align="center">
        <UnstyledButton onClick={oeffnen} style={{ flex: 1, minWidth: 0 }} aria-label={`„${m.name}“ öffnen`}>
          <Group gap="sm" wrap="nowrap" align="center">
            {app?.leistenbild ? (
              <img src={app.leistenbild} width={34} height={34} alt="" draggable={false} style={{ borderRadius: 8, flex: 'none' }} />
            ) : (
              app && <app.icon size={28} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text fw={600} size="sm" lineClamp={3} style={{ overflowWrap: 'anywhere' }}>
                {m.name}
              </Text>
              <Group gap={6} wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {untertitel(EINZAHL[m.moduleId] ?? app?.name ?? '', m.grade)}
                </Text>
                {m.entwurf && (
                  <Badge size="sm" variant="light" color="gray" style={{ flex: 'none', fontSize: 11, textTransform: 'none' }} data-mm-entwurf>
                    Entwurf
                  </Badge>
                )}
              </Group>
            </div>
          </Group>
        </UnstyledButton>
        <Menu position="bottom-end" withinPortal {...menue}>
          <Menu.Target>
            <ActionIcon variant="subtle" size={40} aria-label={`Weitere Aktionen für „${m.name}“`} style={{ flex: 'none' }}>
              <IconDots size={20} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconFolderOpen size={16} />} onClick={oeffnen}>
              Öffnen
            </Menu.Item>
            {onVerschieben && (
              <Menu.Item leftSection={<IconFolderShare size={16} />} onClick={weiter(onVerschieben)} data-mm-verschieben>
                Verschieben nach …
              </Menu.Item>
            )}
            {freigebbar(m.moduleId) && !freigegeben && (
              <Menu.Item leftSection={<IconShare size={16} />} onClick={() => void fuerFachschaftFreigeben(m.moduleId, m.id, m.name)} data-fachschaft-freigeben>
                Für Fachschaft freigeben
              </Menu.Item>
            )}
            {loeschbar && (
              <Menu.Item leftSection={<IconTrash size={16} />} color="red" onClick={weiter(onLoeschen)} data-mm-loeschen>
                Löschen
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>
    </div>
  )
}

/** Rückfrage vor dem Löschen – wie in den Bibliotheken */
function LoeschenFrage({ m, onClose, onFertig }: { m: Material | null; onClose: () => void; onFertig: () => void }): React.JSX.Element {
  const [laeuft, setLaeuft] = useState(false)
  const los = async (): Promise<void> => {
    if (!m) return
    setLaeuft(true)
    try {
      // Dynamisch: die Ablagen der Programme hängen von den Bibliotheken ab, nicht umgekehrt
      const [{ ablageVon }, { loescheDokument }] = await Promise.all([import('../../modules/unterrichtsreihe/reiheLoeschen'), import('../bibliothek')])
      const ablage = ablageVon(m.moduleId)
      if (!ablage) throw new Error('Dieses Material lässt sich hier nicht löschen – bitte in seiner App.')
      await loescheDokument(ablage.loeschen, m.id, ablage)
      void zuordnungVergessen(m.moduleId, m.id)
      onFertig()
      onClose()
    } catch (e) {
      notifyError(e, 'Das Löschen hat nicht geklappt')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Modal opened={m !== null} onClose={onClose} title="Material löschen?" data-mm-loeschen-frage>
      <Stack>
        <Text size="sm">„{m?.name}“ wird endgültig gelöscht.</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button color="red" loading={laeuft} onClick={() => void los()} data-mm-loeschen-ok>
            Löschen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
