import { setzeFachVorgabe } from '../fachVorgabe'
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Chip,
  Collapse,
  Group,
  Menu,
  Modal,
  Radio,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconArrowBarUp,
  IconBulb,
  IconChevronRight,
  IconDots,
  IconFilePlus,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconFolderShare,
  IconListCheck,
  IconPencil,
  IconSortAscending,
  IconTrash,
  IconWand,
  IconX
} from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import type { Themenbereich } from '@shared/themen'
import { automatikAn, bereicheMitInhalt, kinderVon, materialSchluessel, nachfahrenVon, pfadVon } from '@shared/themen'
import { modules } from '../../modules/registry'
import { fachAnzeige, ladeMaterialien, type Material } from '../../shell/materialien'
import { artFarbe } from '../materialart'
import { neuAnlegen, openDocument, openThemen } from '../navigation'
import { useMenueFokus } from '../menueFokus'
import { imNetz } from '../netzZugang'
import {
  abgleichen,
  allesEinsortieren,
  bereichAnlegen,
  bereichLoeschen,
  bereichUmbenennen,
  bereichUmhaengen,
  ladeThemen,
  neuImBereich,
  reihenfolgeSetzen,
  useThemen,
  verschieben,
  vorschlaegeUebernehmen
} from '../themenbereiche'
import { katalogFuer, ladeLehrplan } from '../themenKatalog'
import { useAppSettings } from '../settingsStore'
import { useSichtbareProgramme } from '../../shell/programme'
import type { LehrplanDatei } from '@shared/lehrplan'
import { SORTIERUNGEN, schluesselVon, sortiere, umstellen, vorschauText, vorschlagen, type Sortierung, type Vorschlag } from '../themenVorschlag'
import { useConfirmKeys } from '../useConfirmKeys'
import { notifyError } from '../util'
import { VerschiebenKontext } from './Bibliothek'
import { FachPunkt, useFachFarbe } from './FachFarbe'

/**
 * Themenbereiche in den Bibliotheken (Paket 10b, 26.09.2026).
 *
 * Aufbau: Fach › Themenbereich (Ordner in der Fachfarbe) › Materialien. Materialien ohne
 * Bereich stehen direkt unter den Ordnern des Fachs („Ohne Themenbereich") – wie lose Dateien
 * unter den Ordnern im Explorer. So kostet die neue Ordnung keinen Klick, solange es keine
 * Bereiche gibt. Der Jahrgang ist nur noch ein Filter oben.
 *
 * Dieselbe Ansicht in allen fünf Bibliotheken und auf der übergreifenden Seite
 * „Themenbereiche" (shell/Themenuebersicht.tsx). Jede Bibliothek zeichnet ihre eigenen
 * Einträge selbst (Zeile mit Menü, beim Arbeitsblatt die Karte mit Vorschaubild); Materialien
 * der anderen Programme („alle Materialien des Bereichs") erscheinen als schlichte Karte, die
 * im richtigen Programm öffnet.
 *
 * Ordnen: Karten auf einen Ordner ziehen (auch mehrere – Strg-/Umschalt-Klick oder
 * „Auswählen"), oder „Verschieben nach …" im ⋯-Menü (Tastatur, Tablet). Jede Änderung zeigt
 * „Rückgängig".
 *
 * HIERARCHIE (Paket 12, Wunsch der Lehrkraft vom 26.09.2026): Bereiche haben Unterbereiche
 * („Der Erste Weltkrieg" › „Ursachen des Ersten Weltkriegs" › „Der Balkan als Krisenherd").
 * Die Übersicht zeigt je Fach einen Baum; Fächer und Bereiche sind auf- und zuklappbar und
 * stehen ANFANGS ZUGEKLAPPT – der Zustand wird je Rechner gemerkt. Aufgeklappt zeigt ein
 * Bereich seine Unterbereiche und seine Materialien. Karten lassen sich auf jeden Bereich
 * ziehen, Bereiche auf andere Bereiche (dann liegen sie darunter) oder auf das Fach (nach oben).
 */

const MIME = 'application/x-schulapps-material'

// ---------- Gemerkte Wahl (je Rechner; ohne lokalen Speicher gilt sie nur für die Sitzung) ----------

function lies<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function merke(key: string, wert: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(wert))
  } catch {
    // siehe oben
  }
}
function useGemerkt<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [wert, setWert] = useState<T>(() => lies(key, fallback))
  return [
    wert,
    (v: T) => {
      setWert(v)
      merke(key, v)
    }
  ]
}

/** Jahrgangsfilter – gemeinsam für alle Bibliotheken: Wer in Klasse 7 unterwegs ist, ist es überall */
const JAHRGANG_KEY = 'schul-apps-themen-jahrgang'
const SORTIERUNG_KEY = 'schul-apps-themen-sortierung'
const UMFANG_KEY = 'schul-apps-themen-umfang'
const VORSCHLAG_AUS_KEY = 'schul-apps-themen-vorschlag-aus'

/** Was aufgeklappt ist: `fach:<Kennung>` und `bereich:<Kennung>`. Standard: alles zu (Wunsch der Lehrkraft). */
const OFFEN_KEY = 'schul-apps-themen-offen'
const MIME_BEREICH = 'application/x-schulapps-bereich'

interface OffenState {
  offen: string[]
  umschalten: (k: string) => void
  oeffne: (ks: string[]) => void
}
/** Gemeinsam für alle Bibliotheken und die übergreifende Seite: Was hier aufgeklappt wird, ist es dort auch */
const useOffen = create<OffenState>((set, get) => ({
  offen: lies<string[]>(OFFEN_KEY, []),
  umschalten: (k) => {
    const neu = get().offen.includes(k) ? get().offen.filter((x) => x !== k) : [...get().offen, k]
    merke(OFFEN_KEY, neu)
    set({ offen: neu })
  },
  oeffne: (ks) => {
    const neu = [...new Set([...get().offen, ...ks])]
    if (neu.length === get().offen.length) return
    merke(OFFEN_KEY, neu)
    set({ offen: neu })
  }
}))

/** Lehrplandatei des eigenen Landes (für Vorschläge mit Oberthemen) – null, solange sie lädt oder fehlt */
function useLehrplan(): LehrplanDatei | null {
  const stateId = useAppSettings((s) => s.settings.defaults.stateId)
  const [lehrplan, setLehrplan] = useState<LehrplanDatei | null>(null)
  useEffect(() => {
    let weg = false
    void ladeLehrplan(stateId).then((l) => !weg && setLehrplan(l))
    return () => {
      weg = true
    }
  }, [stateId])
  return lehrplan
}

const modul = (id: string): (typeof modules)[number] | undefined => modules.find((m) => m.id === id)
/*
 * Materialarten in der Reihenfolge der Leiste – als Funktion, nicht als Konstante: registry.ts
 * lädt die Programme, deren Bibliotheken wiederum diese Datei laden. Beim Laden ist `modules`
 * deshalb noch nicht belegt.
 */
const arten = (): string[] => modules.map((m) => m.id).filter((id) => id !== 'vokabelliste')

const anzahlText = (n: number): string => (n === 1 ? '1 Material' : `${n} Materialien`)

export interface ThemenAnsichtProps {
  /** Programm der Bibliothek; null = übergreifende Seite (alle Materialarten) */
  moduleId: string | null
  /** „Arbeitsblätter" – für den Umschalter „nur Arbeitsblätter" */
  artPlural?: string
  /** Die Einträge dieses Programms (aus der Bibliothek, damit Umbenennen und Kopie sofort sichtbar sind) */
  eigene: Material[]
  /** Eigene Einträge zeichnet das Programm selbst */
  renderEigen?: (m: Material) => React.ReactNode
  darstellung?: 'zeilen' | 'karten'
  /** Neues Material dieses Programms anlegen; liefert seine Kennung („Neu in diesem Bereich") */
  onNeu?: () => Promise<string>
  /** Sprung von außen (Startseite) */
  ziel?: { fachId?: string; bereichId?: string; n: number }
}

