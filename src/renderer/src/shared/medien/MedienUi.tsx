/**
 * Medienbank in den Vokabeltabellen (05.10.2026): Spalten „Beispielbild", „Aussprache", „Satz-Aussprache",
 * das Bild-Pop-up (löschen, ein anderes gefundenes wählen, von der KI erzeugen lassen) und die Leiste der
 * Admins für die angezeigten Wörter. Lehrkräfte sehen und hören – bearbeiten dürfen nur Admins.
 *
 * Seit 06.10.2026 laufen Suchen und Erzeugen als Hintergrund-Aufträge in der Auftragsleiste (medienAuftrag.ts):
 * Die Leiste stößt nur an, das Pop-up darf während „Von der KI erzeugen" geschlossen werden, und bei
 * Schulbüchern lassen sich mehrere Abschnitte auf einmal in Auftrag geben (`AbschnitteDialog`).
 */
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Image,
  Loader,
  Modal,
  Popover,
  Radio,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconListCheck,
  IconPhoto,
  IconPhotoSearch,
  IconRefresh,
  IconSparkles,
  IconTrash,
  IconVolume,
  IconMessage2
} from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ansicht } from '../plattform'
import { create } from 'zustand'
import {
  BILDSTUFE_NAME,
  BILDSTUFEN,
  istGanzerSatz,
  saetzeVon,
  satzSchluessel,
  sprachKurz,
  STIMMLAGE_NAME,
  stufeVon,
  tonPasst,
  tonVon,
  type Bildstufe,
  type MedienKandidat,
  type MedienSicht,
  type MedienTon,
  type Stimmen,
  type Stimmlage,
  type TonArt
} from '@shared/medienbank'
import { istGeprueft, verdachtText, type TonPruefung } from '@shared/tonPruefung'
import { satzFuerLage } from '@shared/satzFassung'
import { aufMessung, gemesseneVon, merkeMessung, pruefungVon, tonMessen } from './tonMessung'
import { notifyError, notifySuccess } from '../util'
import { useLaufendeSchluessel } from '../auftraege'
import { abspielen, bildKandidaten, kandidatUebernehmen, sinnVon, type Vokabel } from './medienbank'
import { WORTART_NAME, type BildTeil, type MedienAnfrage } from '@shared/medienBedeutung'
import { bedeutungenKlaerenStarten } from './bedeutungenKlaeren'
import { lizenzErlaubt, lizenzSperrgrund } from '@shared/bildLizenz'
import { aufMedienAenderung, lagenVon, medienSchluessel, offeneVokabeln, starteMedienAuftrag, type MedienArt, type MedienZiel } from './medienAuftrag'

let adminZwischen: Promise<boolean> | null = null
/** Darf diese Person die Medienbank bearbeiten? (einmal je Sitzung gefragt) */
export function useMedienAdmin(): boolean {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    adminZwischen ??= window.api.medien.admin().catch(() => false)
    void adminZwischen.then(setAdmin)
  }, [])
  // „Ansicht zeigen" (App-Freigaben, 23.10.2026): der Server kennt das Fenster weiter als Admin – die Ansicht ist eine Lehrkraft
  return admin && !ansicht()
}

/*
 * Bildstufe der Ansicht (07.10.2026): aus der Klasse der Liste bzw. des Lehrwerks, in der Medienleiste umstellbar.
 * Die Wahl gilt für die Liste bzw. das ganze Lehrwerk, solange das Programm offen ist.
 */
const useStufenWahl = create<{ wahl: Record<string, Bildstufe>; setze: (schluessel: string, s: Bildstufe) => void }>((set) => ({
  wahl: {},
  setze: (schluessel, s) => set((x) => ({ wahl: { ...x.wahl, [schluessel]: s } }))
}))
const wahlSchluessel = (docId: string): string => docId.split('|')[0]

/** Ziel mit Bildstufe (von Hand gewählt oder aus der Klasse) */
export function useMedienZiel(ziel: MedienZiel): MedienZiel & { stufe: Bildstufe } {
  const gewaehlt = useStufenWahl((x) => x.wahl[wahlSchluessel(ziel.docId)])
  return { ...ziel, stufe: gewaehlt ?? stufeVon(ziel.klasse) }
}

/**
 * Einträge der Medienbank für die Wörter einer Tabelle – Bilder in der Bildstufe `stufe`. Anfragen mit Übersetzung und
 * Wortart (21.10.2026, shared/medienBedeutung.ts): das Bild der Bedeutung steht dann in `bilder` (lesen über `bildVon`).
 */
export function useMedienbank(
  sprache: string | undefined,
  woerter: (string | MedienAnfrage)[],
  stufe?: Bildstufe
): { daten: Record<string, MedienSicht>; laden: () => void; bereit: boolean } {
  const [daten, setDaten] = useState<Record<string, MedienSicht>>({})
  const schluessel = woerter
    .filter((w) => (typeof w === 'string' ? w : w.w))
    .map((w) => (typeof w === 'string' ? w : JSON.stringify(w)))
    .join('\u0001')
  // Für welche Wörter die Daten gelten (09.10.2026): bis sie da sind, zählen die Knöpfe nicht „alles offen" (kein Aufblinken)
  const auftrag = `${sprache ?? ''}|${stufe ?? ''}|${schluessel}`
  const [geladenFuer, setGeladenFuer] = useState('')
  const laden = useCallback(() => {
    const fuer = `${sprache ?? ''}|${stufe ?? ''}|${schluessel}`
    if (!sprache || !schluessel) {
      setDaten({})
      return setGeladenFuer(fuer)
    }
    const liste = schluessel.split('\u0001').map((x): string | MedienAnfrage => (x.startsWith('{') ? (JSON.parse(x) as MedienAnfrage) : x))
    void window.api.medien.eintraege(sprachKurz(sprache), liste, stufe).then(
      (d) => {
        setDaten(d)
        setGeladenFuer(fuer)
      },
      () => {
        setDaten({})
        setGeladenFuer(fuer)
      }
    )
  }, [sprache, schluessel, stufe])
  useEffect(() => laden(), [laden])
  // Medienaufträge im Hintergrund melden jedes erledigte Wort – kurz gesammelt neu laden
  useEffect(() => {
    if (!sprache) return
    let t: ReturnType<typeof setTimeout> | undefined
    const weg = aufMedienAenderung((sp) => {
      if (sp !== sprachKurz(sprache)) return
      clearTimeout(t)
      t = setTimeout(laden, 400)
    })
    return () => {
      clearTimeout(t)
      weg()
    }
  }, [sprache, laden])
  return { daten, laden, bereit: geladenFuer === auftrag }
}

