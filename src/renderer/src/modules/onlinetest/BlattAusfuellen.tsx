/**
 * Arbeitsblatt ausfüllen (Etappe 5 des Schülerbereichs, 02.10.2026; Server: src/server/arbeitsblaetter.ts).
 *
 * Abgestimmt: am iPad/PC direkt AUF dem Blatt – Felder an Linien, Lücken und Kästchen, gemessen hier
 * auf dem Gerät wie beim ausfüllbaren PDF (main/services/export/fillablePdf.ts); am Telefon als
 * Liste je Aufgabe. Tippen oder mit dem Stift (eigene Ebene je Seite; der Server legt sie für die
 * KI über das Blatt). Lösungen gibt es hier nicht – das Blatt ist die Schülerfassung.
 *
 * Das Blatt steht in einem iframe ohne Skripte (sandbox, nur same-origin zum Messen); darüber
 * liegen die Eingabefelder, beides gemeinsam auf die Breite des Geräts skaliert.
 */
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip
} from '@mantine/core'
import { IconArrowBackUp, IconArrowLeft, IconDownload, IconMessageCircle, IconPrinter, IconSend } from '@tabler/icons-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { digitalisieren, KORREKTURRAND_MM, zusatzLinien } from '@shared/blattDigital'
import { druckenImRahmen, druckfassung, FELDER } from './blattDruck'
import type { Andock } from './blattWerkzeuge'
import { objekteAus, OBJEKTE_SCHLUESSEL, type BlattObjekt } from '@shared/blattObjekte'
import { MARKER_FARBEN, ObjektEbene, STIFT_FARBEN, Werkzeugleiste, type Werkzeug } from './blattWerkzeuge'
import { FeldMarkierung, fundstellen, Rand, type Anmerkung } from './blattKorrektur'
import type { BlattFeldArt } from '@shared/blattFreigabe'
import { holen, senden } from './serverApi'
import { BogenAnsicht, type FeedbackBogen } from './SchuelerBereich'

/** Breite einer A4-Seite in CSS-Pixeln (210 mm bei 96 dpi) */
const BREITE = 794
/** Korrekturrand in Pixeln (34 mm bei 96 dpi) */
const RAND_PX = Math.round((KORREKTURRAND_MM * 96) / 25.4)

interface Feld {
  id: string
  nr: number
  art: BlattFeldArt
  seite: number
  /** Lage im Dokument des iframes (px) */
  x: number
  y: number
  w: number
  h: number
  /** zeilen: Zahl und Abstand der Linien */
  zeilen?: number
  abstand?: number
  /** Beschriftung für die Listenansicht (Text der Zeile/Option) */
  text?: string
  /** zeilen: Nummer der letzten Originallinie (Anker für zusätzliche Linien, blattDigital.ts) */
  anker?: number
  /** Index des (ersten) Elements in doc.querySelectorAll(FELDER) – die Druckfassung schreibt dort hinein */
  el?: number
}

interface Seite {
  andocken?: Andock[]
  x: number
  y: number
  w: number
  h: number
}

interface AufgabeInfo {
  nr: number
  anweisung: string
  /** Lage des Aufgabenkopfs (für den Feedback-Knopf) */
  x: number
  y: number
  seite: number
  /** Aufgabe mit Diagramm, Zeitleiste, Skizze o. Ä. – wird auf dem Blatt bearbeitet */
  zeichnen?: boolean
}

export interface BlattDaten {
  id: string
  titel: string
  offen: boolean
  feedback: boolean
  runden: number
  genutzt: number
  html: string
  einstellungen: { feedback: boolean; aufgabenFeedback: boolean; aufgabenRunden: number; stift: boolean }
  antworten: Record<string, string>
  tinte: Record<string, string>
  aufgabenFeedback: Record<string, AufgabenFb[]>
  fassungen: { nr: number; zeit: string; bogen?: FeedbackBogen; fehler?: string }[]
  /** Lösungsblatt – nur nach dem ersten Einreichen (03.10.2026) */
  loesung?: string
}

type AufgabenFb = {
  einschaetzung: string
  text: string
  zeit: number
  gelungen?: string
  fehlt?: string
  schritt?: string
  markierungen?: { zitat: string; art: 'lob' | 'fehler' | 'hinweis'; text: string }[]
}

// Wie das ausfüllbare PDF, dazu die leeren Zellen von Ausfülltabellen

/** Felder, Seiten und Aufgaben im gezeichneten Blatt messen (Dokumentreihenfolge = Lesereihenfolge) */
/** Dunkel genug für eine Achse (Karoraster und Hilfslinien sind hell); rgb(…) oder #rrggbb */
function dunkel(farbe: string | null): boolean {
  if (!farbe) return false
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(farbe.trim())
  const m = hex ? hex.slice(1).map((x) => parseInt(x, 16)) : /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(farbe)?.slice(1).map(Number)
  if (!m) return false
  return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 < 0.55
}