export function ThemenAnsicht({ moduleId, artPlural, eigene, renderEigen, darstellung = 'zeilen', onNeu, ziel }: ThemenAnsichtProps): React.JSX.Element {
  const daten = useThemen((s) => s.daten)
  const [geladen, setGeladen] = useState<Material[] | null>(null)
  const [ort, setOrt] = useState<{ fachId: string | null; bereichId: string | null }>({ fachId: ziel?.fachId ?? null, bereichId: ziel?.bereichId ?? null })
  const [jahrgang, setJahrgang] = useGemerkt<number | null>(JAHRGANG_KEY, null)
  const [sortierung, setSortierung] = useGemerkt<Sortierung>(SORTIERUNG_KEY, 'neu')
  const [umfangGemerkt, setUmfang] = useGemerkt<'nur' | 'alle'>(`${UMFANG_KEY}-${moduleId ?? 'alle'}`, 'nur')
  const umfang = moduleId ? umfangGemerkt : 'alle'
  const [auswahl, setAuswahl] = useState<string[]>([])
  const [letzte, setLetzte] = useState<string | null>(null)
  const [auswahlModus, setAuswahlModus] = useState(false)
  const [verschiebenFuer, setVerschiebenFuer] = useState<string[] | null>(null)
  const [ueber, setUeber] = useState<string | null>(null)
  // Neuer Bereich: oben im Fach (elternId null) oder als Unterbereich
  const [neuerBereich, setNeuerBereich] = useState<{ fachId: string; elternId: string | null; name: string } | null>(null)
  /*
   * Hier eben angelegte Bereiche (der letzte wird hervorgehoben). Sie bleiben sichtbar, auch wenn
   * der Jahrgangsfilter leere Bereiche ausblendet – ein Bereich, der beim Anlegen verschwindet,
   * sähe aus, als sei das Anlegen gescheitert.
   */
  const [angelegt, setAngelegt] = useState<string[]>([])
  const offen = useOffen((s) => s.offen)
  const umschalten = useOffen((s) => s.umschalten)
  const oeffne = useOffen((s) => s.oeffne)
  // „Neu in diesem Bereich …": nur Programme, die zu den eigenen Fächern passen (Paket 12)
  const sichtbareProgramme = useSichtbareProgramme()

  useEffect(() => {
    if (!ziel) return
    setOrt({ fachId: ziel.fachId ?? null, bereichId: ziel.bereichId ?? null })
    // Ein Sprung von außen (Startseite) klappt sein Ziel auf
    if (ziel.fachId)
      oeffne([`fach:${ziel.fachId}`, ...(ziel.bereichId ? pfadVon(useThemen.getState().daten, ziel.bereichId).map((b) => `bereich:${b.id}`) : [])])
  }, [ziel?.n])

  // Alle Materialien holen (für „alle Materialien", die Vorschläge und das Einsortieren) – neu, sobald sich die eigene Liste ändert
  useEffect(() => {
    let weg = false
    void ladeThemen().catch(notifyError)
    void ladeMaterialien().then((liste) => {
      if (weg) return
      const ohneListen = liste.filter((m) => m.moduleId !== 'vokabelliste')
      setGeladen(ohneListen)
      void abgleichen(ohneListen)
    })
    return () => {
      weg = true
    }
  }, [eigene])

  // Eigene Einträge aus der Bibliothek (aktuell), die übrigen aus der geladenen Gesamtliste
  const alle = useMemo(() => [...eigene, ...(geladen ?? []).filter((m) => m.moduleId !== moduleId)], [eigene, geladen, moduleId])
  const zuordnung = (m: Material): string | null => daten.zuordnungen[schluesselVon(m)]?.bereichId ?? null
  const bereichVon = (m: Material): Themenbereich | null => {
    const id = zuordnung(m)
    return id ? (daten.bereiche.find((b) => b.id === id) ?? null) : null
  }
  // Ein Material steht unter dem Fach seines Bereichs – auch wenn es „Neu in diesem Bereich" noch ohne Fach angelegt wurde
  const fachVon = (m: Material): string => bereichVon(m)?.fachId ?? m.fachId

  const jahrgaenge = useMemo(() => [...new Set(alle.map((m) => m.grade).filter((g): g is number => !!g))].sort((a, b) => a - b), [alle])
  const imUmfang = umfang === 'nur' && moduleId ? alle.filter((m) => m.moduleId === moduleId) : alle
  const sichtbar = imUmfang.filter((m) => !jahrgang || m.grade === jahrgang)

  /*
   * EINGESCHRÄNKTE Ansicht (Paket 15, Wunsch der Lehrkraft): Bei „nur Arbeitsblätter" (bzw. der
   * Art der Bibliothek) oder einem Jahrgang stehen nur Bereiche da, in denen – auch tiefer –
   * passende Materialien liegen, samt ihren Oberbereichen; die Zahlen zählen nur diese. Vorher
   * zeigte „nur Arbeitsblätter" jeden Ordner des Fachs, auch leere und solche mit nur
   * Vokabeltests – die Bibliothek sah voller aus, als sie war.
   * Ausnahme: in dieser Sitzung angelegte Bereiche (`sitzung` im Store, gemeinsam für alle
   * Bibliotheken) bleiben sichtbar, auch leer – sonst verschwände der eben angelegte Ordner.
   */
  const sitzung = useThemen((s) => s.sitzung)
  const eingeschraenkt = !!jahrgang || (umfang === 'nur' && !!moduleId)
  const sichtbareBereiche = useMemo(() => {
    if (!eingeschraenkt) return null
    const direkt = new Map<string, number>()
    for (const m of sichtbar) {
      const id = daten.zuordnungen[schluesselVon(m)]?.bereichId
      if (id) direkt.set(id, (direkt.get(id) ?? 0) + 1)
    }
    return bereicheMitInhalt(daten, direkt, [...sitzung, ...angelegt])
  }, [eingeschraenkt, sichtbar, daten, sitzung, angelegt])

  const faecher = useMemo(() => {
    const set = new Set(sichtbar.map(fachVon))
    // Ohne Einschränkung zeigen auch leere Bereiche ihr Fach, eingeschränkt nur die gezeigten (eben angelegte)
    for (const b of daten.bereiche) if (!sichtbareBereiche || sichtbareBereiche.has(b.id)) set.add(b.fachId)
    if (ort.fachId) set.add(ort.fachId)
    return [...set].sort((a, b) => fachAnzeige(a).localeCompare(fachAnzeige(b), 'de'))
  }, [sichtbar, daten, ort.fachId, sichtbareBereiche])

  const offenerBereich = ort.bereichId ? (daten.bereiche.find((b) => b.id === ort.bereichId) ?? null) : null
  // Gelöschter oder unbekannter Bereich: zurück zur Übersicht
  useEffect(() => {
    if (ort.bereichId && useThemen.getState().geladen && !offenerBereich) setOrt((o) => ({ ...o, bereichId: null }))
  }, [ort.bereichId, offenerBereich])

  const kinder = (fachId: string, elternId: string | null): Themenbereich[] => kinderVon(daten, fachId, elternId)
  const inBereich = (id: string | null, fachId: string): Material[] =>
    sichtbar.filter((m) => (id ? zuordnung(m) === id : !bereichVon(m) && fachVon(m) === fachId))
  /** Materialien im Bereich UND seinen Unterbereichen – die Zahl an einem zugeklappten Ordner */
  const gesamtIn = (b: Themenbereich): number => [b.id, ...nachfahrenVon(daten, b.id)].reduce((n, id) => n + inBereich(id, b.fachId).length, 0)
  const istOffen = (k: string): boolean => offen.includes(k)
  /** Eingeschränkt (Art, Jahrgang) nur Bereiche mit passendem Inhalt – oder die gerade angelegt wurden (siehe `sichtbareBereiche`) */
  const zeigen = (b: Themenbereich): boolean => !sichtbareBereiche || sichtbareBereiche.has(b.id)
  const reihenKey = (id: string | null, fachId: string): string => id ?? `ohne:${fachId}`
  const sortiert = (liste: Material[], key: string): Material[] => sortiere(liste, sortierung, daten.reihenfolge[key], arten())

  // ---------- Auswahl ----------

  const auswaehlen = (k: string, bereich: boolean, liste: string[]): void => {
    if (bereich && letzte && liste.includes(letzte)) {
      const [a, b] = [liste.indexOf(letzte), liste.indexOf(k)].sort((x, y) => x - y)
      setAuswahl([...new Set([...auswahl, ...liste.slice(a, b + 1)])])
    } else setAuswahl(auswahl.includes(k) ? auswahl.filter((x) => x !== k) : [...auswahl, k])
    setLetzte(k)
  }
  const auswahlEnde = (): void => {
    setAuswahl([])
    setAuswahlModus(false)
  }
  useEffect(() => {
    if (!auswahl.length) return
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') auswahlEnde()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [auswahl.length])

  // ---------- Ziehen und Ablegen ----------

  const ablegen = (e: React.DragEvent, ziel: Themenbereich | null): void => {
    e.preventDefault()
    setUeber(null)
    let keys: string[] = []
    try {
      keys = JSON.parse(e.dataTransfer.getData(MIME)) as string[]
    } catch {
      return
    }
    // Was schon von Hand dort liegt, muss nicht noch einmal „verschoben" werden
    const noetig = keys.filter((k) => {
      const z = daten.zuordnungen[k]
      return !(z?.von === 'hand' && z.bereichId === (ziel?.id ?? null))
    })
    if (noetig.length) void verschieben(noetig, ziel)
    setAuswahl([])
  }
  /**
   * Ablageziel für Karten – und für Bereiche (Paket 12): Ein Bereich, der auf einen anderen
   * gezogen wird, liegt danach darunter; auf „Ohne Themenbereich" bzw. das Fach gezogen, steht er
   * oben. Unter sich selbst oder einen eigenen Unterbereich geht nicht – dort gibt es keine Marke.
   */
  const ablageZiel = (id: string, ziel: Themenbereich | null): React.HTMLAttributes<HTMLElement> & { 'data-ablage': string; 'data-ueber': boolean } => ({
    'data-ablage': id,
    'data-ueber': ueber === id,
    onDragOver: (e) => {
      const karte = e.dataTransfer.types.includes(MIME)
      const bereich = e.dataTransfer.types.includes(MIME_BEREICH)
      if (!karte && !bereich) return
      if (bereich && ziel && gezogenerBereich && (gezogenerBereich === ziel.id || nachfahrenVon(daten, gezogenerBereich).includes(ziel.id))) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      if (ueber !== id) setUeber(id)
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setUeber((u) => (u === id ? null : u))
    },
    onDrop: (e) => {
      const bereichId = e.dataTransfer.getData(MIME_BEREICH)
      if (bereichId) {
        e.preventDefault()
        e.stopPropagation()
        setUeber(null)
        setGezogenerBereich(null)
        const b = daten.bereiche.find((x) => x.id === bereichId)
        if (b && b.id !== ziel?.id) void bereichUmhaengen(b, ziel)
        return
      }
      e.stopPropagation()
      ablegen(e, ziel)
    }
  })
  // Welcher Bereich gerade gezogen wird – dataTransfer lässt sich beim Überfahren nicht lesen
  const [gezogenerBereich, setGezogenerBereich] = useState<string | null>(null)

  // ---------- Eine Karte ----------

  const karte = (m: Material, liste: string[], reihe: { key: string; bereich: Themenbereich | null } | null): React.JSX.Element => {
    const k = schluesselVon(m)
    const gewaehlt = auswahl.includes(k)
    const z = daten.zuordnungen[k]
    const eigen = m.moduleId === moduleId && renderEigen
    const umsortierbar = reihe && sortierung === 'eigen'
    return (
      <Box
        key={k}
        className="material-huelle"
        data-art={m.moduleId}
        data-material={m.name}
        data-ausgewaehlt={gewaehlt}
        style={{ '--art': artFarbe(m.moduleId) } as React.CSSProperties}
        draggable
        onDragStart={(e) => {
          const keys = gewaehlt ? auswahl : [k]
          e.dataTransfer.setData(MIME, JSON.stringify(keys))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onClickCapture={(e) => {
          if (!(auswahlModus || e.ctrlKey || e.metaKey || e.shiftKey)) return
          e.preventDefault()
          e.stopPropagation()
          auswaehlen(k, e.shiftKey, liste)
        }}
        {...(umsortierbar
          ? {
              onDragOver: (e: React.DragEvent) => {
                if (!e.dataTransfer.types.includes(MIME)) return
                e.preventDefault()
                e.stopPropagation()
                if (ueber !== `vor:${k}`) setUeber(`vor:${k}`)
              },
              onDrop: (e: React.DragEvent) => {
                e.preventDefault()
                e.stopPropagation()
                setUeber(null)
                let keys: string[] = []
                try {
                  keys = JSON.parse(e.dataTransfer.getData(MIME)) as string[]
                } catch {
                  return
                }
                if (keys.includes(k)) return
                const fremd = keys.filter((x) => !liste.includes(x))
                // Aus einem anderen Bereich hereingezogen: erst verschieben, dann einreihen
                if (fremd.length) void verschieben(fremd, reihe.bereich)
                void reihenfolgeSetzen(reihe.key, umstellen(liste, keys, k))
                setAuswahl([])
              },
              'data-einfuegen': ueber === `vor:${k}`
            }
          : {})}
      >
        {auswahlModus && <Checkbox className="material-haken" checked={gewaehlt} readOnly aria-label={`„${m.name}“ auswählen`} tabIndex={-1} />}
        {z?.von === 'auto' && z.bereichId && (
          <Tooltip label="Automatisch einsortiert – durch Verschieben von Hand festlegen" withinPortal>
            <span className="material-auto" aria-label="automatisch einsortiert">
              <IconWand size={12} />
            </span>
          </Tooltip>
        )}
        {eigen ? renderEigen(m) : <FremdKarte material={m} onVerschieben={() => setVerschiebenFuer([k])} />}
      </Box>
    )
  }

  const liste_ = (materialien: Material[], reihe: { key: string; bereich: Themenbereich | null } | null): React.JSX.Element => {
    const keys = materialien.map(schluesselVon)
    const inhalt = materialien.map((m) => karte(m, keys, reihe))
    return darstellung === 'karten' && moduleId ? (
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {inhalt}
      </SimpleGrid>
    ) : (
      <Stack gap="xs">{inhalt}</Stack>
    )
  }

  const neuHier = async (b: Themenbereich, modulId?: string): Promise<void> => {
    try {
      // Das neue Material beginnt im Fach des Bereichs (Rest aus Paket 10b)
      setzeFachVorgabe(modulId ?? moduleId ?? '', b.fachId)
      const id = modulId && modulId !== moduleId ? await neuAnlegen(modulId) : onNeu ? await onNeu() : null
      if (id) await neuImBereich(modulId ?? moduleId ?? '', id, b)
    } catch (e) {
      notifyError(e)
    }
  }

  const verschiebenAus = (eintragId: string): void => {
    if (moduleId) setVerschiebenFuer(auswahl.includes(materialSchluessel(moduleId, eintragId)) ? auswahl : [materialSchluessel(moduleId, eintragId)])
  }

  // ---------- Kopfleiste: Jahrgang, Umfang, Auswahl ----------

  const kopf = (
    <Group justify="space-between" gap="sm" mb="sm" wrap="wrap" className="themen-kopf">
      <Group gap={6} wrap="wrap">
        {jahrgaenge.length > 1 || jahrgang ? (
          <Chip.Group multiple={false} value={jahrgang ? String(jahrgang) : 'alle'} onChange={(v) => setJahrgang(v === 'alle' ? null : Number(v))}>
            <Group gap={6} wrap="wrap" aria-label="Jahrgang">
              <Chip value="alle" size="xs" variant="outline">
                Alle Jahrgänge
              </Chip>
              {[...new Set([...jahrgaenge, ...(jahrgang ? [jahrgang] : [])])]
                .sort((a, b) => a - b)
                .map((g) => (
                  <Chip key={g} value={String(g)} size="xs" variant="outline" data-jahrgang={g}>
                    Klasse {g}
                  </Chip>
                ))}
            </Group>
          </Chip.Group>
        ) : null}
      </Group>
      <Group gap="xs" wrap="wrap">
        {moduleId && artPlural && (
          <SegmentedControl
            size="xs"
            value={umfang}
            onChange={(v) => setUmfang(v as 'nur' | 'alle')}
            aria-label="Welche Materialien"
            data={[
              { value: 'nur', label: `nur ${artPlural}` },
              { value: 'alle', label: 'alle Materialien' }
            ]}
          />
        )}
        <Tooltip label="Mehrere Materialien auswählen (auch mit Strg- oder Umschalt-Klick)">
          <Button
            size="compact-sm"
            variant={auswahlModus ? 'filled' : 'default'}
            leftSection={<IconListCheck size={14} />}
            onClick={() => (auswahlModus ? auswahlEnde() : setAuswahlModus(true))}
          >
            Auswählen
          </Button>
        </Tooltip>
      </Group>
    </Group>
  )

  const auswahlLeiste = auswahl.length > 0 && (
    <Card withBorder padding="xs" mb="sm" className="themen-auswahl">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Text size="sm" fw={600}>
          {auswahl.length === 1 ? '1 Material ausgewählt' : `${auswahl.length} Materialien ausgewählt`} – auf einen Ordner ziehen oder:
        </Text>
        <Group gap="xs">
          <Button size="compact-sm" leftSection={<IconFolderShare size={14} />} onClick={() => setVerschiebenFuer(auswahl)}>
            Verschieben nach …
          </Button>
          <Button size="compact-sm" variant="default" leftSection={<IconX size={14} />} onClick={auswahlEnde}>
            Auswahl aufheben
          </Button>
        </Group>
      </Group>
    </Card>
  )

  // Leere Bibliothek eines Programms: Den Hinweis dazu gibt die Bibliothek selbst
  const leer = geladen !== null && sichtbar.length === 0 && !(moduleId && umfang === 'nur' && eigene.length === 0 && !jahrgang)

  // ---------- Baum (Paket 12) ----------

  const neuerBereichZeile = (fachId: string, elternId: string | null, tiefe: number): React.ReactNode =>
    neuerBereich?.fachId === fachId && neuerBereich.elternId === elternId ? (
      <NeuerBereichZeile
        tiefe={tiefe}
        unter={elternId ? daten.bereiche.find((b) => b.id === elternId)?.name : undefined}
        wert={neuerBereich.name}
        onChange={(name) => setNeuerBereich({ fachId, elternId, name })}
        onAbbrechen={() => setNeuerBereich(null)}
        onAnlegen={async () => {
          const b = await bereichAnlegen(fachId, neuerBereich.name, elternId)
          if (b) {
            setNeuerBereich(null)
            setAngelegt((a) => [...a, b.id])
            // Fach und alle Oberbereiche aufklappen – der neue Bereich soll sofort zu sehen sein
            oeffne([
              `fach:${fachId}`,
              ...pfadVon(useThemen.getState().daten, b.id)
                .slice(0, -1)
                .map((x) => `bereich:${x.id}`)
            ])
          }
        }}
      />
    ) : null

  /** Die Bereiche unter `elternId` als aufklappbare Zeilen – aufgeklappt mit Unterbereichen und Materialien */
  const baum = (fachId: string, elternId: string | null, tiefe: number): React.ReactNode => {
    const liste = kinder(fachId, elternId).filter(zeigen)
    return (
      <>
        {liste.map((b) => {
          const auf = istOffen(`bereich:${b.id}`)
          const direkt = sortiert(inBereich(b.id, fachId), b.id)
          const hatInhalt = direkt.length > 0 || kinder(fachId, b.id).some(zeigen)
          return (
            <BaumZeile
              key={b.id}
              bereich={b}
              tiefe={tiefe}
              anzahl={gesamtIn(b)}
              unter={nachfahrenVon(daten, b.id).filter((id) => !sichtbareBereiche || sichtbareBereiche.has(id)).length}
              offen={auf}
              neu={angelegt[angelegt.length - 1] === b.id}
              aufklappbar={hatInhalt || neuerBereich?.elternId === b.id}
              onUmschalten={() => umschalten(`bereich:${b.id}`)}
              onOeffnen={() => setOrt({ fachId, bereichId: b.id })}
              onUnterbereich={() => {
                setNeuerBereich({ fachId, elternId: b.id, name: '' })
                oeffne([`bereich:${b.id}`])
              }}
              ablage={ablageZiel(b.id, b)}
              onZiehen={(an) => setGezogenerBereich(an ? b.id : null)}
            >
              {auf && (
                <Stack gap={6} mt={4} mb={6}>
                  {baum(fachId, b.id, tiefe + 1)}
                  {neuerBereichZeile(fachId, b.id, tiefe + 1)}
                  {direkt.length > 0 && <Box pl={(tiefe + 1) * 20 + 8}>{liste_(direkt, { key: b.id, bereich: b })}</Box>}
                </Stack>
              )}
            </BaumZeile>
          )
        })}
      </>
    )
  }

  // ---------- Geöffneter Bereich ----------

  if (offenerBereich) {
    const b = offenerBereich
    const inhalt = sortiert(inBereich(b.id, b.fachId), b.id)
    const pfad = pfadVon(daten, b.id)
    const eltern = pfad.length > 1 ? pfad[pfad.length - 2] : null
    const geschwister = kinder(b.fachId, b.elternId ?? null).filter((x) => x.id !== b.id && zeigen(x))
    const unter = kinder(b.fachId, b.id).filter(zeigen)
    return (
      <VerschiebenKontext.Provider value={verschiebenAus}>
        {kopf}
        <BereichKopf
          bereich={b}
          pfad={pfad}
          anzahl={gesamtIn(b)}
          onZurueck={(fach) => setOrt({ fachId: fach ? b.fachId : null, bereichId: null })}
          onPfad={(x) => setOrt({ fachId: x.fachId, bereichId: x.id })}
          sortierung={sortierung}
          onSortierung={setSortierung}
          onUnterbereich={() => setNeuerBereich({ fachId: b.fachId, elternId: b.id, name: '' })}
          neu={
            moduleId && onNeu ? (
              <Button size="compact-sm" leftSection={<IconFilePlus size={14} />} onClick={() => void neuHier(b)}>
                Neu in diesem Bereich
              </Button>
            ) : (
              <Menu withinPortal position="bottom-end">
                <Menu.Target>
                  <Button size="compact-sm" leftSection={<IconFilePlus size={14} />}>
                    Neu in diesem Bereich …
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {sichtbareProgramme
                    .filter((m) => arten().includes(m.id))
                    .map((m) => (
                      <Menu.Item key={m.id} onClick={() => void neuHier(b, m.id)}>
                        {m.name}
                      </Menu.Item>
                    ))}
                </Menu.Dropdown>
              </Menu>
            )
          }
        />
        {auswahlLeiste}
        {/* Ablageziele: der Oberbereich, die Nachbarn und „Ohne Themenbereich" */}
        <Group gap={6} mb="md" wrap="wrap" className="themen-ziele">
          <Text size="xs" c="dimmed">
            Ablegen in:
          </Text>
          {eltern && (
            <UnstyledButton className="themen-ziel" onClick={() => setOrt({ fachId: eltern.fachId, bereichId: eltern.id })} {...ablageZiel(eltern.id, eltern)}>
              <IconArrowBarUp size={14} /> {eltern.name}
            </UnstyledButton>
          )}
          {geschwister.map((x) => (
            <UnstyledButton key={x.id} className="themen-ziel" onClick={() => setOrt({ fachId: x.fachId, bereichId: x.id })} {...ablageZiel(x.id, x)}>
              <OrdnerSymbol fach={x.fachId} groesse={14} /> {x.name}
            </UnstyledButton>
          ))}
          <UnstyledButton className="themen-ziel" onClick={() => setOrt({ fachId: b.fachId, bereichId: null })} {...ablageZiel(`ohne:${b.fachId}`, null)}>
            Ohne Themenbereich
          </UnstyledButton>
        </Group>
        {(unter.length > 0 || neuerBereich?.elternId === b.id) && (
          <Stack gap={6} mb="md" data-unterbereiche>
            <Text size="sm" fw={600} c="dimmed">
              Unterbereiche
            </Text>
            {baum(b.fachId, b.id, 0)}
            {neuerBereichZeile(b.fachId, b.id, 0)}
          </Stack>
        )}
        {inhalt.length ? (
          liste_(inhalt, { key: b.id, bereich: b })
        ) : (
          <Text c="dimmed" size="sm" ta="center" py="xl" data-bereich-leer>
            {jahrgang
              ? `In Klasse ${jahrgang} liegt hier noch nichts.`
              : unter.length
                ? 'Direkt in diesem Bereich liegt nichts – die Materialien stehen in den Unterbereichen.'
                : 'Noch leer. Materialien hierher ziehen oder „Verschieben nach …" im ⋯-Menü wählen.'}
          </Text>
        )}
        {sortierung === 'eigen' && inhalt.length > 1 && (
          <Text size="xs" c="dimmed" mt="xs">
            Eigene Reihenfolge: Karten auf eine andere Karte ziehen, um sie davor einzureihen.
          </Text>
        )}
        <VerschiebenDialog
          schluessel={verschiebenFuer}
          materialien={alle}
          fachVon={fachVon}
          onClose={() => setVerschiebenFuer(null)}
          onFertig={() => setAuswahl([])}
        />
      </VerschiebenKontext.Provider>
    )
  }

  // ---------- Übersicht: Fächer mit ihrem Baum ----------

  const gezeigteFaecher = ort.fachId ? faecher.filter((f) => f === ort.fachId) : faecher
  return (
    <VerschiebenKontext.Provider value={verschiebenAus}>
      {kopf}
      {auswahlLeiste}
      {ort.fachId && (
        <Breadcrumbs separator="›" mb="sm">
          <Anchor component="button" size="sm" onClick={() => setOrt({ fachId: null, bereichId: null })}>
            Alle Fächer
          </Anchor>
          <Text size="sm" fw={600}>
            {fachAnzeige(ort.fachId)}
          </Text>
        </Breadcrumbs>
      )}
      {leer && gezeigteFaecher.length === 0 && (
        <Text c="dimmed" size="sm" ta="center" py="xl" data-themen-leer>
          {jahrgang ? `Für Klasse ${jahrgang} gibt es hier noch nichts.` : 'Noch keine Materialien.'}
        </Text>
      )}
      {gezeigteFaecher.map((fachId) => {
        const oben = kinder(fachId, null).filter(zeigen)
        const ohne = sortiert(inBereich(null, fachId), reihenKey(null, fachId))
        // Nur ein Fach zu sehen (Sprung, Filter): dann gleich offen – ein einzelner zugeklappter Kopf wäre ein Klick zu viel
        const auf = istOffen(`fach:${fachId}`) || gezeigteFaecher.length === 1
        const zahl = sichtbar.filter((m) => fachVon(m) === fachId).length
        return (
          <Box key={fachId} mb="md" data-fach-abschnitt={fachId} data-offen={auf}>
            <Group justify="space-between" gap="xs" mt="sm" mb="xs" wrap="nowrap" {...ablageZiel(`fach:${fachId}`, null)}>
              <UnstyledButton
                onClick={() => umschalten(`fach:${fachId}`)}
                aria-expanded={auf}
                aria-label={`${fachAnzeige(fachId)} ${auf ? 'zuklappen' : 'aufklappen'}`}
                style={{ flex: 1, minWidth: 0 }}
              >
                <Group gap="xs" wrap="nowrap" className="fach-ueberschrift">
                  <IconChevronRight size={16} className="themen-pfeil" data-offen={auf} />
                  <FachPunkt fach={fachId} groesse={12} />
                  <Title order={4}>{fachAnzeige(fachId)}</Title>
                  <Text size="xs" c="dimmed">
                    {oben.length ? `${oben.length === 1 ? '1 Bereich' : `${oben.length} Bereiche`} · ` : ''}
                    {anzahlText(zahl)}
                  </Text>
                </Group>
              </UnstyledButton>
              <FachMenue
                fachId={fachId}
                materialien={() => alle.map((m) => ({ ...m, fachId: fachVon(m) }))}
                onNeu={() => {
                  setNeuerBereich({ fachId, elternId: null, name: '' })
                  oeffne([`fach:${fachId}`])
                }}
              />
            </Group>

            {/* Der Vorschlag steht auch am zugeklappten Fach – sonst sähe ihn niemand */}
            <VorschlagHinweis fachId={fachId} alle={alle} jahrgang={jahrgang} />

            <Collapse expanded={auf} keepMounted={false}>
              <Stack gap={6} mb="sm" className="themen-baum">
                {baum(fachId, null, 0)}
                {neuerBereichZeile(fachId, null, 0)}
              </Stack>
              {ohne.length > 0 && (
                <Box className="themen-ohne" {...(oben.length ? ablageZiel(`ohne:${fachId}`, null) : {})}>
                  {oben.length > 0 && (
                    <Text size="sm" fw={600} c="dimmed" mb={6}>
                      Ohne Themenbereich ({ohne.length})
                    </Text>
                  )}
                  {liste_(ohne, { key: reihenKey(null, fachId), bereich: null })}
                </Box>
              )}
            </Collapse>
          </Box>
        )
      })}
      <VerschiebenDialog
        schluessel={verschiebenFuer}
        materialien={alle}
        fachVon={fachVon}
        onClose={() => setVerschiebenFuer(null)}
        onFertig={() => setAuswahl([])}
      />
    </VerschiebenKontext.Provider>
  )
}

// ---------- Bausteine ----------

/** Ordnersymbol in der Fachfarbe */
function OrdnerSymbol({ fach, groesse = 28, offen }: { fach: string; groesse?: number; offen?: boolean }): React.JSX.Element {
  const farbe = useFachFarbe(fach) ?? undefined
  const Symbol = offen ? IconFolderOpen : IconFolder
  return <Symbol size={groesse} color={farbe} style={{ flexShrink: 0, verticalAlign: 'middle' }} />
}

/**
 * Ein Themenbereich als Zeile im Baum (Paket 12): Pfeil klappt auf/zu, der Name öffnet den
 * Bereich, Karten und andere Bereiche lassen sich darauf ablegen, die Zeile selbst lässt sich
 * auf einen anderen Bereich ziehen.
 */
function BaumZeile({
  bereich: b,
  tiefe,
  anzahl,
  unter,
  offen,
  neu,
  aufklappbar,
  onUmschalten,
  onOeffnen,
  onUnterbereich,
  ablage,
  onZiehen,
  children
}: {
  bereich: Themenbereich
  tiefe: number
  anzahl: number
  /** Zahl der gezeigten Unterbereiche (beliebig tief) – in der eingeschränkten Ansicht nur die mit Inhalt */
  unter: number
  offen: boolean
  /** Eben angelegt: hervorheben und in den sichtbaren Bereich holen */
  neu?: boolean
  aufklappbar: boolean
  onUmschalten: () => void
  onOeffnen: () => void
  onUnterbereich: () => void
  ablage: React.HTMLAttributes<HTMLElement>
  onZiehen: (an: boolean) => void
  children?: React.ReactNode
}): React.JSX.Element {
  const [umbenennen, setUmbenennen] = useState<string | null>(null)
  const [loeschen, setLoeschen] = useState(false)
  const [verschieben, setVerschieben] = useState(false)
  const zeile = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (neu) zeile.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [neu])
  return (
    <div data-baum-tiefe={tiefe}>
      <Card
        ref={zeile}
        data-neu={neu || undefined}
        withBorder
        padding={6}
        pl={8 + tiefe * 20}
        className="themen-ordner themen-zeile"
        data-bereich={b.name}
        draggable={umbenennen === null}
        onDragStart={(e) => {
          e.dataTransfer.setData(MIME_BEREICH, b.id)
          e.dataTransfer.effectAllowed = 'move'
          onZiehen(true)
        }}
        onDragEnd={() => onZiehen(false)}
        {...ablage}
      >
        <Group gap={6} wrap="nowrap" justify="space-between">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="gray"
              onClick={onUmschalten}
              aria-expanded={offen}
              aria-label={`„${b.name}“ ${offen ? 'zuklappen' : 'aufklappen'}`}
              style={{ visibility: aufklappbar ? 'visible' : 'hidden' }}
            >
              <IconChevronRight size={14} className="themen-pfeil" data-offen={offen} />
            </ActionIcon>
            {umbenennen !== null ? (
              <TextInput
                size="xs"
                aria-label="Neuer Name des Themenbereichs"
                value={umbenennen}
                autoFocus
                style={{ flex: 1 }}
                onChange={(e) => setUmbenennen(e.currentTarget.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Escape') setUmbenennen(null)
                  if (e.key === 'Enter' && umbenennen.trim() && (await bereichUmbenennen(b, umbenennen))) setUmbenennen(null)
                }}
                onBlur={() => setUmbenennen(null)}
              />
            ) : (
              <UnstyledButton onClick={onOeffnen} style={{ minWidth: 0, flex: 1 }} aria-label={`Themenbereich „${b.name}“ öffnen`}>
                <Group gap={8} wrap="nowrap">
                  <OrdnerSymbol fach={b.fachId} groesse={20} offen={offen} />
                  {/* Gekürzter Lehrplantitel (Paket 13): der volle Wortlaut als Tooltip */}
                  <Tooltip label={b.wortlaut ? `Im Lehrplan: ${b.wortlaut}` : b.name} multiline maw={420} openDelay={400} disabled={!b.wortlaut}>
                    <Text fw={600} size="sm" truncate data-wortlaut={b.wortlaut}>
                      {b.name}
                    </Text>
                  </Tooltip>
                  {b.herkunft && (
                    <Tooltip
                      label={`Automatisch angelegt (${b.herkunft === 'lehrplan' ? 'Lehrplan' : b.herkunft === 'lehrwerk' ? 'Lehrwerk' : 'Grammatik'}) – umbenennen und verschieben wie jeden anderen Bereich`}
                    >
                      <span className="themen-herkunft" aria-label="automatisch angelegt">
                        <IconWand size={12} />
                      </span>
                    </Tooltip>
                  )}
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                    {anzahl ? anzahlText(anzahl) : 'leer'}
                    {unter ? ` · ${unter === 1 ? '1 Unterbereich' : `${unter} Unterbereiche`}` : ''}
                  </Text>
                </Group>
              </UnstyledButton>
            )}
          </Group>
          <BereichMenue
            bereich={b}
            onUmbenennen={() => setUmbenennen(b.name)}
            onLoeschen={() => setLoeschen(true)}
            onUnterbereich={onUnterbereich}
            onVerschieben={() => setVerschieben(true)}
          />
        </Group>
        {loeschen && <LoeschenRueckfrage bereich={b} onAbbrechen={() => setLoeschen(false)} />}
      </Card>
      {children}
      <BereichVerschiebenDialog bereich={verschieben ? b : null} onClose={() => setVerschieben(false)} />
    </div>
  )
}

function NeuerBereichZeile({
  tiefe,
  unter,
  wert,
  onChange,
  onAbbrechen,
  onAnlegen
}: {
  tiefe: number
  /** Name des Oberbereichs – dann heißt es „Unterbereich von …" */
  unter?: string
  wert: string
  onChange: (s: string) => void
  onAbbrechen: () => void
  onAnlegen: () => void
}): React.JSX.Element {
  return (
    <Card withBorder padding={6} pl={8 + tiefe * 20} className="themen-ordner-neu">
      <Group gap={6} wrap="nowrap">
        <TextInput
          size="xs"
          style={{ flex: 1 }}
          placeholder={unter ? `Unterbereich von „${unter}“, z. B. Ursachen` : 'Name, z. B. Ökologie'}
          aria-label={unter ? 'Name des neuen Unterbereichs' : 'Name des neuen Themenbereichs'}
          value={wert}
          autoFocus
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && wert.trim()) onAnlegen()
            if (e.key === 'Escape') onAbbrechen()
          }}
        />
        <Button size="compact-xs" disabled={!wert.trim()} onClick={onAnlegen}>
          Anlegen
        </Button>
        <Button size="compact-xs" variant="default" onClick={onAbbrechen}>
          Abbrechen
        </Button>
      </Group>
    </Card>
  )
}

