/**
 * Daten des Regals (08.10.2026): alles, was ein Kind hat, nach Fach gebündelt – aus den bestehenden Schnittstellen,
 * damit Gäste und Konten dasselbe sehen. Konten bekommen dazu Mappen, Tafelbilder, Ergebnisse und Merkzettel aus dem
 * Lernraum (/s/api/lernen).
 */
import { useCallback, useEffect, useState } from 'react'
import { useAuffrischen } from '../../../shared/auffrischen'
import { fachFarbeAus } from '../../../shared/fachfarben'
import { holen } from '../../onlinetest/serverApi'
import { fachName } from './beschriftung'

export interface KursKurz {
  id: string
  titel: string
  fach: string
  uebersicht: { gesamt: number; neu: number; sicher: number; faellig: number; heuteGeuebt?: number; heuteOffen?: number; unbearbeitet?: number }
  /** Grammatik (08.10.2026): Jahrgang und Stelle im Lehrwerk – das Register gliedert nach Schuljahren */
  jahrgang?: number | null
  stelle?: number | null
}
export interface BlattEintrag {
  id: string
  titel: string
  offen: boolean
  feedback: boolean
  runden: number
  genutzt: number
  begonnen: boolean
  fach?: string
  thema?: string
}
export interface TestEintrag {
  code: string
  titel: string
  zeitMin: number
  abgegeben: boolean
  wartend: boolean
  fach?: string
}
export interface AufgabeEintrag {
  id: string
  titel: string
  offen?: boolean
  bis: number | null
  fach?: string
  fassungen: { bogen?: unknown }[]
}
export interface MappenSeite {
  art: 'blatt' | 'tafel' | 'schreiben' | 'test' | 'produkt'
  titel: string
  datum: number
  link?: string
  feedback?: { staerken?: string[]; schritte?: string[] }
  id?: string
  bild?: string
  text?: string
}
export interface Mappe {
  titel: string
  seiten: MappenSeite[]
}
/** Arbeitsblätter einer Unterrichtsreihe (08.10.2026, Plan G.3) – im Register „Materialien" nach Reihe gebündelt */
export interface ReiheMaterialien {
  zid: string
  titel: string
  fach: string
  oberthema: string
  offen: boolean
  materialien: { schritt: string; titel: string; zweck?: string; gesperrt: boolean; link?: string; stufeWaehlen?: boolean; eingereicht: number; loesung: boolean }[]
}
export interface Merkkasten {
  art: 'merkzettel'
  titel: string
  karten?: { titel: string; text: string }[]
}

export interface FachOrdner {
  fach: string
  farbe: string
  vokabeln: KursKurz[]
  grammatik: KursKurz[]
  blaetter: BlattEintrag[]
  tests: TestEintrag[]
  aufgaben: AufgabeEintrag[]
  /** Arbeitsblätter aus Unterrichtsreihen, je Reihe (08.10.2026) */
  reihen: ReiheMaterialien[]
  /** Nur Konten: Mappen ohne Arbeitsblätter und Schreibaufgaben (die stehen oben schon) */
  mappen: Mappe[]
  merk: Merkkasten[]
}

const leer = <T>(): Promise<T[]> => Promise.resolve([])

/** Je Konto, damit auf geteilten Geräten nie fremde Ordner aufblitzen */
const CACHE = `sa-regal-daten-${typeof window !== 'undefined' ? window.__schulappsServer?.benutzer ?? window.__schulappsServer?.name ?? '' : ''}`