export const spiele = (q: { datei?: string; url?: string } | undefined): void => {
  if (q) void abspielen(q).catch((e: unknown) => notifyError(e, 'Abspielen nicht möglich'))
}

/**
 * Zelle „Beispielbild" – `stufe`: Bildstufe der Ansicht; ein Bild einer anderen Stufe erscheint blass mit deren Namen.
 * `sicht`: das Bild der Bedeutung (`bildVon`, 21.10.2026); ein nur vorläufiges Bild (andere Übersetzung) trägt einen Punkt.
 */
export function BildZelle({ sicht, wort, onOeffnen, stufe }: { sicht?: BildTeil; wort: string; onOeffnen: () => void; stufe?: Bildstufe }): React.JSX.Element {
  const b = sicht?.bild
  const fremd = Boolean(stufe && sicht?.bildStufe && sicht.bildStufe !== stufe)
  return (
    <UnstyledButton
      onClick={onOeffnen}
      aria-label={`Beispielbild zu „${wort}“`}
      data-beispielbild={wort}
      data-bildstufe={sicht?.bildStufe}
      disabled={!wort.trim()}
      title={fremd ? `Bild aus Stufe ${BILDSTUFE_NAME[sicht!.bildStufe!]} – für ${BILDSTUFE_NAME[stufe!]} gibt es noch keins` : undefined}
      style={{ position: 'relative' }}
    >
      {b?.dataUrl || b?.url ? (
        <>
          <Image src={b.dataUrl ?? b.url} w={44} h={44} fit="cover" radius={4} alt="" aria-hidden="true" style={fremd ? { opacity: 0.45 } : undefined} />
          {/* Bild einer anderen Übersetzung derselben Wortart (21.10.2026) – der nächste Bildauftrag ordnet zu */}
          {sicht?.vorlaeufig && !fremd && (
            <Tooltip label={`Vorläufig: Bild der Bedeutung „${sicht.bedeutung?.deutsch ?? ''}" – der nächste Bildauftrag prüft, ob es passt`}>
              <span
                data-bild-vorlaeufig
                style={{
                  position: 'absolute',
                  bottom: -3,
                  right: -3,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  background: 'var(--mantine-color-yellow-5)',
                  border: '2px solid var(--mantine-color-body)'
                }}
              />
            </Tooltip>
          )}
          {/* KI-Bild vom Sicherheitssystem abgelehnt, Ersatz aus der Bildsuche (12.10.2026) */}
          {b.kiAbgelehnt && !fremd && (
            <Tooltip label="KI-Bild wurde vom Sicherheitssystem abgelehnt – dieses Bild kommt aus der Bildsuche. Bitte prüfen.">
              <span
                data-bild-abgelehnt
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  background: 'var(--mantine-color-orange-6)',
                  border: '2px solid var(--mantine-color-body)'
                }}
              />
            </Tooltip>
          )}
          {fremd && (
            <Text
              size="9px"
              fw={700}
              style={{
                position: 'absolute',
                bottom: 1,
                left: 1,
                right: 1,
                textAlign: 'center',
                background: 'var(--mantine-color-body)',
                borderRadius: 3,
                lineHeight: 1.3
              }}
            >
              {BILDSTUFE_NAME[sicht!.bildStufe!].replace('Kl. ', '')}
            </Text>
          )}
        </>
      ) : stufe && sicht?.ohneBild?.includes(stufe) ? (
        <div
          style={{ width: 44, height: 44, borderRadius: 4, border: '1px dashed var(--mantine-color-default-border)', display: 'grid', placeItems: 'center' }}
          title="Für diese Stufe ohne Bild – kein eindeutiges Motiv (abstraktes Wort)"
          data-ohne-bild
        >
          <Text size="10px" c="dimmed">
            –
          </Text>
        </div>
      ) : (
        <div
          style={{ width: 44, height: 44, borderRadius: 4, border: '1px dashed var(--mantine-color-default-border)', display: 'grid', placeItems: 'center' }}
        >
          <IconPhoto size={16} color="var(--mantine-color-dimmed)" />
        </div>
      )}
    </UnstyledButton>
  )
}