/** Linien und Beschriftungen einer Diagramm-Grafik (SVG als Bild eingebettet) in Seitenpixeln */
function ausDiagrammBild(img: HTMLImageElement, r: DOMRect): Andock[] {
  const roh = img.getAttribute('src') ?? ''
  const i = roh.indexOf(',')
  if (!roh.startsWith('data:image/svg+xml') || i < 0) return []
  let svg: Document
  try {
    svg = new DOMParser().parseFromString(decodeURIComponent(roh.slice(i + 1)), 'image/svg+xml')
  } catch {
    return []
  }
  const wurzel = svg.documentElement
  const vb = (wurzel.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  const b = img.getBoundingClientRect()
  const vw = vb.length === 4 && vb[2] > 0 ? vb[2] : b.width
  const vh = vb.length === 4 && vb[3] > 0 ? vb[3] : b.height
  const ox = vb.length === 4 ? vb[0] : 0
  const oy = vb.length === 4 ? vb[1] : 0
  const kx = b.width / vw
  const ky = b.height / vh
  const pt = (x: number, y: number): { x: number; y: number } => ({ x: b.left - r.left + (x - ox) * kx, y: b.top - r.top + (y - oy) * ky })
  const aus: Andock[] = []
  wurzel.querySelectorAll('line').forEach((l) => {
    if (!dunkel(l.getAttribute('stroke') ?? l.closest('[stroke]')?.getAttribute('stroke') ?? null)) return
    const a = pt(Number(l.getAttribute('x1')), Number(l.getAttribute('y1')))
    const e = pt(Number(l.getAttribute('x2')), Number(l.getAttribute('y2')))
    const laenge = Math.hypot(e.x - a.x, e.y - a.y)
    if (laenge > 30) aus.push({ art: 'strecke', x1: a.x, y1: a.y, x2: e.x, y2: e.y })
    else if (laenge > 1) aus.push({ art: 'punkt', x: a.x, y: a.y }, { art: 'punkt', x: e.x, y: e.y })
  })
  wurzel.querySelectorAll('text').forEach((t) => {
    const x = Number(t.getAttribute('x'))
    const y = Number(t.getAttribute('y'))
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    const groesse = Number(t.getAttribute('font-size')) || 3
    const breite = (t.textContent ?? '').length * groesse * 0.55
    const anker = t.getAttribute('text-anchor')
    const mitte = anker === 'middle' ? x : anker === 'end' ? x - breite / 2 : x + breite / 2
    aus.push({ art: 'punkt', ...pt(mitte, y - groesse - 0.3) }, { art: 'punkt', ...pt(mitte, y + 0.8) })
  })
  return aus
}

/**
 * Andockstellen einer Seite für Verbindungslinien und Punkte (03.10.2026): Achsen (lange dunkle
 * SVG-Linien) als Strecken, ihre Markierungen (kurze Linien) und Beschriftungen als Punkte.
 */
function andockstellen(seite: Element, r: DOMRect): Andock[] {
  const aus: Andock[] = []
  seite.querySelectorAll('svg line').forEach((el) => {
    const l = el as SVGLineElement
    const m = l.getScreenCTM()
    if (!m || !dunkel(getComputedStyle(l).stroke)) return
    const p1 = new DOMPoint(l.x1.baseVal.value, l.y1.baseVal.value).matrixTransform(m)
    const p2 = new DOMPoint(l.x2.baseVal.value, l.y2.baseVal.value).matrixTransform(m)
    const a = { x: p1.x - r.left, y: p1.y - r.top }
    const b = { x: p2.x - r.left, y: p2.y - r.top }
    const laenge = Math.hypot(b.x - a.x, b.y - a.y)
    if (laenge > 30) aus.push({ art: 'strecke', x1: a.x, y1: a.y, x2: b.x, y2: b.y })
    else if (laenge > 1) aus.push({ art: 'punkt', x: a.x, y: a.y }, { art: 'punkt', x: b.x, y: b.y })
  })
  seite.querySelectorAll<HTMLImageElement>('img.ws-diagram-img, img[src^="data:image/svg+xml"]').forEach((img) => aus.push(...ausDiagrammBild(img, r)))
  seite.querySelectorAll('svg text').forEach((el) => {
    const b = el.getBoundingClientRect()
    if (b.width < 2) return
    aus.push(
      { art: 'punkt', x: b.left + b.width / 2 - r.left, y: b.top - 1 - r.top },
      { art: 'punkt', x: b.left + b.width / 2 - r.left, y: b.bottom + 1 - r.top }
    )
  })
  return aus.slice(0, 800)
}

function messen(doc: Document): { felder: Feld[]; seiten: Seite[]; aufgaben: AufgabeInfo[] } {
  const seiten: Seite[] = []
  const roh: Omit<Feld, 'id'>[] = []
  const aufgaben: AufgabeInfo[] = []
  let nr = 0
  const gesehen = new Set<Element>()
  const nummerVon = (task: Element | null, seite: number): number => {
    if (!task) return 0
    if (!gesehen.has(task)) {
      gesehen.add(task)
      if (!task.classList.contains('ws-continued')) {
        nr++
        const kopf = (task.querySelector('.ws-task-num') ?? task).getBoundingClientRect()
        const anweisung = (task.querySelector('.ws-task-instruction') as HTMLElement | null)?.innerText ?? ''
        // Zeichnen, Zuordnen an Bildern: Diagramm, Raster, Skizzenfläche, Bild oder Grafik in der Aufgabe
        const zeichnen = Boolean(
          [...task.querySelectorAll('.ws-diagram, .ws-grid, .ws-space, .ws-workspace, .ws-protokoll-skizze, .ws-muster-skizze, svg, img')].find(
            (x) => !x.closest('.ws-task-head, .ws-social, .ws-task-instruction')
          )
        )
        aufgaben.push({ nr, anweisung: anweisung.trim(), x: kopf.left, y: kopf.top, seite, ...(zeichnen ? { zeichnen } : {}) })
      }
    }
    return nr
  }
  const index = new Map<Element, number>()
  doc.querySelectorAll(FELDER).forEach((el, i) => index.set(el, i))
  doc.querySelectorAll('.ws-page').forEach((p, i) => {
    const r = p.getBoundingClientRect()
    seiten.push({ x: r.left, y: r.top, w: r.width, h: r.height, andocken: andockstellen(p, r) })
    // Aufgaben auch ohne Felder zählen (Nummern wie auf dem Blatt)
    const elemente = [...p.querySelectorAll('.ws-task, ' + FELDER)]
    for (const el of elemente) {
      if (el.classList.contains('ws-task')) {
        nummerVon(el, i)
        continue
      }
      // Gelöstes Beispiel, Kopf (Name/Datum) und Fuß: nichts auszufüllen
      if (el.closest('.ws-example, .ws-header, .ws-footer')) continue
      const b = el.getBoundingClientRect()
      if (b.width < 6 || b.height < 4) continue
      const n = nummerVon(el.closest('.ws-task'), i)
      const art: BlattFeldArt = el.matches('.ws-gap')
        ? 'luecke'
        : el.matches('.ws-check, .ws-tf-cell') || (el.matches('.ws-box') && b.width < 40 && b.height < 40)
          ? 'kreuz'
          : el.matches('.ws-space, .ws-workspace, .ws-cell-empty')
            ? 'flaeche'
            : el.matches('.ws-box')
              ? 'text'
              : 'zeilen'
      const zeile = el.closest('li, tr, .ws-mc-option, .ws-tf-row, p') as HTMLElement | null
      const li = el.getAttribute('data-li')
      roh.push({
        ...(li !== null ? { anker: Number(li) } : {}),
        el: index.get(el),
        nr: n,
        art,
        seite: i,
        x: b.left,
        y: b.top,
        w: b.width,
        h: b.height,
        ...(art === 'kreuz' && zeile ? { text: zeile.innerText.trim().slice(0, 160) } : {})
      })
    }
  })
  // Untereinanderliegende Linien derselben Aufgabe zu einem mehrzeiligen Feld zusammenfassen
  const felder: Feld[] = []
  for (const f of roh) {
    const vorher = felder[felder.length - 1]
    if (
      vorher &&
      f.art === 'zeilen' &&
      vorher.art === 'zeilen' &&
      vorher.nr === f.nr &&
      vorher.seite === f.seite &&
      Math.abs(vorher.x - f.x) < 3 &&
      Math.abs(vorher.w - f.w) < 3
    ) {
      // Oberkante der bisher letzten Linie und ihr Abstand zur neuen
      const n = vorher.zeilen ?? 1
      const abstand = n > 1 ? vorher.abstand! : f.y - vorher.y
      const letzteOben = vorher.y + (n - 1) * abstand
      const luecke = f.y - letzteOben
      if (abstand > 4 && luecke > abstand * 0.6 && luecke < abstand * 1.6) {
        vorher.zeilen = n + 1
        vorher.abstand = abstand
        vorher.h = f.y + f.h - vorher.y
        if (f.anker !== undefined) vorher.anker = f.anker
        continue
      }
    }
    felder.push({ ...f, id: '', ...(f.art === 'zeilen' ? { zeilen: 1, abstand: f.h } : {}) })
  }
  felder.forEach((f, i) => (f.id = `f${i}`))
  return { felder, seiten, aufgaben }
}

export default function BlattAusfuellen({ id }: { id: string }): React.JSX.Element {
  const [d, setD] = useState<BlattDaten | null | undefined>(undefined)
  const [fehler, setFehler] = useState('')
  useEffect(() => {
    void holen<BlattDaten>(`/s/api/blatt?id=${encodeURIComponent(id)}`).then(setD, (e: unknown) => {
      setFehler(e instanceof Error ? e.message : String(e))
      setD(null)
    })
  }, [id])
  if (d === undefined)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  if (!d) return <Alert color="orange">{fehler || 'Dieses Arbeitsblatt gibt es nicht.'}</Alert>
  return <Ausfuellen d={d} />
}

/**
 * Das Blatt ausfüllen bzw. ansehen. Mit `lehrkraft` (App „Freigegebene Blätter", 03.10.2026): nur
 * ansehen, Rückweg in die App, PDF über den Lehrkraft-Weg des Servers.
 */
export function Ausfuellen({ d, lehrkraft }: { d: BlattDaten; lehrkraft?: { zurueck: () => void } }): React.JSX.Element {
  const [antworten, setAntworten] = useState<Record<string, string>>(d.antworten)
  const [tinte, setTinte] = useState<Record<string, string>>(d.tinte)
  const [gemessen, setGemessen] = useState<{ felder: Feld[]; seiten: Seite[]; aufgaben: AufgabeInfo[]; hoehe: number } | null>(null)
  const [breite, setBreite] = useState(BREITE)
  const [ansicht, setAnsicht] = useState<'blatt' | 'liste'>(() => (window.innerWidth < 640 ? 'liste' : 'blatt'))
  const [werkzeug, setWerkzeug] = useState<Werkzeug>('tastatur')
  const [stiftFarbe, setStiftFarbe] = useState(STIFT_FARBEN[0])
  const [markerFarbe, setMarkerFarbe] = useState(MARKER_FARBEN[0])
  const [fassungen, setFassungen] = useState(d.fassungen)
  const [genutzt, setGenutzt] = useState(d.genutzt)
  const [aufgabenFb, setAufgabenFb] = useState(d.aufgabenFeedback)
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [meldung, setMeldung] = useState('')
  const [loesungOffen, setLoesungOffen] = useState(false)
  const rahmen = useRef<HTMLDivElement>(null)
  const iframe = useRef<HTMLIFrameElement>(null)
  const stand = useRef({ antworten, tinte, tinteGeaendert: false })
  stand.current.antworten = antworten
  stand.current.tinte = tinte
  const offen = d.offen && genutzt < d.runden

  // Kästchen, Linien, Punkte (blattWerkzeuge.tsx) und zusätzliche Schreiblinien (blattDigital.ts) stehen bei den Antworten
  const objekte = useMemo(() => objekteAus(antworten[OBJEKTE_SCHLUESSEL] ?? '[]'), [antworten])
  const setObjekte = (neu: BlattObjekt[]): void => setze(OBJEKTE_SCHLUESSEL, JSON.stringify(neu))
  const zusatz = useRef<Record<string, number>>(
    (() => {
      try {
        return JSON.parse(d.antworten.linien ?? '{}') as Record<string, number>
      } catch {
        return {}
      }
    })()
  )

  // Breite des Geräts → Maßstab
  useEffect(() => {
    const el = rahmen.current
    if (!el) return
    const ro = new ResizeObserver(() => setBreite(el.clientWidth))
    ro.observe(el)
    setBreite(el.clientWidth)
    return () => ro.disconnect()
  }, [ansicht])
  /*
   * Randkommentare (03.10.2026): aus dem letzten Bogen und dem jeweils letzten Feedback je Aufgabe,
   * fortlaufend nummeriert. Auf breiten Bildschirmen in einer Spalte neben dem Blatt.
   */
  const letzteFassung = [...fassungen].reverse().find((f) => f.bogen)
  const anmerkungen = useMemo((): Anmerkung[] => {
    /*
     * Markierungen aus dem Feedback zu einer Aufgabe gehören nur zu ihr (Befund 03.10.2026: ein Kommentar
     * zur Zeitleiste erschien an derselben Wendung in Aufgabe 4, für die noch kein Feedback angefordert war)
     */
    const roh: (Omit<Anmerkung, 'nr'> & { zeichen?: unknown })[] = [
      ...(letzteFassung?.bogen?.rand ?? []),
      ...Object.entries(aufgabenFb).flatMap(([nr, l]) => (l.at(-1)?.markierungen ?? []).map((m) => ({ ...m, aufgabe: Number(nr) })))
    ]
    return roh.map((a, i) => {
      const zeichen = 'zeichen' in a ? String(a.zeichen ?? '') : ''
      return { nr: i + 1, zitat: a.zitat, art: a.art, text: a.text, ...(zeichen ? { zeichen } : {}), ...(a.aufgabe ? { aufgabe: a.aufgabe } : {}) }
    })
  }, [letzteFassung, aufgabenFb])
  // Randkommentare stehen im Korrekturrand der Seite (blattDigital.ts) – keine Spalte daneben
  const spalte = false
  const SPALTE = 0
  const massstab = Math.min(1.25, breite / BREITE)

  const messe = useCallback((): void => {
    const doc = iframe.current?.contentDocument
    if (!doc) return
    const hoehe = doc.documentElement.scrollHeight
    if (iframe.current) iframe.current.style.height = `${hoehe}px`
    setGemessen({ ...messen(doc), hoehe })
  }, [])
  const geladen = useCallback(() => {
    const doc = iframe.current?.contentDocument
    if (!doc) return
    // Digitale Fassung: Seiten wachsen mit, Fortsetzungen hängen an der Aufgabe (blattDigital.ts)
    digitalisieren(doc)
    zusatzLinien(doc, zusatz.current)
    // Schriften und Bilder abwarten, dann messen
    void (doc.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(messe, 150))
  }, [messe])
  /** Ein Schreibbereich braucht mehr Linien: anhängen (auch auf dem Server), neu messen */
  const wachsen = useCallback(
    (anker: number, mehr: number): void => {
      const doc = iframe.current?.contentDocument
      if (!doc || mehr <= 0) return
      const k = String(anker)
      zusatz.current = { ...zusatz.current, e: 1, [k]: Math.min(60, (zusatz.current[k] ?? 0) + mehr) }
      zusatzLinien(doc, zusatz.current)
      setAntworten((a) => ({ ...a, linien: JSON.stringify(zusatz.current) }))
      messe()
    },
    [messe]
  )

  // Zwischenstände sichern (2 s nach der letzten Änderung)
  const sichern = useCallback(async (): Promise<void> => {
    const s = stand.current
    await senden('/s/api/blatt/speichern', { id: d.id, antworten: s.antworten, ...(s.tinteGeaendert ? { tinte: s.tinte } : {}) }).catch(() => undefined)
    s.tinteGeaendert = false
  }, [d.id])
  useEffect(() => {
    if (!offen) return
    const t = setTimeout(() => void sichern(), 2000)
    return () => clearTimeout(t)
  }, [antworten, tinte, offen, sichern])

  const setze = (f: string, w: string): void => setAntworten((a) => ({ ...a, [f]: w }))
  const felderAlsDaten = (): { id: string; nr: number; art: string; seite: number }[] =>
    (gemessen?.felder ?? []).map((f) => ({ id: f.id, nr: f.nr, art: f.art, seite: f.seite }))

  const [pruefFehler, setPruefFehler] = useState<Record<string, string>>({})
  const aufgabePruefen = async (nr: number): Promise<void> => {
    setLaeuft(`a${nr}`)
    setMeldung('')
    setPruefFehler((x) => ({ ...x, [String(nr)]: '' }))
    // Bereich der Aufgabe auf ihrer Seite (bis zur nächsten Aufgabe): Kästchen, Linien, Stift darin zählen mit
    const liste = gemessen?.aufgaben ?? []
    const a = liste.find((x) => x.nr === nr)
    const naechste = a ? liste.find((x) => x.seite === a.seite && x.y > a.y) : undefined
    const s0 = a ? gemessen?.seiten[a.seite] : undefined
    const bereich = a && s0 ? { seite: a.seite, von: a.y - s0.y - 10, bis: naechste ? naechste.y - s0.y - 10 : s0.h } : undefined
    try {
      const fb = await senden<{ einschaetzung: string; text: string }>('/s/api/blatt/aufgabe', {
        id: d.id,
        nr,
        antworten,
        felder: felderAlsDaten(),
        ...(bereich ? { bereich } : {}),
        ...(a?.zeichnen ? { nurZeichenflaeche: true } : {}),
        ...(stand.current.tinteGeaendert ? { tinte } : {})
      })
      stand.current.tinteGeaendert = false
      setAufgabenFb((x) => ({ ...x, [String(nr)]: [...(x[String(nr)] ?? []), { ...fb, zeit: Date.now() }] }))
    } catch (e) {
      // Im Fenster der Aufgabe zeigen – unten unter dem Blatt sah man die Meldung nicht (Befund 03.10.2026)
      setPruefFehler((x) => ({ ...x, [String(nr)]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setLaeuft(null)
    }
  }

  const einreichen = async (): Promise<void> => {
    if (!window.confirm(d.feedback ? 'Blatt jetzt einreichen? Danach bekommst du ein Feedback.' : 'Blatt jetzt einreichen?')) return
    setLaeuft('abgabe')
    setMeldung('')
    try {
      const r = await senden<{ ok: boolean; bogen?: FeedbackBogen; nr: number; fehler?: string }>('/s/api/blatt/abgeben', {
        id: d.id,
        antworten,
        felder: felderAlsDaten(),
        tinte
      })
      setGenutzt((g) => g + 1)
      setFassungen((f) => [...f, { nr: r.nr, zeit: new Date().toISOString(), bogen: r.bogen, fehler: r.fehler }])
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft(null)
    }
  }

  const letzte = letzteFassung

  /*
   * Speichern und Drucken (03.10.2026, Wunsch der Lehrkraft): das Blatt in seiner digitalen Fassung
   * mit allem, was eingetragen ist – getippter Text an seinen Linien, Stift, Kästchen und Linien.
   * Der Server macht daraus ein PDF (ohne Skripte, ohne Netz).
   */
  const [pdfLaeuft, setPdfLaeuft] = useState<'speichern' | 'drucken' | null>(null)
  const blattHtml = async (): Promise<string | null> => {
    const doc = iframe.current?.contentDocument
    if (!doc || !gemessen) return null
    return druckfassung(doc, gemessen, antworten, tinte, objekte, anmerkungen)
  }
  const pdf = async (art: 'speichern' | 'drucken'): Promise<void> => {
    setPdfLaeuft(art)
    // iPad/iPhone drucken ein verstecktes Fenster nicht zuverlässig: dort das PDF öffnen (Teilen › Drucken)
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const fenster = art === 'drucken' && ios ? window.open('', '_blank') : null
    try {
      const html = await blattHtml()
      if (!html) throw new Error('Das Blatt ist noch nicht geladen.')
      if (art === 'drucken' && !ios) {
        // Druckdialog mit Seitenvorschau: dieselbe Druckfassung, die auch das PDF bekommt
        await druckenImRahmen(html)
        return
      }
      const r = await fetch(lehrkraft ? '/server/blaetter/pdf' : '/s/api/blatt/pdf', {
        method: 'POST',
        headers: { 'x-schulapps-token': 'server', 'content-type': 'application/json' },
        body: JSON.stringify({ id: d.id, html })
      })
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { fehler?: string }).fehler ?? 'Das PDF konnte nicht erstellt werden.')
      const url = URL.createObjectURL(await r.blob())
      if (fenster) fenster.location.href = url
      else {
        const a = document.createElement('a')
        a.href = url
        a.download = `${d.titel.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`
        a.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      fenster?.close()
      setMeldung(e instanceof Error ? e.message : String(e))
    } finally {
      setPdfLaeuft(null)
    }
  }
  const aufgaben = gemessen?.aufgaben ?? []

  return (
    <Stack data-blatt-ausfuellen>
      {lehrkraft ? (
        <Button variant="subtle" w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4} onClick={lehrkraft.zurueck}>
          Zur Übersicht
        </Button>
      ) : (
        <Button variant="subtle" component="a" href="/s/blaetter" w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4}>
          Arbeitsblätter
        </Button>
      )}
      <Group justify="space-between" align="end">
        <div>
          <Title order={3}>{d.titel}</Title>
          <Text size="sm" c="dimmed">
            {genutzt ? `${genutzt}× eingereicht` : 'noch nicht eingereicht'}
            {d.runden > 1 ? ` · ${d.runden}× möglich` : ''}
            {!d.offen ? ' · abgeschlossen' : ''}
          </Text>
        </div>
        <Group gap={6}>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDownload size={14} />}
            loading={pdfLaeuft === 'speichern'}
            disabled={!gemessen}
            onClick={() => void pdf('speichern')}
            data-blatt-speichern
          >
            Speichern
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPrinter size={14} />}
            loading={pdfLaeuft === 'drucken'}
            disabled={!gemessen}
            onClick={() => void pdf('drucken')}
            data-blatt-drucken
          >
            Drucken
          </Button>
          <SegmentedControl
            size="xs"
            value={ansicht}
            onChange={(v) => setAnsicht(v as 'blatt' | 'liste')}
            data={[
              { value: 'blatt', label: 'Blatt' },
              { value: 'liste', label: 'Liste' }
            ]}
            data-ansicht
          />
        </Group>
      </Group>

      {d.loesung && (
        <Button variant="light" color="green" w="fit-content" onClick={() => setLoesungOffen(true)} data-loesung-knopf>
          Lösung ansehen
        </Button>
      )}
      {loesungOffen && d.loesung && (
        <Modal opened onClose={() => setLoesungOffen(false)} title="Lösung" size="xl">
          <iframe title="Lösung" srcDoc={d.loesung} sandbox="" style={{ width: '100%', height: '75vh', border: 0, background: '#fff' }} />
        </Modal>
      )}
      {letzte?.bogen && (
        <Card withBorder padding="lg" data-blatt-bogen>
          <Title order={4} mb="xs">
            Feedback zu{lehrkraft ? 'r' : ' deiner'} {letzte.nr}. Einreichung
          </Title>
          <BogenAnsicht b={letzte.bogen} />
          {offen && (
            <Text size="sm" c="dimmed" mt="sm">
              Du kannst das Blatt überarbeiten und noch {d.runden - genutzt}× einreichen.
            </Text>
          )}
        </Card>
      )}
      {fassungen.at(-1)?.fehler && (
        <Alert color="orange">Das Feedback konnte nicht erstellt werden: {fassungen.at(-1)!.fehler}. Deine Lehrkraft sieht dein Blatt trotzdem.</Alert>
      )}

      {ansicht === 'blatt' && offen && d.einstellungen.stift && (
        <Werkzeugleiste
          werkzeug={werkzeug}
          setWerkzeug={setWerkzeug}
          stiftFarbe={stiftFarbe}
          setStiftFarbe={setStiftFarbe}
          markerFarbe={markerFarbe}
          setMarkerFarbe={setMarkerFarbe}
        />
      )}

      {/* In der Listenansicht bleibt das Blatt unsichtbar da – sonst ließen sich die Felder nicht messen */}
      <div
        ref={rahmen}
        style={ansicht === 'blatt' ? { width: '100%' } : { width: BREITE, position: 'absolute', left: -20000, top: 0, visibility: 'hidden' }}
        aria-hidden={ansicht !== 'blatt'}
      >
        <div
          style={{
            width: (BREITE + (spalte ? SPALTE : 0)) * massstab,
            height: (gemessen?.hoehe ?? 1123) * massstab,
            position: 'relative',
            overflow: 'hidden',
            margin: '0 auto'
          }}
        >
          <div style={{ width: BREITE, transform: `scale(${massstab})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}>
            <iframe
              ref={iframe}
              title={d.titel}
              srcDoc={d.html}
              sandbox="allow-same-origin"
              onLoad={geladen}
              style={{ width: BREITE, height: 1123, border: 0, display: 'block', pointerEvents: 'none', background: '#fff' }}
            />
            {gemessen && (
              <Ebene
                felder={gemessen.felder}
                seiten={gemessen.seiten}
                aufgaben={aufgaben}
                antworten={antworten}
                setze={setze}
                gesperrt={!offen}
                werkzeug={offen && d.einstellungen.stift ? werkzeug : 'tastatur'}
                stiftFarbe={stiftFarbe}
                markerFarbe={markerFarbe}
                objekte={objekte}
                setObjekte={setObjekte}
                wachsen={wachsen}
                anmerkungen={anmerkungen}
                tinte={tinte}
                setTinte={(s, url) => {
                  stand.current.tinteGeaendert = true
                  setTinte((t) => ({ ...t, [String(s)]: url }))
                }}
                pruefen={offen && d.einstellungen.aufgabenFeedback ? aufgabePruefen : undefined}
                pruefFehler={pruefFehler}
                laeuft={laeuft}
                fb={aufgabenFb}
                runden={d.einstellungen.aufgabenRunden}
              />
            )}
          </div>
        </div>
      </div>

      {ansicht === 'liste' && gemessen && (
        <Liste
          felder={gemessen.felder}
          aufgaben={aufgaben}
          antworten={antworten}
          setze={setze}
          gesperrt={!offen}
          pruefen={offen && d.einstellungen.aufgabenFeedback ? aufgabePruefen : undefined}
          laeuft={laeuft}
          fb={aufgabenFb}
          runden={d.einstellungen.aufgabenRunden}
          tinte={Object.keys(tinte).length > 0}
          zumBlatt={(a) => {
            setAnsicht('blatt')
            // Nach dem Umschalten zur Aufgabe rollen (Lage im Blatt × Maßstab)
            setTimeout(() => {
              const r = rahmen.current?.getBoundingClientRect()
              if (r) window.scrollTo({ top: window.scrollY + r.top + a.y * massstab - 80, behavior: 'smooth' })
            }, 120)
          }}
        />
      )}
      {!gemessen && (
        <Center py="md">
          <Loader size="sm" />
        </Center>
      )}

      {meldung && <Alert color="red">{meldung}</Alert>}
      {offen && (
        <Paper withBorder p="sm" radius="md" style={{ position: 'sticky', bottom: 8, zIndex: 5 }}>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Wird automatisch gespeichert.
            </Text>
            <Button leftSection={<IconSend size={16} />} loading={laeuft === 'abgabe'} onClick={() => void einreichen()} data-blatt-einreichen>
              Einreichen
            </Button>
          </Group>
          {laeuft === 'abgabe' && d.feedback && (
            <Text size="sm" c="dimmed" mt={4}>
              Das Feedback wird geschrieben – das dauert etwa eine Minute.
            </Text>
          )}
        </Paper>
      )}
    </Stack>
  )
}

const FARBE = STIFT_FARBEN[0]

/** Feedback-Verlauf zu einer Aufgabe */
function AufgabenFeedbackText({ liste }: { liste?: AufgabenFb[] }): React.JSX.Element | null {
  const l = liste?.at(-1)
  if (!l) return null
  const farbe = l.einschaetzung === 'sicher' ? 'green' : l.einschaetzung === 'teilweise' ? 'yellow' : 'orange'
  // Gegliedert seit 03.10.2026: gelungen / noch offen / nächster Schritt; ältere Antworten als Text
  if (!l.gelungen && !l.fehlt && !l.schritt)
    return (
      <Alert color={farbe} variant="light" p="xs" data-aufgaben-feedback>
        <Text size="sm">{l.text}</Text>
      </Alert>
    )
  return (
    <Alert color={farbe} variant="light" p="xs" data-aufgaben-feedback>
      <Stack gap={4}>
        {l.gelungen && (
          <Text size="sm">
            <b>✓ Gelungen:</b> {l.gelungen}
          </Text>
        )}
        {l.fehlt && (
          <Text size="sm">
            <b>○ Noch offen:</b> {l.fehlt}
          </Text>
        )}
        {l.schritt && (
          <Text size="sm">
            <b>→ Nächster Schritt:</b> {l.schritt}
          </Text>
        )}
        {l.markierungen?.length ? (
          <Text size="xs" c="dimmed">
            Markierungen und Kommentare stehen an deinem Text.
          </Text>
        ) : null}
      </Stack>
    </Alert>
  )
}

/** Eingabefelder und Stift-Ebene über dem Blatt */
function Ebene(p: {
  felder: Feld[]
  seiten: Seite[]
  aufgaben: AufgabeInfo[]
  antworten: Record<string, string>
  setze: (f: string, w: string) => void
  gesperrt: boolean
  werkzeug: Werkzeug
  stiftFarbe: string
  markerFarbe: string
  objekte: BlattObjekt[]
  setObjekte: (o: BlattObjekt[]) => void
  wachsen?: (anker: number, mehr: number) => void
  anmerkungen: Anmerkung[]
  tinte: Record<string, string>
  setTinte: (seite: number, url: string) => void
  pruefen?: (nr: number) => Promise<void>
  pruefFehler: Record<string, string>
  laeuft: string | null
  fb: BlattDaten['aufgabenFeedback']
  runden: number
}): React.JSX.Element {
  const [offenesFb, setOffenesFb] = useState<number | null>(null)
  const schreibt = p.werkzeug !== 'tastatur'
  const flaechen = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  // Lage der markierten Stellen (Seitenpixel) für die Randkommentare
  const [lagen, setLagen] = useState<Record<number, { y: number; feld: string }>>({})
  const meldeLage = useCallback(
    (nr: number, y: number, feld: string): void =>
      setLagen((l) => (l[nr] && Math.abs(l[nr].y - y) < 0.5 && l[nr].feld === feld ? l : { ...l, [nr]: { y, feld } })),
    []
  )
  // Jede Anmerkung höchstens einmal markieren – im ersten Feld, in dem ihr Zitat steht
  const vergeben = new Set<number>()
  const trefferVon = (wert: string, aufgabe: number): ReturnType<typeof fundstellen> => {
    if (!wert || !p.anmerkungen.length) return []
    const t = fundstellen(
      wert,
      p.anmerkungen.filter((a) => !vergeben.has(a.nr) && (a.aufgabe === undefined || a.aufgabe === aufgabe))
    )
    t.forEach((x) => vergeben.add(x.a.nr))
    return t
  }
  /*
   * Mitwachsende Schreiblinien (03.10.2026): Reicht der Platz nicht, kommen Linien dazu – der Text
   * scrollt nie in seinem Feld, sondern steht immer auf Linien, und das Blatt wird länger.
   */
  useLayoutEffect(() => {
    if (!p.wachsen) return
    for (const f of p.felder) {
      if (f.art !== 'zeilen' || (f.zeilen ?? 1) < 2 || f.anker === undefined) continue
      const t = flaechen.current.get(f.id)
      if (!t) continue
      const zuViel = t.scrollHeight - t.clientHeight
      if (zuViel > 2) p.wachsen(f.anker, Math.ceil(zuViel / (f.abstand ?? 24)))
    }
  })
  return (
    <div
      style={{ position: 'absolute', left: 0, top: 0, width: BREITE, height: '100%' }}
      onPointerDown={(e) => {
        // Klick neben das Feedback-Fenster schließt es
        if (offenesFb !== null && !(e.target as HTMLElement).closest('[data-fb-fenster]')) setOffenesFb(null)
      }}
    >
      {p.felder.map((f) => {
        const wert = p.antworten[f.id] ?? ''
        const stil: React.CSSProperties = {
          position: 'absolute',
          left: f.x,
          top: f.y,
          width: f.w,
          height: f.h,
          border: 0,
          background: wert ? 'transparent' : 'rgba(29, 78, 216, 0.05)',
          color: FARBE,
          fontFamily: '"Segoe Print", "Comic Sans MS", system-ui, sans-serif',
          padding: '0 3px',
          outline: 'none',
          pointerEvents: schreibt ? 'none' : 'auto',
          boxSizing: 'border-box'
        }
        if (f.art === 'kreuz')
          return (
            <button
              key={f.id}
              type="button"
              disabled={p.gesperrt}
              onClick={() => p.setze(f.id, wert ? '' : 'x')}
              aria-label={f.text ? `Ankreuzen: ${f.text}` : 'Ankreuzen'}
              style={{ ...stil, padding: 0, cursor: 'pointer', fontSize: Math.min(f.w, f.h) * 0.9, lineHeight: 1, fontWeight: 700 }}
              data-feld={f.id}
            >
              {wert ? '✗' : ''}
            </button>
          )
        if (f.art === 'luecke' || (f.art === 'zeilen' && (f.zeilen ?? 1) === 1) || f.art === 'text') {
          const hoehe = f.art === 'zeilen' ? Math.max(f.h, 22) : f.h
          const eingabeStil: React.CSSProperties = { ...stil, top: f.y + f.h - hoehe, height: hoehe, fontSize: Math.max(12, Math.min(18, hoehe * 0.65)) }
          const treffer = trefferVon(wert, f.nr)
          return [
            treffer.length ? (
              <FeldMarkierung
                key={`m${f.id}`}
                wert={wert}
                treffer={treffer}
                stil={{ ...eingabeStil, lineHeight: `${hoehe}px` }}
                einzeilig
                lage={(nr, y) => meldeLage(nr, f.y + f.h - hoehe + y, f.id)}
              />
            ) : null,
            <input
              key={f.id}
              value={wert}
              disabled={p.gesperrt}
              onChange={(e) => p.setze(f.id, e.currentTarget.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              style={{ ...eingabeStil, ...(treffer.length ? { background: 'transparent' } : {}) }}
              data-feld={f.id}
            />
          ]
        }
        const zeilenhoehe = f.abstand ?? 24
        const flaechenStil: React.CSSProperties = {
          ...stil,
          resize: 'none',
          overflow: f.art === 'zeilen' ? 'hidden' : 'auto',
          fontSize: Math.max(12, Math.min(18, zeilenhoehe * 0.6)),
          lineHeight: f.art === 'zeilen' ? `${zeilenhoehe}px` : 1.4,
          paddingTop: f.art === 'zeilen' ? Math.max(0, zeilenhoehe * 0.2) : 4
        }
        const treffer = trefferVon(wert, f.nr)
        return [
          treffer.length ? (
            <FeldMarkierung
              key={`m${f.id}`}
              wert={wert}
              treffer={treffer}
              stil={flaechenStil}
              einzeilig={false}
              lage={(nr, y) => meldeLage(nr, f.y + y, f.id)}
            />
          ) : null,
          <textarea
            key={f.id}
            ref={(el) => {
              if (el) flaechen.current.set(f.id, el)
              else flaechen.current.delete(f.id)
            }}
            value={wert}
            disabled={p.gesperrt}
            onChange={(e) => p.setze(f.id, e.currentTarget.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            style={{ ...flaechenStil, ...(treffer.length ? { background: 'transparent' } : {}) }}
            data-feld={f.id}
          />
        ]
      })}
      <Rand
        eintraege={p.anmerkungen
          .filter((a) => lagen[a.nr] !== undefined && vergeben.has(a.nr))
          .map((a) => {
            const l = lagen[a.nr]
            const f = p.felder.find((x) => x.id === l.feld)
            // Neben Schreiblinien: in den Korrekturrand (zwischen Linienende und Seitenrand)
            return f && f.art === 'zeilen' && (f.zeilen ?? 1) > 1 ? { a, y: l.y, x: f.x + f.w + 6, w: Math.max(80, RAND_PX - 12) } : { a, y: l.y }
          })}
        randX={BREITE - 30}
      />
      {p.seiten.map((s, i) => (
        <TintenSeite
          key={i}
          seite={i}
          lage={s}
          bild={p.tinte[String(i)]}
          werkzeug={p.werkzeug}
          farbe={p.werkzeug === 'marker' ? p.markerFarbe : p.stiftFarbe}
          setTinte={p.setTinte}
        />
      ))}
      {p.seiten.map((s, i) => (
        <ObjektEbene
          key={`o${i}`}
          seite={i}
          lage={s}
          objekte={p.objekte}
          aendern={p.setObjekte}
          andocken={s.andocken}
          werkzeug={p.werkzeug}
          farbe={p.stiftFarbe}
          gesperrt={p.gesperrt}
        />
      ))}
      {p.pruefen &&
        p.aufgaben.map((a) => {
          const liste = p.fb[String(a.nr)]
          const rest = p.runden - (liste?.length ?? 0)
          return (
            <div key={a.nr} style={{ position: 'absolute', left: Math.max(2, a.x - 34), top: a.y - 2, zIndex: 20 }} data-fb-fenster>
              <Tooltip label={rest > 0 ? `Feedback zu Aufgabe ${a.nr} (noch ${rest}×)` : 'Feedback ansehen'}>
                <ActionIcon
                  size="md"
                  radius="xl"
                  variant={liste?.length ? 'filled' : 'light'}
                  color={liste?.at(-1)?.einschaetzung === 'sicher' ? 'green' : 'blue'}
                  loading={p.laeuft === `a${a.nr}`}
                  onClick={() => (offenesFb === a.nr ? setOffenesFb(null) : setOffenesFb(a.nr))}
                  aria-label={`Feedback zu Aufgabe ${a.nr}`}
                  data-aufgabe-pruefen={a.nr}
                >
                  <IconMessageCircle size={16} />
                </ActionIcon>
              </Tooltip>
              {offenesFb === a.nr && (
                <Paper withBorder shadow="md" p="xs" w={300} style={{ position: 'absolute', left: 36, top: 0 }}>
                  <Stack gap={6}>
                    <AufgabenFeedbackText liste={liste} />
                    {p.pruefFehler[String(a.nr)] && (
                      <Alert color="red" p="xs" data-pruef-fehler>
                        {p.pruefFehler[String(a.nr)]}
                      </Alert>
                    )}
                    {rest > 0 ? (
                      <Button size="xs" loading={p.laeuft === `a${a.nr}`} onClick={() => void p.pruefen!(a.nr)} data-aufgabe-pruefen-los>
                        {liste?.length ? 'Noch einmal prüfen lassen' : `Aufgabe ${a.nr} prüfen lassen`}
                      </Button>
                    ) : (
                      <Text size="xs" c="dimmed">
                        Für diese Aufgabe gibt es kein weiteres Feedback mehr.
                      </Text>
                    )}
                  </Stack>
                </Paper>
              )}
            </div>
          )
        })}
    </div>
  )
}

/** Stift-Ebene einer Seite: Zeichnen mit Stift/Finger/Maus, Radierer, Rückgängig */
function TintenSeite({
  seite,
  lage,
  bild,
  werkzeug,
  farbe,
  setTinte
}: {
  seite: number
  lage: Seite
  bild?: string
  werkzeug: Werkzeug
  farbe: string
  setTinte: (s: number, url: string) => void
}): React.JSX.Element {
  const leinwand = useRef<HTMLCanvasElement>(null)
  const verlauf = useRef<string[]>([])
  const zeichnet = useRef(false)
  // Textmarker (03.10.2026, Befund der Lehrkraft: „übermalen … statt semitransparent"): Stand vor dem Strich
  const vorStrich = useRef<ImageData | null>(null)
  const strich = useRef<{ x: number; y: number }[]>([])
  const AUFLOESUNG = 2
  // Beim Laden und wenn die Seite wächst (neue Linien – die Leinwand wird dabei geleert): Bild in Originalgröße wieder einzeichnen
  useEffect(() => {
    const c = leinwand.current
    if (!c || !bild) return
    const img = new Image()
    img.onload = () => c.getContext('2d')?.drawImage(img, 0, 0)
    img.src = bild
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lage.w, lage.h])
  const punkt = (e: React.PointerEvent): { x: number; y: number } => {
    const r = leinwand.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * leinwand.current!.width, y: ((e.clientY - r.top) / r.height) * leinwand.current!.height }
  }
  const aktiv = werkzeug === 'stift' || werkzeug === 'marker' || werkzeug === 'radierer'
  const fertig = (): void => {
    if (!zeichnet.current) return
    zeichnet.current = false
    setTinte(seite, leinwand.current!.toDataURL('image/png'))
  }
  return (
    <>
      <canvas
        ref={leinwand}
        width={Math.round(lage.w * AUFLOESUNG)}
        height={Math.round(lage.h * AUFLOESUNG)}
        style={{
          position: 'absolute',
          left: lage.x,
          top: lage.y,
          width: lage.w,
          height: lage.h,
          pointerEvents: aktiv ? 'auto' : 'none',
          touchAction: aktiv ? 'none' : 'auto',
          zIndex: 10,
          // Wie ein echter Textmarker: Farbe legt sich über den Text, der Text bleibt lesbar
          mixBlendMode: 'multiply'
        }}
        data-tinte={seite}
        onPointerDown={(e) => {
          if (!aktiv) return
          const ctx = leinwand.current!.getContext('2d')!
          verlauf.current = [...verlauf.current.slice(-9), leinwand.current!.toDataURL('image/png')]
          zeichnet.current = true
          leinwand.current!.setPointerCapture(e.pointerId)
          const { x, y } = punkt(e)
          vorStrich.current = werkzeug === 'marker' ? ctx.getImageData(0, 0, leinwand.current!.width, leinwand.current!.height) : null
          strich.current = [{ x, y }]
          ctx.globalCompositeOperation = werkzeug === 'radierer' ? 'destination-out' : 'source-over'
          // Textmarker: breit und durchscheinend (03.10.2026)
          ctx.strokeStyle = werkzeug === 'marker' ? `${farbe}59` : farbe
          ctx.lineWidth = (werkzeug === 'radierer' ? 22 : werkzeug === 'marker' ? 16 : 2.2 * (e.pressure ? 0.6 + e.pressure : 1)) * AUFLOESUNG
          ctx.lineCap = werkzeug === 'marker' ? 'butt' : 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + 0.1, y + 0.1)
          ctx.stroke()
        }}
        onPointerMove={(e) => {
          if (!zeichnet.current) return
          const ctx = leinwand.current!.getContext('2d')!
          const { x, y } = punkt(e)
          if (vorStrich.current) {
            // Ein Strich = eine gleichmäßig durchscheinende Spur: Stand davor herstellen, Strich einmal ziehen
            strich.current.push({ x, y })
            ctx.putImageData(vorStrich.current, 0, 0)
            ctx.beginPath()
            strich.current.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
            ctx.stroke()
            return
          }
          ctx.lineTo(x, y)
          ctx.stroke()
        }}
        onPointerUp={fertig}
        onPointerCancel={fertig}
      />
      {aktiv && (
        <ActionIcon
          variant="default"
          style={{ position: 'absolute', left: lage.x + lage.w - 40, top: lage.y + 8, zIndex: 11 }}
          aria-label="Rückgängig"
          onClick={() => {
            const vorher = verlauf.current.pop()
            const c = leinwand.current!
            const ctx = c.getContext('2d')!
            ctx.globalCompositeOperation = 'source-over'
            ctx.clearRect(0, 0, c.width, c.height)
            if (!vorher) return setTinte(seite, c.toDataURL('image/png'))
            const img = new Image()
            img.onload = () => {
              ctx.drawImage(img, 0, 0)
              setTinte(seite, c.toDataURL('image/png'))
            }
            img.src = vorher
          }}
        >
          <IconArrowBackUp size={16} />
        </ActionIcon>
      )}
    </>
  )
}

/** Listenansicht (Telefon): je Aufgabe die Anweisung und ihre Felder */
function Liste(p: {
  felder: Feld[]
  aufgaben: AufgabeInfo[]
  antworten: Record<string, string>
  setze: (f: string, w: string) => void
  gesperrt: boolean
  pruefen?: (nr: number) => Promise<void>
  laeuft: string | null
  fb: BlattDaten['aufgabenFeedback']
  runden: number
  tinte: boolean
  zumBlatt: (a: AufgabeInfo) => void
}): React.JSX.Element {
  const gruppen = useMemo(() => {
    // Auch Aufgaben ohne Felder, die auf dem Blatt gezeichnet werden (Diagramm, Zeitleiste …)
    const nummern = [...new Set([...p.felder.map((f) => f.nr), ...p.aufgaben.filter((a) => a.zeichnen).map((a) => a.nr)])].sort((a, b) => a - b)
    return nummern.map((nr) => ({ nr, aufgabe: p.aufgaben.find((a) => a.nr === nr), felder: p.felder.filter((f) => f.nr === nr) }))
  }, [p.felder, p.aufgaben])
  return (
    <Stack data-blatt-liste>
      {p.tinte && (
        <Alert variant="light" color="blue">
          Auf dem Blatt gibt es Stift-Einträge – sie bleiben erhalten und zählen mit.
        </Alert>
      )}
      {gruppen.map((g) => {
        const liste = p.fb[String(g.nr)]
        const rest = p.runden - (liste?.length ?? 0)
        return (
          <Card key={g.nr} withBorder padding="md">
            <Group justify="space-between" mb={6} wrap="nowrap" align="start">
              <Text fw={700}>
                {g.nr ? `Aufgabe ${g.nr}` : 'Weitere Felder'}
                {g.aufgabe?.anweisung ? (
                  <Text span fw={400}>
                    {' '}
                    – {g.aufgabe.anweisung}
                  </Text>
                ) : null}
              </Text>
              {p.pruefen && g.nr > 0 && rest > 0 && (
                <Button
                  size="xs"
                  variant="light"
                  loading={p.laeuft === `a${g.nr}`}
                  onClick={() => void p.pruefen!(g.nr)}
                  leftSection={<IconMessageCircle size={14} />}
                >
                  Prüfen
                </Button>
              )}
            </Group>
            <Stack gap={6}>
              {g.aufgabe?.zeichnen && (
                <Alert variant="light" color="grape" p="xs" data-auf-dem-blatt={g.nr}>
                  <Group justify="space-between" gap="xs">
                    <Text size="sm">Hier wird gezeichnet, beschriftet oder zugeordnet – das geht auf dem Blatt.</Text>
                    <Button size="xs" variant="light" color="grape" onClick={() => p.zumBlatt(g.aufgabe!)}>
                      Auf dem Blatt bearbeiten
                    </Button>
                  </Group>
                </Alert>
              )}
              {g.felder
                .filter((f) => !(g.aufgabe?.zeichnen && f.art === 'flaeche'))
                .map((f, i) =>
                  f.art === 'kreuz' ? (
                    <Checkbox
                      key={f.id}
                      label={f.text || `Kästchen ${i + 1}`}
                      checked={Boolean(p.antworten[f.id])}
                      disabled={p.gesperrt}
                      onChange={(e) => p.setze(f.id, e.currentTarget.checked ? 'x' : '')}
                    />
                  ) : f.art === 'zeilen' && (f.zeilen ?? 1) > 1 ? (
                    <Textarea
                      key={f.id}
                      autosize
                      minRows={Math.min(6, f.zeilen ?? 2)}
                      label={`${i + 1}`}
                      value={p.antworten[f.id] ?? ''}
                      disabled={p.gesperrt}
                      onChange={(e) => p.setze(f.id, e.currentTarget.value)}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  ) : f.art === 'flaeche' ? (
                    <Textarea
                      key={f.id}
                      autosize
                      minRows={3}
                      label={`${i + 1}`}
                      value={p.antworten[f.id] ?? ''}
                      disabled={p.gesperrt}
                      onChange={(e) => p.setze(f.id, e.currentTarget.value)}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  ) : (
                    <TextInput
                      key={f.id}
                      label={`${f.art === 'luecke' ? 'Lücke' : 'Feld'} ${i + 1}`}
                      value={p.antworten[f.id] ?? ''}
                      disabled={p.gesperrt}
                      onChange={(e) => p.setze(f.id, e.currentTarget.value)}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                  )
                )}
              <AufgabenFeedbackText liste={liste} />
              {liste?.length ? (
                <Badge variant="light" size="sm">
                  noch {Math.max(0, rest)}× Feedback
                </Badge>
              ) : null}
            </Stack>
          </Card>
        )
      })}
    </Stack>
  )
}