export function useRegal(): { ordner: FachOrdner[] | null; neuLaden: () => void } {
  // Zuletzt geladene Ordner sofort zeigen (08.10.2026): Der Ordner klappt ohne Warten auf, im Hintergrund wird aufgefrischt
  const [ordner, setOrdnerRoh] = useState<FachOrdner[] | null>(() => {
    try {
      const roh = sessionStorage.getItem(CACHE)
      return roh ? (JSON.parse(roh) as FachOrdner[]) : null
    } catch {
      return null
    }
  })
  const setOrdner = (o: FachOrdner[]): void => {
    setOrdnerRoh(o)
    try {
      sessionStorage.setItem(CACHE, JSON.stringify(o))
    } catch {
      /* voll oder privat: dann ohne Zwischenspeicher */
    }
  }
  const laden = useCallback(() => {
    const konto = Boolean(window.__schulappsServer?.angemeldet && window.__schulappsServer.quelle !== 'gast')
    void Promise.all([
      holen<{ listen: KursKurz[] }>('/s/api/vokabeln').then((d) => d.listen ?? [], leer<KursKurz>),
      holen<{ listen: KursKurz[] }>('/s/api/grammatik').then((d) => d.listen ?? [], leer<KursKurz>),
      holen<{ blaetter: BlattEintrag[] }>('/s/api/blaetter').then((d) => d.blaetter ?? [], leer<BlattEintrag>),
      holen<{ tests: TestEintrag[] }>('/s/api/tests').then((d) => d.tests ?? [], leer<TestEintrag>),
      holen<{ aufgaben: AufgabeEintrag[] }>('/s/api/aufgaben').then((d) => d.aufgaben ?? [], leer<AufgabeEintrag>),
      holen<{ reihen: ReiheMaterialien[] }>('/s/api/reihen/materialien').then((d) => d.reihen ?? [], leer<ReiheMaterialien>),
      holen<{ farben: Record<string, string> }>('/s/api/regal/farben').then(
        (d) => d.farben ?? {},
        () => ({}) as Record<string, string>
      ),
      konto
        ? holen<{ raeume: { fach: string; karteikaesten: { art: string; titel: string; karten?: { titel: string; text: string }[] }[]; mappen: Mappe[] }[] }>(
            '/s/api/lernen'
          ).then((d) => d.raeume ?? [], leer<{ fach: string; karteikaesten: { art: string; titel: string; karten?: { titel: string; text: string }[] }[]; mappen: Mappe[] }>)
        : leer<{ fach: string; karteikaesten: { art: string; titel: string; karten?: { titel: string; text: string }[] }[]; mappen: Mappe[] }>()
    ]).then(([vok, gram, blaetter, tests, aufgaben, reihen, farben, raeume]) => {
      const nach = new Map<string, FachOrdner>()
      const o = (f: string | undefined): FachOrdner => {
        const n = fachName(f ?? '')
        let x = nach.get(n)
        if (!x) {
          x = {
            fach: n,
            farbe: farben[n] ?? fachFarbeAus(n, undefined) ?? '#5c6b7a',
            vokabeln: [],
            grammatik: [],
            blaetter: [],
            tests: [],
            aufgaben: [],
            reihen: [],
            mappen: [],
            merk: []
          }
          nach.set(n, x)
        }
        return x
      }
      for (const v of vok) o(v.fach).vokabeln.push(v)
      for (const g of gram) o(g.fach).grammatik.push(g)
      for (const b of blaetter) o(b.fach).blaetter.push(b)
      for (const t of tests) o(t.fach).tests.push(t)
      for (const a of aufgaben) o(a.fach).aufgaben.push(a)
      for (const r of reihen) o(r.fach).reihen.push(r)
      for (const r of raeume) {
        const mappen = r.mappen
          .map((m) => ({ ...m, seiten: m.seiten.filter((s) => s.art !== 'blatt' && s.art !== 'schreiben') }))
          .filter((m) => m.seiten.length)
        const merk = r.karteikaesten.filter((k): k is Merkkasten => k.art === 'merkzettel')
        if (!mappen.length && !merk.length) continue
        const x = o(r.fach)
        x.mappen.push(...mappen)
        x.merk.push(...merk)
      }
      setOrdner([...nach.values()])
    })
  }, [])
  useEffect(laden, [laden])
  // Neue Freigaben ohne Neuladen (wie „Meine Materialien")
  useAuffrischen(laden)
  return { ordner, neuLaden: laden }
}

/** Ordner in der Reihenfolge des Kindes: gespeicherte zuerst, neue Fächer alphabetisch einsortiert */
export function sortiert(ordner: FachOrdner[], eigene: string[] | undefined, name: (f: string) => string): FachOrdner[] {
  const az = [...ordner].sort((a, b) => name(a.fach).localeCompare(name(b.fach), 'de'))
  if (!eigene?.length) return az
  const bekannt = eigene.filter((f) => ordner.some((o) => o.fach === f))
  const ergebnis = bekannt.map((f) => ordner.find((o) => o.fach === f)!)
  for (const neu of az.filter((o) => !bekannt.includes(o.fach))) {
    // Neues Fach vor dem ersten, das alphabetisch danach kommt
    const i = ergebnis.findIndex((o) => name(o.fach).localeCompare(name(neu.fach), 'de') > 0)
    if (i < 0) ergebnis.push(neu)
    else ergebnis.splice(i, 0, neu)
  }
  return ergebnis
}