/** Zelle „Aussprache" bzw. „Satz-Aussprache" */
export function TonZelle({
  ton,
  text,
  art,
  admin,
  erzeugen,
  lage,
  gesprochen,
  stimmlage,
  lagenDa,
  neuErzeugen
}: {
  ton?: { datei: string; url?: string; text: string; gesprochen?: string; pruefung?: TonPruefung; vorher?: { datei: string } }
  text: string
  /** Erwarteter Sprechtext (Abkürzungen, eigene Aussprache, 09.10.2026) – weicht die Aufnahme ab, ist sie veraltet */
  gesprochen?: string
  art: TonArt
  admin: boolean
  erzeugen: () => Promise<void>
  /** Fassung (07.10.2026) – steht klein am Knopf, wenn es zwei gibt */
  lage?: Stimmlage
  /** Fassung dieser Zelle, auch wenn es nur eine gibt (12.10.2026, Vorwahl im Menü „Neue Aussprache") */
  stimmlage?: Stimmlage
  /** Fassungen mit eingestellter Standardstimme */
  lagenDa?: Stimmlage[]
  /** Nur Admins (12.10.2026): Rechtsklick bzw. langer Druck auf das Symbol – neu erzeugen, die bisherige bleibt als Rückfall */
  neuErzeugen?: (lagen: Stimmlage[], grund: string) => Promise<void>
}): React.JSX.Element | null {
  const [laeuft, setLaeuft] = useState(false)
  // Prüfung per Messung (12.10.2026): gespeichert oder in dieser Sitzung nachgeprüft
  useMessungen()
  const pruefung = pruefungVon(ton)
  if (!text.trim()) return null
  if (art === 'satz' && !istGanzerSatz(text)) return null
  // Schreibvarianten („a / one" – „a/one", „it’s" – „it's") gelten als dieselbe Aufnahme (10.10.2026, shared/medienbank.ts)
  const veraltet = ton && !tonPasst(ton, text, gesprochen, art)
  const fassung = lage ? ` (${STIMMLAGE_NAME[lage]})` : ''
  const marke = (knopf: React.JSX.Element): React.JSX.Element =>
    lage ? (
      <Group gap={1} wrap="nowrap" data-lage={lage}>
        {knopf}
        <Text size="10px" c="dimmed" fw={600}>
          {lage}
        </Text>
      </Group>
    ) : (
      knopf
    )
  if (ton && !veraltet) {
    /*
     * Verdacht (12.10.2026, shared/tonPruefung.ts): orangefarbener Rand und Warnzeichen, im Tooltip die gemessenen Gründe.
     * Admins öffnen mit Rechtsklick (Tablet: langer Druck) das Menü „Neue Aussprache erzeugen".
     */
    const verdacht = pruefung?.stufe === 'verdacht'
    const hinweis = (art === 'wort' ? 'Aussprache anhören' : 'Beispielsatz anhören') + fassung
    const knopf = (
      <Tooltip label={verdacht ? `${verdachtText(pruefung)}${fassung}` : hinweis} multiline maw={320}>
        <ActionIcon
          variant="light"
          color={verdacht ? 'orange' : undefined}
          onClick={() => spiele(ton)}
          aria-label={`Aussprache „${text}“ anhören${fassung}${verdacht ? ' – vielleicht undeutlich' : ''}`}
          data-aussprache={art}
          data-aussprache-verdacht={verdacht ? '' : undefined}
          style={verdacht ? { outline: '2px solid var(--mantine-color-orange-6)', outlineOffset: 1, position: 'relative' } : undefined}
        >
          {art === 'wort' ? <IconVolume size={16} /> : <IconMessage2 size={16} />}
          {verdacht && <IconAlertTriangle size={10} style={{ position: 'absolute', top: -4, right: -4, color: 'var(--mantine-color-orange-7)' }} />}
        </ActionIcon>
      </Tooltip>
    )
    return marke(
      admin && neuErzeugen ? (
        <NeuErzeugenMenue
          lagenDa={lagenDa ?? (stimmlage ? [stimmlage] : ['w'])}
          vorwahl={stimmlage ?? lage ?? 'w'}
          vorher={ton.vorher}
          neuErzeugen={neuErzeugen}
        >
          {knopf}
        </NeuErzeugenMenue>
      ) : (
        knopf
      )
    )
  }
  if (!admin)
    return (
      <Text size="xs" c="dimmed">
        –
      </Text>
    )
  return marke(
    <Tooltip label={(veraltet ? 'Der Text hat sich geändert – neu erzeugen' : 'Aussprache von der Sprach-KI erzeugen') + fassung}>
      <ActionIcon
        variant="subtle"
        color={veraltet ? 'orange' : 'gray'}
        loading={laeuft}
        aria-label={`Aussprache „${text}“ erzeugen${fassung}`}
        data-aussprache-erzeugen={art}
        onClick={() => {
          setLaeuft(true)
          void erzeugen()
            .catch((e: unknown) => notifyError(e, 'Keine Aussprache'))
            .finally(() => setLaeuft(false))
        }}
      >
        <IconSparkles size={16} />
      </ActionIcon>
    </Tooltip>
  )
}

/** Neu zeichnen, sobald eine Nachprüfung fertig ist (12.10.2026) */
function useMessungen(): void {
  const [, setN] = useState(0)
  useEffect(() => aufMessung(() => setN((n) => n + 1)), [])
}

/** Gründe im Menü „Neue Aussprache erzeugen" (12.10.2026, Vorgabe der Lehrkraft) */
const NEU_GRUENDE = ['undeutlich', 'falsche Betonung', 'abgeschnitten', 'falsches Wort']

/**
 * Menü „Neue Aussprache erzeugen" (12.10.2026, nur Admins): Rechtsklick auf das Aussprache-Symbol, auf dem Tablet langer
 * Druck. Stimme (weiblich/männlich/beide) und Grund wählen; erzeugt sofort über den gewohnten Auftragsweg, misst die neue
 * Aufnahme und ersetzt die alte – die bleibt als Rückfall gespeichert und lässt sich hier anhören.
 */