/** ⋯ am Bereich: Unterbereich anlegen, Umbenennen, Verschieben, Löschen (am Rechner) */
function BereichMenue({
  bereich,
  onUmbenennen,
  onLoeschen,
  onUnterbereich,
  onVerschieben
}: {
  bereich: Themenbereich
  onUmbenennen: () => void
  onLoeschen: () => void
  onUnterbereich?: () => void
  onVerschieben?: () => void
}): React.JSX.Element {
  // Alle vier Punkte öffnen ein Feld, eine Rückfrage oder einen Dialog – das Menü darf den Fokus nicht zurückholen (shared/menueFokus.ts)
  const { menue, weiter } = useMenueFokus()
  return (
    <Menu position="bottom-end" withinPortal {...menue}>
      <Menu.Target>
        <ActionIcon variant="subtle" aria-label={`Weitere Aktionen für den Themenbereich „${bereich.name}“`}>
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {onUnterbereich && (
          <Menu.Item leftSection={<IconFolderPlus size={14} />} onClick={weiter(onUnterbereich)}>
            Unterbereich anlegen
          </Menu.Item>
        )}
        <Menu.Item leftSection={<IconPencil size={14} />} onClick={weiter(onUmbenennen)}>
          Umbenennen
        </Menu.Item>
        {onVerschieben && (
          <Menu.Item leftSection={<IconFolderShare size={14} />} onClick={weiter(onVerschieben)}>
            Verschieben nach …
          </Menu.Item>
        )}
        {/* Löschen gibt es wie bei den Materialien nur am Rechner */}
        {!imNetz() && (
          <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={weiter(onLoeschen)}>
            Löschen
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}

/** Rückfrage direkt am Bereich wie in der Bibliothek (Enter bestätigt, Esc bricht ab); die Materialien bleiben erhalten */
function LoeschenRueckfrage({ bereich, onAbbrechen }: { bereich: Themenbereich; onAbbrechen: () => void }): React.JSX.Element {
  const unter = useThemen((s) => nachfahrenVon(s.daten, bereich.id).length)
  const eltern = useThemen((s) => (bereich.elternId ? s.daten.bereiche.find((b) => b.id === bereich.elternId) : undefined))
  const los = (): void => {
    onAbbrechen()
    void bereichLoeschen(bereich)
  }
  useConfirmKeys(true, los, onAbbrechen)
  return (
    <Alert color="red" mt="xs" p="xs" data-bereich-loeschen>
      <Stack gap={6}>
        <Text size="sm">
          „{bereich.name}“{unter ? ` samt ${unter === 1 ? 'einem Unterbereich' : `${unter} Unterbereichen`}` : ''} löschen? Die Materialien bleiben erhalten und
          stehen danach {eltern ? `in „${eltern.name}“` : 'unter „Ohne Themenbereich“'}.
        </Text>
        <Group gap="xs" justify="flex-end">
          <Button size="xs" variant="default" onClick={onAbbrechen}>
            Abbrechen
          </Button>
          <Button size="xs" color="red" autoFocus onClick={los}>
            Löschen
          </Button>
        </Group>
      </Stack>
    </Alert>
  )
}

/** Kopf eines geöffneten Bereichs: Pfad, Sortierung, „Neu in diesem Bereich", ⋯ */
function BereichKopf({
  bereich: b,
  pfad,
  anzahl,
  onZurueck,
  onPfad,
  sortierung,
  onSortierung,
  onUnterbereich,
  neu
}: {
  bereich: Themenbereich
  /** Von oben bis zu diesem Bereich (Paket 12) */
  pfad: Themenbereich[]
  anzahl: number
  onZurueck: (fach: boolean) => void
  onPfad: (b: Themenbereich) => void
  sortierung: Sortierung
  onSortierung: (s: Sortierung) => void
  onUnterbereich: () => void
  neu: React.ReactNode
}): React.JSX.Element {
  const [umbenennen, setUmbenennen] = useState<string | null>(null)
  const [loeschen, setLoeschen] = useState(false)
  const [verschieben, setVerschieben] = useState(false)
  return (
    <Stack gap="xs" mb="sm">
      <Breadcrumbs separator="›" data-pfad={pfad.map((x) => x.name).join(' › ')}>
        <Anchor component="button" size="sm" onClick={() => onZurueck(false)}>
          Alle Fächer
        </Anchor>
        <Anchor component="button" size="sm" onClick={() => onZurueck(true)}>
          <Group gap={6} wrap="nowrap">
            <FachPunkt fach={b.fachId} />
            {fachAnzeige(b.fachId)}
          </Group>
        </Anchor>
        {pfad.slice(0, -1).map((x) => (
          <Anchor key={x.id} component="button" size="sm" onClick={() => onPfad(x)}>
            {x.name}
          </Anchor>
        ))}
        <Text size="sm" fw={600}>
          {b.name}
        </Text>
      </Breadcrumbs>
      <Group justify="space-between" wrap="wrap" gap="sm">
        {umbenennen !== null ? (
          <TextInput
            aria-label="Neuer Name des Themenbereichs"
            value={umbenennen}
            autoFocus
            onChange={(e) => setUmbenennen(e.currentTarget.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Escape') setUmbenennen(null)
              if (e.key === 'Enter' && umbenennen.trim() && (await bereichUmbenennen(b, umbenennen))) setUmbenennen(null)
            }}
            onBlur={() => setUmbenennen(null)}
          />
        ) : (
          <Group gap="sm" wrap="nowrap" data-offener-bereich={b.name}>
            <OrdnerSymbol fach={b.fachId} offen />
            <Title order={3}>{b.name}</Title>
            <Text c="dimmed" size="sm">
              {anzahlText(anzahl)}
            </Text>
            <BereichMenue
              bereich={b}
              onUmbenennen={() => setUmbenennen(b.name)}
              onLoeschen={() => setLoeschen(true)}
              onUnterbereich={onUnterbereich}
              onVerschieben={() => setVerschieben(true)}
            />
          </Group>
        )}
        <Group gap="xs" wrap="wrap">
          <Select
            size="xs"
            w={190}
            aria-label="Reihenfolge im Bereich"
            data={SORTIERUNGEN}
            value={sortierung}
            allowDeselect={false}
            onChange={(v) => v && onSortierung(v as Sortierung)}
          />
          {neu}
        </Group>
      </Group>
      {loeschen && <LoeschenRueckfrage bereich={b} onAbbrechen={() => setLoeschen(false)} />}
      <BereichVerschiebenDialog bereich={verschieben ? b : null} onClose={() => setVerschieben(false)} />
    </Stack>
  )
}

/**
 * „Verschieben nach …" für einen BEREICH (Paket 12): unter einen anderen Bereich desselben Fachs
 * oder ganz nach oben. Der Bereich selbst und seine Unterbereiche stehen nicht zur Wahl.
 */
function BereichVerschiebenDialog({ bereich, onClose }: { bereich: Themenbereich | null; onClose: () => void }): React.JSX.Element {
  const daten = useThemen((s) => s.daten)
  const gesperrt = bereich ? new Set([bereich.id, ...nachfahrenVon(daten, bereich.id)]) : new Set<string>()
  const zeilen = (elternId: string | null, tiefe: number): React.ReactNode[] =>
    bereich
      ? kinderVon(daten, bereich.fachId, elternId)
          .filter((b) => !gesperrt.has(b.id))
          .flatMap((b) => [
            <Button
              key={b.id}
              variant={bereich.elternId === b.id ? 'light' : 'default'}
              justify="flex-start"
              pl={12 + tiefe * 20}
              leftSection={<OrdnerSymbol fach={b.fachId} groesse={18} />}
              onClick={() => {
                onClose()
                void bereichUmhaengen(bereich, b)
              }}
            >
              {b.name}
              {bereich.elternId === b.id ? ' (hier)' : ''}
            </Button>,
            ...zeilen(b.id, tiefe + 1)
          ])
      : []
  return (
    <Modal opened={bereich !== null} onClose={onClose} title={bereich ? `„${bereich.name}“ verschieben nach …` : ''} size="md">
      <Stack gap="xs" data-bereich-verschieben-dialog>
        <Button
          variant={bereich?.elternId ? 'default' : 'light'}
          justify="flex-start"
          leftSection={<IconArrowBarUp size={16} />}
          onClick={() => {
            onClose()
            if (bereich) void bereichUmhaengen(bereich, null)
          }}
        >
          Oberste Ebene{bereich ? ` in ${fachAnzeige(bereich.fachId)}` : ''}
          {bereich && !bereich.elternId ? ' (hier)' : ''}
        </Button>
        {zeilen(null, 0)}
      </Stack>
    </Modal>
  )
}

/** ⋯ am Fach: neuer Bereich, Automatik ein/aus, alles neu einsortieren */
function FachMenue({ fachId, materialien, onNeu }: { fachId: string; materialien: () => Material[]; onNeu: () => void }): React.JSX.Element {
  // Standard seit Paket 12: an (nur ausdrücklich ausgeschaltet steht false)
  const automatik = useThemen((s) => automatikAn(s.daten, fachId))
  const [einsortieren, setEinsortieren] = useState(false)
  // „Alle … einsortieren" öffnet eine Rückfrage – das Menü darf den Fokus nicht aus ihr herausholen
  const { menue, weiter } = useMenueFokus()
  return (
    <Group gap={4} wrap="nowrap">
      <Button size="compact-sm" variant="subtle" leftSection={<IconFolderPlus size={14} />} onClick={onNeu}>
        Themenbereich
      </Button>
      <Menu position="bottom-end" withinPortal {...menue}>
        <Menu.Target>
          <ActionIcon variant="subtle" aria-label={`Einstellungen der Themenbereiche in ${fachAnzeige(fachId)}`}>
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconWand size={14} />}
            rightSection={automatik ? '✓' : undefined}
            onClick={() =>
              window.api.themen
                .automatik(fachId, !automatik)
                .then((d) => useThemen.setState({ daten: d }))
                .catch(notifyError)
            }
          >
            Neue Materialien automatisch einsortieren
          </Menu.Item>
          <Menu.Item leftSection={<IconSortAscending size={14} />} onClick={weiter(() => setEinsortieren(true))}>
            Alle Materialien automatisch einsortieren
          </Menu.Item>
          <Menu.Item leftSection={<IconFolderOpen size={14} />} onClick={() => openThemen(fachId)}>
            Alle Materialarten dieses Fachs zeigen
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <EinsortierenRueckfrage
        fachId={fachId}
        offen={einsortieren}
        onClose={() => setEinsortieren(false)}
        onLos={(umfang) => {
          setEinsortieren(false)
          void allesEinsortieren(fachId, materialien(), umfang)
        }}
      />
    </Group>
  )
}

/**
 * Rückfrage vor „Alle Materialien automatisch einsortieren" (Paket 15): Von Hand Zugeordnetes
 * bleibt im Standard, wo es ist – wer es auch neu ordnen lassen will, wählt das ausdrücklich.
 * Rückgängig gibt es danach trotzdem (ein Schritt).
 */
function EinsortierenRueckfrage({
  fachId,
  offen,
  onClose,
  onLos
}: {
  fachId: string
  offen: boolean
  onClose: () => void
  onLos: (umfang: 'auto' | 'alle') => void
}): React.JSX.Element {
  const [umfang, setUmfang] = useState<'auto' | 'alle'>('auto')
  // Bei jedem Öffnen wieder der sichere Standard
  useEffect(() => {
    if (offen) setUmfang('auto')
  }, [offen])
  return (
    <Modal opened={offen} onClose={onClose} title={`Alle Materialien in ${fachAnzeige(fachId)} einsortieren`} size="md">
      <Stack gap="sm" data-einsortieren-rueckfrage>
        <Text size="sm">
          Die Automatik ordnet die Materialien dieses Fachs nach Lehrplan, Lehrwerk und den vorhandenen Themenbereichen neu ein – lokal, ohne KI. Was sie nicht
          sicher zuordnen kann, bleibt, wo es ist.
        </Text>
        <Radio.Group value={umfang} onChange={(v) => setUmfang(v as 'auto' | 'alle')} label="Auch von Hand zugeordnete Materialien neu einsortieren?">
          <Stack gap={6} mt={6}>
            <Radio value="auto" label="Nur automatisch zugeordnete und nicht zugeordnete" data-autofocus />
            <Radio value="alle" label="Alle, auch von Hand zugeordnete" description="Sie gelten danach als automatisch einsortiert." />
          </Stack>
        </Radio.Group>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button leftSection={<IconSortAscending size={14} />} onClick={() => onLos(umfang)}>
            Einsortieren
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Material eines anderen Programms: Programmbild (Name als Tooltip), Titel, Kurzinfo; öffnet im richtigen Programm */
export function FremdKarte({ material: m, onVerschieben }: { material: Material; onVerschieben?: () => void }): React.JSX.Element {
  const p = modul(m.moduleId)
  const oeffnen = (): void => void openDocument(m.moduleId, m.id)
  // „Verschieben nach …" öffnet einen Dialog – das Menü darf den Fokus nicht aus ihm herausholen
  const { menue, weiter } = useMenueFokus()
  return (
    <Card withBorder padding="sm" data-bibliothek-eintrag={m.name}>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        {p?.leistenbild ? (
          <img src={p.leistenbild} width={30} height={30} alt={p.name} title={p.name} draggable={false} style={{ borderRadius: 7, flexShrink: 0 }} />
        ) : (
          p && (
            <Tooltip label={p.name}>
              <span>
                <p.icon size={22} />
              </span>
            </Tooltip>
          )
        )}
        <div
          role="button"
          tabIndex={0}
          title={p?.name}
          aria-label={`„${m.name}“ öffnen (${p?.name ?? ''})`}
          style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
          onClick={oeffnen}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              oeffnen()
            }
          }}
        >
          <Group gap={6} wrap="nowrap">
            <Text fw={600} size="sm" truncate>
              {m.name}
            </Text>
            {m.entwurf && (
              <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                Entwurf
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed" truncate>
            {m.detail}
          </Text>
        </div>
        <Menu position="bottom-end" withinPortal {...menue}>
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label={`Weitere Aktionen für „${m.name}“`}>
              <IconDots size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconFolderOpen size={14} />} onClick={oeffnen}>
              Öffnen in „{p?.name}“
            </Menu.Item>
            {onVerschieben && (
              <Menu.Item leftSection={<IconFolderShare size={14} />} onClick={weiter(onVerschieben)}>
                Verschieben nach …
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Card>
  )
}

/** Alle Bereiche eines Fachs in Baumreihenfolge, mit Tiefe */
function baumListe(daten: { bereiche: Themenbereich[] }, fachId: string): { b: Themenbereich; tiefe: number }[] {
  const out: { b: Themenbereich; tiefe: number }[] = []
  const gehe = (elternId: string | null, tiefe: number): void => {
    for (const b of kinderVon(daten, fachId, elternId)) {
      out.push({ b, tiefe })
      gehe(b.id, tiefe + 1)
    }
  }
  gehe(null, 0)
  return out
}

/** „Verschieben nach …" – für Tastatur und Tablet, wo Ziehen mühsam ist */
function VerschiebenDialog({
  schluessel,
  materialien,
  fachVon,
  onClose,
  onFertig
}: {
  schluessel: string[] | null
  materialien: Material[]
  fachVon: (m: Material) => string
  onClose: () => void
  onFertig: () => void
}): React.JSX.Element {
  const daten = useThemen((s) => s.daten)
  const [neu, setNeu] = useState('')
  const gewaehlt = materialien.filter((m) => schluessel?.includes(schluesselVon(m)))
  const faecher = [...new Set(gewaehlt.map(fachVon))]
  const hier = new Set(gewaehlt.map((m) => daten.zuordnungen[schluesselVon(m)]?.bereichId ?? null))
  const nach = async (ziel: Themenbereich | null): Promise<void> => {
    if (schluessel) await verschieben(schluessel, ziel)
    setNeu('')
    onFertig()
    onClose()
  }
  const titel = gewaehlt.length === 1 ? `„${gewaehlt[0].name}“ verschieben nach …` : `${gewaehlt.length} Materialien verschieben nach …`
  return (
    <Modal opened={schluessel !== null} onClose={onClose} title={titel} size="md">
      <Stack gap="xs" data-verschieben-dialog>
        {faecher.map((fachId) => (
          <Stack key={fachId} gap={4}>
            {faecher.length > 1 && (
              <Text size="xs" fw={600} c="dimmed">
                {fachAnzeige(fachId)}
              </Text>
            )}
            {/* Als Baum eingerückt (Paket 12) – Unterbereiche unter ihrem Oberbereich */}
            {baumListe(daten, fachId).map(({ b, tiefe }, i) => (
              <Button
                key={b.id}
                variant={hier.has(b.id) && hier.size === 1 ? 'light' : 'default'}
                justify="flex-start"
                pl={12 + tiefe * 20}
                leftSection={<OrdnerSymbol fach={b.fachId} groesse={18} />}
                onClick={() => void nach(b)}
                data-autofocus={i === 0 ? true : undefined}
              >
                {b.name}
                {hier.has(b.id) && hier.size === 1 ? ' (hier)' : ''}
              </Button>
            ))}
            <Group gap="xs" wrap="nowrap">
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                placeholder="Neuer Themenbereich …"
                aria-label={`Neuer Themenbereich in ${fachAnzeige(fachId)}`}
                value={neu}
                onChange={(e) => setNeu(e.currentTarget.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !neu.trim()) return
                  const b = await bereichAnlegen(fachId, neu)
                  if (b) await nach(b)
                }}
              />
              <Button
                size="xs"
                variant="default"
                disabled={!neu.trim()}
                onClick={async () => {
                  const b = await bereichAnlegen(fachId, neu)
                  if (b) await nach(b)
                }}
              >
                Anlegen und verschieben
              </Button>
            </Group>
          </Stack>
        ))}
        <Button variant="subtle" color="gray" justify="flex-start" onClick={() => void nach(null)}>
          Ohne Themenbereich
        </Button>
      </Stack>
    </Modal>
  )
}

/**
 * Hinweis mit Vorschlägen: ab 8 Materialien im Fach (bzw. im gefilterten Jahrgang), sofern
 * etwas vorzuschlagen ist. Unaufdringlich: eine Zeile, erst „Ansehen" zeigt die Auswahl. „Nicht
 * jetzt" merkt sich genau diesen Vorschlag; kommen neue Gruppen dazu, erscheint er wieder.
 */
function VorschlagHinweis({ fachId, alle, jahrgang }: { fachId: string; alle: Material[]; jahrgang: number | null }): React.JSX.Element | null {
  const daten = useThemen((s) => s.daten)
  const geladen = useThemen((s) => s.geladen)
  const [offen, setOffen] = useState(false)
  const [abgewaehlt, setAbgewaehlt] = useState<string[]>([])
  const [aus, setAus] = useState<Record<string, string>>(() => lies(VORSCHLAG_AUS_KEY, {}))
  const lehrplan = useLehrplan()
  const schulform = useAppSettings((s) => s.settings.defaults.schoolTypeId)
  const stateId = useAppSettings((s) => s.settings.defaults.stateId)
  const vorschlaege = useMemo(
    () => (geladen ? vorschlagen(alle, daten, fachId, { jahrgang, katalog: katalogFuer(fachId, lehrplan, schulform, stateId) }) : []),
    [alle, daten, fachId, jahrgang, geladen, lehrplan, schulform, stateId]
  )
  const merkmal = vorschlaege.map((v) => `${v.name}:${v.schluessel.length}`).join('|')
  const auswahlKey = `${fachId}|${jahrgang ?? ''}`
  if (!vorschlaege.length || aus[auswahlKey] === merkmal) return null

  const gewaehlt = vorschlaege.filter((v) => !abgewaehlt.includes(v.name))
  const uebernehmen = (liste: Vorschlag[]): void => {
    setOffen(false)
    void vorschlaegeUebernehmen(
      liste.map((v) => ({
        fachId: v.fachId,
        name: v.name,
        bereichId: v.bereichId,
        schluessel: v.schluessel,
        // Oberthemen aus dem Lehrplan: die Ebenen darüber entstehen mit (Paket 12)
        ...(v.pfad?.length ? { pfad: v.pfad, herkunft: v.herkunft } : {})
      })),
      fachId
    )
  }
  const titel = (v: Vorschlag): string =>
    alle
      .filter((m) => v.schluessel.includes(schluesselVon(m)))
      .map((m) => m.name)
      .join(', ')
  const herkunft = (v: Vorschlag): string =>
    v.herkunft === 'bereich'
      ? 'passt zu einem vorhandenen Bereich'
      : v.herkunft === 'lehrplan'
        ? 'Thema aus dem Lehrplan'
        : v.herkunft === 'lehrwerk'
          ? 'Kapitel des Lehrwerks'
          : v.herkunft === 'grammatik'
            ? 'Grammatikthema'
            : 'gemeinsames Stichwort'

  return (
    <Alert variant="light" color="blue" icon={<IconBulb size={18} />} mb="sm" p="xs" className="themen-vorschlag" data-vorschlag={fachId}>
      <Group justify="space-between" gap="xs" wrap="wrap">
        <Text size="sm">
          <b>Vorgeschlagen:</b> {vorschauText(vorschlaege)}
        </Text>
        <Group gap={6}>
          {!offen && (
            <>
              <Button size="compact-xs" onClick={() => uebernehmen(vorschlaege)}>
                Übernehmen
              </Button>
              <Button size="compact-xs" variant="light" onClick={() => setOffen(true)}>
                Ansehen und auswählen
              </Button>
            </>
          )}
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => {
              const neu = { ...aus, [auswahlKey]: merkmal }
              setAus(neu)
              merke(VORSCHLAG_AUS_KEY, neu)
            }}
          >
            Nicht jetzt
          </Button>
        </Group>
      </Group>
      {offen && (
        <Stack gap={6} mt="xs">
          <Text size="xs" c="dimmed">
            Lokal ermittelt, ohne KI – aus Lehrplan- und Lehrwerksthemen und ähnlichen Titeln. Danach werden neue Materialien dieses Fachs automatisch
            einsortiert; von Hand Verschobenes bleibt, wo es ist.
          </Text>
          {vorschlaege.map((v) => (
            <Tooltip key={v.name} label={titel(v)} multiline w={380} withinPortal openDelay={300}>
              <Checkbox
                size="xs"
                checked={!abgewaehlt.includes(v.name)}
                onChange={(e) => setAbgewaehlt(e.currentTarget.checked ? abgewaehlt.filter((x) => x !== v.name) : [...abgewaehlt, v.name])}
                label={`${[...(v.pfad ?? []), v.name].join(' › ')} (${v.schluessel.length}) – ${herkunft(v)}`}
              />
            </Tooltip>
          ))}
          <Group gap="xs" mt={4}>
            <Button size="xs" disabled={!gewaehlt.length} onClick={() => uebernehmen(gewaehlt)}>
              {gewaehlt.length === 1 ? '1 Bereich übernehmen' : `${gewaehlt.length} Bereiche übernehmen`}
            </Button>
            <Button size="xs" variant="default" onClick={() => setOffen(false)}>
              Schließen
            </Button>
          </Group>
        </Stack>
      )}
    </Alert>
  )
}