function NeuErzeugenMenue({
  lagenDa,
  vorwahl,
  vorher,
  neuErzeugen,
  children
}: {
  lagenDa: Stimmlage[]
  vorwahl: Stimmlage
  vorher?: { datei: string }
  neuErzeugen: (lagen: Stimmlage[], grund: string) => Promise<void>
  children: React.ReactNode
}): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [wahl, setWahl] = useState<string>(lagenDa.includes(vorwahl) ? vorwahl : lagenDa[0] ?? 'w')
  const [grund, setGrund] = useState(NEU_GRUENDE[0])
  const [laeuft, setLaeuft] = useState(false)
  const druck = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lang = useRef(false)
  const loslassen = (): void => {
    if (druck.current) clearTimeout(druck.current)
    druck.current = null
  }
  useEffect(() => loslassen, [])
  const starten = (): void => {
    const lagen: Stimmlage[] = wahl === 'beide' ? lagenDa : [wahl as Stimmlage]
    setLaeuft(true)
    void neuErzeugen(lagen, grund)
      .then(() => setOffen(false))
      .catch((e: unknown) => notifyError(e, 'Keine neue Aussprache'))
      .finally(() => setLaeuft(false))
  }
  return (
    <Popover opened={offen} onChange={setOffen} position="bottom" withArrow shadow="md" withinPortal trapFocus>
      <Popover.Target>
        <span
          style={{ display: 'inline-flex', WebkitTouchCallout: 'none', userSelect: 'none' } as React.CSSProperties}
          onContextMenu={(e) => {
            e.preventDefault()
            setOffen(true)
          }}
          onTouchStart={() => {
            lang.current = false
            loslassen()
            druck.current = setTimeout(() => {
              lang.current = true
              setOffen(true)
            }, 550)
          }}
          onTouchEnd={loslassen}
          onTouchMove={loslassen}
          onTouchCancel={loslassen}
          onClickCapture={(e) => {
            // Nach langem Druck nicht zusätzlich abspielen
            if (!lang.current) return
            lang.current = false
            e.stopPropagation()
            e.preventDefault()
          }}
          data-neu-erzeugen-ziel
        >
          {children}
        </span>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={230} data-neu-erzeugen-menue>
          <Text size="sm" fw={600}>
            Neue Aussprache erzeugen
          </Text>
          <Radio.Group value={wahl} onChange={setWahl} label="Stimme" size="xs">
            <Stack gap={4} mt={4}>
              <Radio value="w" label="weibliche Stimme" disabled={!lagenDa.includes('w')} data-neu-lage="w" />
              <Radio value="m" label="männliche Stimme" disabled={!lagenDa.includes('m')} data-neu-lage="m" />
              <Radio value="beide" label="beide" disabled={lagenDa.length < 2} data-neu-lage="beide" />
            </Stack>
          </Radio.Group>
          <Radio.Group value={grund} onChange={setGrund} label="Grund" size="xs">
            <Stack gap={4} mt={4}>
              {NEU_GRUENDE.map((g) => (
                <Radio key={g} value={g} label={g} data-neu-grund={g} />
              ))}
            </Stack>
          </Radio.Group>
          {vorher && (
            <Button
              variant="subtle"
              size="compact-xs"
              leftSection={<IconVolume size={12} />}
              onClick={() => spiele({ datei: vorher.datei })}
              data-vorher-anhoeren
            >
              Vorige Aufnahme anhören
            </Button>
          )}
          <Button size="xs" leftSection={<IconRefresh size={14} />} loading={laeuft} onClick={starten} data-neu-erzeugen-start>
            Neue Aussprache erzeugen
          </Button>
          <Text size="10px" c="dimmed">
            Die bisherige Aufnahme bleibt als Rückfall gespeichert; die neue wird gleich gemessen.
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

/** Aufnahme des Beispielsatzes einer Stimme – bei geschlechtsbezogenen Sätzen die ihrer Fassung (12.10.2026) */
export const satzTonVon = (sicht: MedienSicht | undefined, satz: string | undefined, l: Stimmlage): (MedienTon & { url?: string }) | undefined =>
  satz ? saetzeVon(sicht, l)?.[satzSchluessel(satzFuerLage(satz, sicht?.fassungen, l))] : undefined

/** Vokabeln mit Verdacht je Art und Stimme (12.10.2026) – für Zähler, Filter und „neu erzeugen" */
export function verdaechtige(
  vokabeln: Vokabel[],
  daten: Record<string, MedienSicht>,
  lagen: Stimmlage[]
): { art: 'aussprache' | 'satz'; lage: Stimmlage; vokabeln: Vokabel[] }[] {
  const aus: { art: 'aussprache' | 'satz'; lage: Stimmlage; vokabeln: Vokabel[] }[] = []
  for (const l of lagen) {
    const w = vokabeln.filter((v) => v.term.trim() && pruefungVon(tonVon(daten[v.term], l))?.stufe === 'verdacht')
    const s = vokabeln.filter((v) => v.term.trim() && istGanzerSatz(v.example) && pruefungVon(satzTonVon(daten[v.term], v.example, l))?.stufe === 'verdacht')
    if (w.length) aus.push({ art: 'aussprache', lage: l, vokabeln: w })
    if (s.length) aus.push({ art: 'satz', lage: l, vokabeln: s })
  }
  return aus
}

/** Hat diese Zeile eine Aufnahme mit Verdacht (Wort oder Beispielsatz, eine der Stimmen)? */
export const zeileMitVerdacht = (sicht: MedienSicht | undefined, satz: string | undefined): boolean =>
  (['w', 'm'] as Stimmlage[]).some((l) => pruefungVon(tonVon(sicht, l))?.stufe === 'verdacht' || pruefungVon(satzTonVon(sicht, satz, l))?.stufe === 'verdacht')

/* Filter „vielleicht undeutlich" der Medienleiste (12.10.2026) – je Stelle, solange das Programm offen ist */
const useVerdachtFilter = create<{ an: Record<string, boolean>; setze: (docId: string, an: boolean) => void }>((set) => ({
  an: {},
  setze: (docId, an) => set((x) => ({ an: { ...x.an, [docId]: an } }))
}))
export const useNurVerdacht = (docId: string | undefined): boolean => useVerdachtFilter((x) => Boolean(docId && x.an[docId]))

/*
 * Nachprüfung vorhandener Aufnahmen (12.10.2026): Beim Öffnen einer Liste werden noch ungeprüfte Aufnahmen (ohne Prüfung
 * oder mit älterer Regelfassung) im Hintergrund gemessen – eine nach der anderen mit kurzer Pause, damit die Oberfläche
 * flüssig bleibt. Admins speichern das Ergebnis in der Medienbank; andere Lehrkräfte sehen es nur in dieser Sitzung.
 */
const inArbeit = new Set<string>()
export function useTonNachpruefung(sprache: string | undefined, daten: Record<string, MedienSicht>, admin: boolean): void {
  useEffect(() => {
    if (!sprache) return
    const sp = sprachKurz(sprache)
    type Auftrag = { wort: string; art: TonArt; lage: Stimmlage; satz?: string; ton: MedienTon & { url?: string } }
    const offen: Auftrag[] = []
    const dazu = (a: Auftrag): void => {
      if (istGeprueft(a.ton.pruefung) || gemesseneVon(a.ton.datei) || inArbeit.has(a.ton.datei)) return
      offen.push(a)
    }
    for (const [wort, sicht] of Object.entries(daten))
      for (const lage of ['w', 'm'] as Stimmlage[]) {
        const t = tonVon(sicht, lage)
        if (t) dazu({ wort, art: 'wort', lage, ton: t })
        for (const [satz, st] of Object.entries(saetzeVon(sicht, lage) ?? {})) dazu({ wort, art: 'satz', lage, satz: st.text || satz, ton: st })
      }
    if (!offen.length) return
    let weg = false
    void (async () => {
      for (const a of offen) {
        if (weg) break
        if (inArbeit.has(a.ton.datei) || gemesseneVon(a.ton.datei)) continue
        inArbeit.add(a.ton.datei)
        try {
          const quelle = a.ton.url ?? (await window.api.medien.datei(a.ton.datei))
          if (!quelle) continue
          const p = await tonMessen(quelle, a.art, a.ton.gesprochen ?? a.ton.text)
          merkeMessung(a.ton.datei, p)
          if (admin) await window.api.medien.tonPruefung(sp, a.wort, a.art, a.lage, a.satz, a.ton.datei, p).catch(() => false)
        } catch {
          // Nicht messbar (Datei fehlt): beim nächsten Öffnen erneut
        } finally {
          inArbeit.delete(a.ton.datei)
        }
        await new Promise((ok) => setTimeout(ok, 60))
      }
    })()
    return () => {
      weg = true
    }
  }, [sprache, daten, admin])
}

/** Pop-up eines Beispielbilds: groß ansehen; Admins: löschen, anderes wählen, neu suchen, KI erzeugen */
export function BildDialog({
  sprache,
  v,
  sicht,
  admin,
  ziel,
  schliessen,
  geaendert
}: {
  sprache: string
  v: Vokabel
  /** Das Bild der Bedeutung (`bildVon`, 21.10.2026) */
  sicht?: BildTeil
  admin: boolean
  /** Stelle der Vokabel – Ziel von „Öffnen" in der Auftragsleiste */
  ziel: MedienZiel
  schliessen: () => void
  geaendert: () => void
}): React.JSX.Element {
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [kandidaten, setKandidaten] = useState<MedienKandidat[]>((sicht?.bild?.kandidaten ?? []).filter((k) => lizenzErlaubt(k.lizenz)))
  // „Von der KI erzeugen" läuft als Auftrag weiter, auch wenn das Pop-up zugeht
  const kiLaeuft = useLaufendeSchluessel(ziel.docId).has(medienSchluessel('bildKi', v.term))
  const stufe = ziel.stufe ?? stufeVon(ziel.klasse)
  const b = sicht?.bild
  // Bild einer anderen Stufe (Rückfall) – löschen träfe dann nicht das gezeigte
  const fremd = Boolean(b && sicht?.bildStufe && sicht.bildStufe !== stufe)
  // Bedeutung, zu der Löschen und Übernehmen gehören (21.10.2026) – ein nur vorläufiges Bild gehört einer anderen
  const vv: Vokabel = {
    ...v,
    ...(sicht?.bedeutung && !sicht.vorlaeufig ? { bedeutung: sicht.bedeutung } : {}),
    ...(sicht?.andere ? { andere: sicht.andere } : {})
  }
  const sinn = sinnVon(sprache, vv)
  const bed = sicht?.bedeutung
  const tun = async (was: string, fn: () => Promise<unknown>, meldung?: string): Promise<void> => {
    setLaeuft(was)
    try {
      await fn()
      geaendert()
      if (meldung) notifySuccess(meldung)
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(null)
    }
  }
  return (
    <Modal
      opened
      onClose={schliessen}
      title={`Beispielbild – ${v.term}${v.translation ? ` (${WORTART_NAME[sinn.wortart]}: ${v.translation})` : ''}`}
      size="lg"
      data-bild-dialog
    >
      <Stack>
        {(sicht?.vorlaeufig || sicht?.mehrdeutig) && (
          <Text size="xs" c="yellow.9" ta="center" data-bild-bedeutung-hinweis>
            {sicht.vorlaeufig
              ? `Vorläufig: Das Bild gehört zur Bedeutung „${bed?.deutsch ?? ''}". Der nächste Bildauftrag prüft, ob „${
                  v.translation
                }" dasselbe meint – sonst entsteht ein eigenes Bild.`
              : 'Mehrere Bedeutungen kommen in Frage – der nächste Bildauftrag ordnet zu.'}
          </Text>
        )}
        {b ? (
          <Stack gap={4} align="center">
            <Image src={b.dataUrl ?? b.url} mah={320} fit="contain" radius="sm" alt={v.term} />
            <Text size="xs" c="dimmed" ta="center">
              {b.herkunft === 'ki' ? 'KI-generiert' : b.nachweis}
            </Text>
            {/* Vorhandene NC-/ND-Bilder markieren (22.10.2026, Prüfung des Schulträgers) */}
            {b.herkunft !== 'ki' && lizenzSperrgrund(b.nachweis) && (
              <Text size="xs" c="red.7" ta="center" data-bild-lizenz-gesperrt>
                {lizenzSperrgrund(b.nachweis)} – bitte ein anderes Bild wählen.
              </Text>
            )}
            {fremd && (
              <Text size="xs" c="orange.8" ta="center" data-bild-fremde-stufe>
                Bild der Stufe {BILDSTUFE_NAME[sicht!.bildStufe!]} – für {BILDSTUFE_NAME[stufe]} gibt es noch kein eigenes. Lernende dieser Stufe sehen bis
                dahin dieses.
              </Text>
            )}
          </Stack>
        ) : (
          <Text c="dimmed" ta="center" py="lg">
            {sicht?.ohneBild?.includes(stufe)
              ? `Für ${BILDSTUFE_NAME[stufe]} ohne Bild: Die KI sieht kein eindeutiges Motiv (abstraktes Wort). Von Hand suchen oder erzeugen geht trotzdem.`
              : 'Noch kein Beispielbild.'}
          </Text>
        )}
        <Text size="xs" c="dimmed" ta="center">
          Bildstufe: {BILDSTUFE_NAME[stufe]}
        </Text>
        {admin && (
          <>
            <Group justify="center" gap="xs">
              {b && !fremd && !sicht?.vorlaeufig && (
                <Button
                  color="red"
                  variant="light"
                  leftSection={<IconTrash size={16} />}
                  loading={laeuft === 'loeschen'}
                  onClick={() => void tun('loeschen', () => window.api.medien.bildLoeschen(sprache, v.term, stufe, sinn), 'Bild gelöscht.')}
                  data-bild-loeschen
                >
                  Löschen
                </Button>
              )}
              <Button
                variant="light"
                leftSection={<IconPhotoSearch size={16} />}
                loading={laeuft === 'suchen'}
                onClick={() =>
                  void tun('suchen', async () => {
                    const k = await bildKandidaten(sprache, vv, { klasse: ziel.klasse, stufe })
                    setKandidaten(k)
                    if (!k.length) throw new Error('Die Bildsuche hat nichts gefunden.')
                  })
                }
                data-bild-neu-suchen
              >
                Andere Bilder suchen
              </Button>
              <Button
                leftSection={<IconSparkles size={16} />}
                loading={kiLaeuft}
                onClick={() => void starteMedienAuftrag({ art: 'bildKi', sprache, vokabeln: [v], ziel, einzeln: true })}
                data-bild-ki
              >
                Von der KI erzeugen
              </Button>
            </Group>
            {kiLaeuft && (
              <Text size="xs" c="dimmed" ta="center" data-bild-ki-hintergrund>
                Die Bild-KI arbeitet im Hintergrund (Auftragsleiste unten rechts) – das Pop-up kann geschlossen werden.
              </Text>
            )}
            {kandidaten.length > 0 && (
              <>
                <Text size="sm" fw={600}>
                  Gefundene Bilder – anklicken zum Übernehmen
                </Text>
                <SimpleGrid cols={{ base: 3, sm: 5 }} spacing="xs">
                  {kandidaten.map((k) => (
                    <Tooltip key={k.url} label={[k.titel, k.urheber, k.lizenz].filter(Boolean).join(' · ')}>
                      <UnstyledButton
                        onClick={() =>
                          void tun(`k:${k.url}`, () => kandidatUebernehmen(sprache, v.term, k, kandidaten, stufe, false, sinn), 'Bild übernommen.')
                        }
                        style={{ position: 'relative' }}
                        data-bild-kandidat
                      >
                        <Image src={k.vorschau} h={80} fit="cover" radius={4} alt="Bildvorschlag" />
                        {laeuft === `k:${k.url}` && <Loader size="xs" style={{ position: 'absolute', top: 4, right: 4 }} />}
                      </UnstyledButton>
                    </Tooltip>
                  ))}
                </SimpleGrid>
                <Text size="xs" c="dimmed">
                  Lizenzangaben stehen beim Bild. Bilder aus der Bildsuche ohne Lizenzangabe vor dem Einsatz prüfen.
                </Text>
              </>
            )}
          </>
        )}
      </Stack>
    </Modal>
  )
}

/** Standardstimmen der Sprache (weiblich/männlich) – null, solange unbekannt */
export function useStandardstimmen(sprache: string): Stimmen | null {
  const [stimmen, setStimmen] = useState<Stimmen | null>(null)
  const sp = sprachKurz(sprache)
  useEffect(() => {
    void window.api.medien.stimmen().then(
      (s) => setStimmen(s[sp] ?? {}),
      () => setStimmen({})
    )
  }, [sp])
  return stimmen
}

/** Ist eine Bild-KI eingerichtet? */
export function useBildKiDa(): boolean {
  const [da, setDa] = useState(false)
  useEffect(() => {
    let weg = false
    void window.api.ai
      .status()
      .then((s) => !weg && setDa(Boolean(s.hasImageKey)))
      .catch(() => undefined)
    return () => {
      weg = true
    }
  }, [])
  return da
}

/**
 * Leiste für Admins: Bilder suchen, Aussprache von Wörtern und Beispielsätzen erzeugen – für die angezeigten
 * Wörter. Jeder Knopf gibt einen Auftrag in die Auftragsleiste; solange er läuft, ist der Knopf gesperrt.
 * `mehr`: weitere Knöpfe (bei Schulbüchern „Mehrere Abschnitte …").
 */
export function MedienLeiste({
  sprache,
  vokabeln,
  daten,
  ziel,
  mehr,
  bereit = true,
  figuren
}: {
  sprache: string
  vokabeln: Vokabel[]
  daten: Record<string, MedienSicht>
  ziel: MedienZiel
  mehr?: React.ReactNode
  /** Figuren des Lehrwerks für angepasste Beispielsätze (12.10.2026, shared/satzFassung.ts) */
  figuren?: string[]
  /** Medienbank-Daten für diese Wörter geladen? Vorher Knöpfe gesperrt ohne Zahl (09.10.2026) */
  bereit?: boolean
}): React.JSX.Element {
  const stimmen = useStandardstimmen(sprache)
  const lagen = lagenVon(stimmen ?? undefined)
  const laufend = useLaufendeSchluessel(ziel.docId)
  const bildKi = useBildKiDa()
  const sp = sprachKurz(sprache)
  const woerter = vokabeln.filter((v) => v.term.trim())
  const stufe = ziel.stufe ?? stufeVon(ziel.klasse)
  const setzeStufe = useStufenWahl((x) => x.setze)
  const ohneBild = offeneVokabeln('bilder', woerter, daten, ['w'], stufe, sp)
  const ohneTon = offeneVokabeln('aussprache', woerter, daten, lagen.length ? lagen : ['w'], stufe, sp)
  const ohneSatz = offeneVokabeln('satz', woerter, daten, lagen.length ? lagen : ['w'], stufe, sp)
  const ohneStimme = stimmen !== null && !lagen.length
  const start = (art: MedienArt, liste: Vokabel[]): void =>
    void starteMedienAuftrag({ art, sprache: sp, vokabeln: liste, ziel, ...(figuren ? { figuren } : {}) })
  /*
   * „vielleicht undeutlich (N)" (12.10.2026): Aufnahmen mit Verdacht aus der Messung – als Filter der Tabelle und zum
   * Neu-Erzeugen (je Art und Stimme ein Auftrag; die bisherige Aufnahme bleibt als Rückfall).
   */
  useMessungen()
  const verdacht = verdaechtige(woerter, daten, lagen.length ? lagen : ['w'])
  const verdachtZahl = new Set(verdacht.flatMap((x) => x.vokabeln.map((v) => v.term))).size
  const nurVerdacht = useNurVerdacht(ziel.docId)
  const setzeFilter = useVerdachtFilter((x) => x.setze)
  const neuLaeuft = laufend.has(medienSchluessel('aussprache')) || laufend.has(medienSchluessel('satz'))
  // Mehrdeutige Wörter (21.10.2026, Bilder je Bedeutung): Synonyme und alte Bilder, die auf die KI warten
  const [sinnZahl, setSinnZahl] = useState(0)
  const klaerenLaeuft = useLaufendeSchluessel('medien-bedeutungen').has('medien:bedeutungen')
  useEffect(() => {
    let weg = false
    void window.api.medien
      .sinnStand()
      .then((x) => !weg && setSinnZahl(x.klaeren + x.offen))
      .catch(() => undefined)
    return () => {
      weg = true
    }
  }, [klaerenLaeuft, daten])
  const verdachtNeu = (): void => {
    for (const x of verdacht)
      void starteMedienAuftrag({
        art: x.art,
        sprache: sp,
        vokabeln: x.vokabeln,
        ziel,
        lagen: [x.lage],
        einzeln: true,
        neu: { grund: 'Messung: vielleicht undeutlich' }
      })
  }
  const knopf = (art: MedienArt, label: string, liste: Vokabel[], icon: React.ReactNode, kennung: string, braucheStimme = false): React.JSX.Element => {
    const laeuft = laufend.has(medienSchluessel(art))
    return (
      <Button
        size="xs"
        leftSection={icon}
        loading={laeuft}
        disabled={!bereit || laeuft || !liste.length || (braucheStimme && ohneStimme)}
        onClick={() => start(art, liste)}
        {...{ [kennung]: true }}
      >
        {label} ({bereit ? liste.length : '…'})
      </Button>
    )
  }
  return (
    <Alert color="violet" variant="light" p="xs" mb="xs" data-medien-leiste>
      <Stack gap={6}>
        <Group gap="xs" wrap="wrap">
          <Badge color="violet" variant="filled">
            Admin
          </Badge>
          <Text size="sm">Medienbank für die angezeigten {woerter.length} Wörter:</Text>
          {knopf('bilder', 'Beispielbilder suchen', ohneBild, <IconPhotoSearch size={14} />, 'data-medien-bilder')}
          {/* Mit eingerichteter Bild-KI (07.10.2026): für Wörter ohne Bild gleich ein KI-Bild erzeugen lassen */}
          {bildKi && knopf('bildKi', 'Beispielbild von KI generieren lassen', ohneBild, <IconSparkles size={14} />, 'data-medien-bild-ki')}
          {knopf('aussprache', 'Aussprache erzeugen', ohneTon, <IconVolume size={14} />, 'data-medien-aussprache', true)}
          {knopf('satz', 'Satz-Aussprache erzeugen', ohneSatz, <IconMessage2 size={14} />, 'data-medien-satz', true)}
          {(sinnZahl > 0 || klaerenLaeuft) && (
            <Tooltip
              label="Wörter mit mehreren Bedeutungen derselben Wortart (vielleicht nur Synonyme) und ältere Bilder, die noch keiner Bedeutung zugeordnet sind – die KI prüft und ordnet zu"
              multiline
              maw={320}
            >
              <Button
                size="xs"
                variant="light"
                loading={klaerenLaeuft}
                disabled={klaerenLaeuft}
                onClick={() => void bedeutungenKlaerenStarten()}
                data-medien-bedeutungen
              >
                Mehrdeutige Wörter klären ({sinnZahl})
              </Button>
            </Tooltip>
          )}
          {(verdachtZahl > 0 || nurVerdacht) && (
            <Button.Group>
              <Tooltip
                label={nurVerdacht ? 'Wieder alle Wörter zeigen' : 'Nur Wörter zeigen, deren Aufnahme laut Messung vielleicht undeutlich ist'}
                multiline
                maw={300}
              >
                <Button
                  size="xs"
                  color="orange"
                  variant={nurVerdacht ? 'filled' : 'light'}
                  leftSection={<IconAlertTriangle size={14} />}
                  onClick={() => setzeFilter(ziel.docId, !nurVerdacht)}
                  data-medien-verdacht-filter
                >
                  vielleicht undeutlich ({verdachtZahl})
                </Button>
              </Tooltip>
              <Tooltip label="Diese Aufnahmen neu erzeugen – die bisherigen bleiben als Rückfall gespeichert" multiline maw={300}>
                <Button
                  size="xs"
                  color="orange"
                  variant="light"
                  leftSection={<IconRefresh size={14} />}
                  loading={neuLaeuft}
                  disabled={!verdachtZahl || neuLaeuft || ohneStimme}
                  onClick={verdachtNeu}
                  data-medien-verdacht-neu
                >
                  neu erzeugen
                </Button>
              </Tooltip>
            </Button.Group>
          )}
          {mehr}
        </Group>
        <Group gap="xs" wrap="wrap">
          <Text size="sm">Bildstufe:</Text>
          <SegmentedControl
            size="xs"
            value={stufe}
            onChange={(s) => setzeStufe(wahlSchluessel(ziel.docId), s as Bildstufe)}
            data={BILDSTUFEN.map((s) => ({ value: s, label: BILDSTUFE_NAME[s] }))}
            data-bildstufe-wahl
          />
          <Text size="xs" c="dimmed">
            {ziel.klasse ? `aus Klasse ${ziel.klasse}` : 'Klasse unbekannt'} – je Stufe ein eigenes Bild; fehlt es, sehen Lernende das der nächsten Stufe.
          </Text>
        </Group>
        {ohneStimme && (
          <Text size="xs" c="orange.8">
            Für die Aussprache fehlt eine Standardstimme für diese Sprache – Einstellungen › Bilder und Hörtexte › „Aussprache der Vokabeln“.
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Läuft im Hintergrund – Fortschritt in der Auftragsleiste unten rechts. Bei ausgelasteten Diensten wartet der Auftrag und macht danach weiter.
          {
            {
              s1: ' Kl. 1–4: freundliche Illustrationen mit echten Proportionen, nur konkrete Wörter.',
              s2: ' Kl. 5–6: halbrealistische Illustrationen, Verben als einfache Szene; abstrakte Wörter bleiben ohne Bild.',
              s3: ' Kl. 7–10: Fotos bzw. realistische Bilder, Abstrakta als typische Szene.',
              s4: ' Kl. 11–13: sachliche Fotos; im Zweifel kein Bild.'
            }[stufe]
          }
        </Text>
      </Stack>
    </Alert>
  )
}

/** Ein Abschnitt eines Schulbuchs für den Sammelauftrag */
export interface MedienAbschnitt {
  unit: string
  abschnitt: string
  vokabeln: Vokabel[]
  ziel: MedienZiel
}

/**
 * Mehrere Abschnitte eines Schulbuchs auf einmal in Auftrag geben (06.10.2026): je Abschnitt und Art ein Auftrag
 * in der Auftragsleiste – so führt „Öffnen" jeweils genau zu seinem Abschnitt. Es laufen höchstens zwei zugleich.
 */
export function AbschnitteDialog({
  opened,
  onClose,
  sprache,
  abschnitte
}: {
  opened: boolean
  onClose: () => void
  sprache: string
  abschnitte: MedienAbschnitt[]
}): React.JSX.Element {
  const [wahl, setWahl] = useState<string[]>([])
  const [arten, setArten] = useState<MedienArt[]>(['bilder', 'aussprache'])
  const stimmen = useStandardstimmen(sprache)
  const ohneStimme = stimmen !== null && !lagenVon(stimmen).length
  const bildKi = useBildKiDa()
  const key = (a: MedienAbschnitt): string => a.ziel.docId
  const alle = wahl.length === abschnitte.length && abschnitte.length > 0
  const tonOhneStimme = ohneStimme && arten.some((a) => a === 'aussprache' || a === 'satz')
  const starten = (): void => {
    let n = 0
    for (const a of abschnitte.filter((x) => wahl.includes(key(x)))) {
      for (const art of arten) {
        if (ohneStimme && (art === 'aussprache' || art === 'satz')) continue
        void starteMedienAuftrag({ art, sprache: sprachKurz(sprache), vokabeln: a.vokabeln, ziel: a.ziel })
        n++
      }
    }
    if (n) notifySuccess(`${n} ${n === 1 ? 'Auftrag' : 'Aufträge'} in der Auftragsleiste – sie laufen nacheinander im Hintergrund.`)
    setWahl([])
    onClose()
  }
  return (
    <Modal opened={opened} onClose={onClose} title="Mehrere Abschnitte bearbeiten" size="lg" data-medien-abschnitte>
      <Stack>
        <Group gap="md">
          {(
            [
              ['bilder', 'Beispielbilder suchen'],
              ...(bildKi ? [['bildKi', 'Beispielbild von KI']] : []),
              ['aussprache', 'Aussprache'],
              ['satz', 'Satz-Aussprache']
            ] as [MedienArt, string][]
          ).map(([art, label]) => (
            <Checkbox
              key={art}
              label={label}
              checked={arten.includes(art)}
              onChange={(e) => {
                const an = e.currentTarget.checked
                setArten((x) => (an ? [...x, art] : x.filter((y) => y !== art)))
              }}
              data-medien-art={art}
            />
          ))}
        </Group>
        {tonOhneStimme && (
          <Text size="xs" c="orange.8">
            Ohne Standardstimme für diese Sprache wird keine Aussprache erzeugt (Einstellungen › Bilder und Hörtexte).
          </Text>
        )}
        <Checkbox
          label="Alle Abschnitte"
          checked={alle}
          indeterminate={wahl.length > 0 && !alle}
          onChange={(e) => setWahl(e.currentTarget.checked ? abschnitte.map(key) : [])}
        />
        <ScrollArea.Autosize mah={360} type="auto">
          <Stack gap={4}>
            {abschnitte.map((a) => (
              <Checkbox
                key={key(a)}
                label={`${a.unit} · ${a.abschnitt} (${a.vokabeln.filter((v) => v.term.trim()).length} Wörter)`}
                checked={wahl.includes(key(a))}
                onChange={(e) => {
                  const an = e.currentTarget.checked
                  setWahl((x) => (an ? [...x, key(a)] : x.filter((y) => y !== key(a))))
                }}
                data-medien-abschnitt={key(a)}
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
        <Text size="xs" c="dimmed">
          Je Abschnitt und Art entsteht ein Auftrag; bearbeitet wird nur, was noch fehlt. Bei ausgelasteten Diensten (zu viele Anfragen, Kontingent) warten die
          Aufträge und machen danach von selbst weiter.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button leftSection={<IconListCheck size={16} />} disabled={!wahl.length || !arten.length} onClick={starten} data-medien-abschnitte-start>
            In Auftrag geben
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
