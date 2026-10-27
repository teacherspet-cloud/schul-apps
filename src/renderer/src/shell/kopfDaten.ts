/**
 * Gemeinsame Daten für den Rahmen-Kopf und den Schnellzugriff der Startseite (10.10.2026, Entscheidung der Lehrkraft:
 * Info-Chips auf JEDER Seite). Ein kleiner Speicher statt Anfragen je Seite: Onlinetests, Rückmeldungen, Startseite
 * (Kurse/Klassen), laufende Reihen und freigegebene Blätter – dieselben Endpunkte, die die Startseite schon nutzte.
 * Neu geladen höchstens alle 60 s (und wenn das Fenster wieder vorn ist); die Startseite holt beim Öffnen frisch.
 * Nur auf dem Server – die Exe ohne Server hat diese Dinge nicht (dann bleibt alles leer, keine Chips).
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import { holen } from '../modules/onlinetest/serverApi'
import type { LaufendeReihe } from '../modules/unterrichtsreihe/LaufendeReihenModule'
import type { Freigabe } from '../modules/freigaben/FreigegebeneBlaetterModule'
import { demnaechst, kopfZahlen, type KopfZahl, type StartseiteDaten } from '@shared/startseiteKurse'
import { appFreigegeben, aufServer } from '../shared/plattform'
import { startKarten } from '../shared/programmSichtbarkeit'
import { useSichtbareProgramme } from './programme'

export interface TestKurz {
  id: string
  titel: string
  status: 'wartend' | 'offen' | 'beendet'
  lerngruppe: string
  teilnehmer: number
  abgegeben: number
  offen: number
  zuEntscheiden: number
  erstellt: string
  /** Termin „JJJJ-MM-TT" (10.10.2026) und ob er für Lernende ausgeblendet ist */
  termin?: string | null
  terminVerborgen?: boolean
}
export interface RueckmeldungKurz {
  id: string
  titel: string
  status: string
  art?: string
  lerngruppe: string
  abgaben: number
  /** Für wie viele Personen (Fortschrittsbalken) */
  gesamt?: number
}

/** Höchstens so oft neu laden (außer ausdrücklich frisch) */
export const KOPF_NEU_NACH_MS = 60_000

interface KopfDaten {
  tests: TestKurz[] | null
  rueck: RueckmeldungKurz[] | null
  start: StartseiteDaten | null
  reihen: LaufendeReihe[] | null
  blaetter: Freigabe[] | null
  /** Zeitpunkt des letzten Ladens (0 = nie) */
  stand: number
  laufend: Promise<void> | null
  /** Lädt alles neu – ohne `frisch` nur, wenn der letzte Stand älter als 60 s ist; laufende Anfragen werden geteilt */
  laden: (frisch?: boolean) => Promise<void>
}

const oderLeer = <T>(p: Promise<T>, leer: T): Promise<T> => p.catch(() => leer)

export const useKopfDaten = create<KopfDaten>((set, get) => ({
  tests: null,
  rueck: null,
  start: null,
  reihen: null,
  blaetter: null,
  stand: 0,
  laufend: null,
  laden: (frisch = false) => {
    if (!aufServer()) return Promise.resolve()
    const { laufend, stand } = get()
    if (laufend) return laufend
    if (!frisch && Date.now() - stand < KOPF_NEU_NACH_MS) return Promise.resolve()
    // App-Freigaben (23.10.2026): nur abfragen, was eine freigegebene App zeigt
    const nurMit = <T,>(apps: string[], laden: () => Promise<T>, leer: T): Promise<T> => (apps.some((a) => appFreigegeben(a)) ? oderLeer(laden(), leer) : Promise.resolve(leer))
    const p = Promise.all([
      nurMit(['onlinetest'], () => holen<{ tests: TestKurz[] }>('/server/onlinetest').then((d) => d.tests), []),
      nurMit(['freigaben', 'rueckmeldung'], () => holen<{ freigaben: RueckmeldungKurz[] }>('/server/feedback').then((d) => d.freigaben), []),
      oderLeer(holen<StartseiteDaten>('/server/startseite'), { kurse: [], klassen: [] }),
      nurMit(['laufendereihen', 'unterrichtsreihe'], () => holen<{ reihen: LaufendeReihe[] }>('/server/reihen/laufend').then((d) => d.reihen), []),
      nurMit(['freigaben'], () => holen<{ blaetter: Freigabe[] }>('/server/blaetter').then((d) => d.blaetter), [])
    ]).then(([tests, rueck, start, reihen, blaetter]) => {
      set({ tests, rueck, start, reihen, blaetter, stand: Date.now(), laufend: null })
    })
    set({ laufend: p })
    return p
  }
}))

/** Hält die Daten aktuell, solange der Rahmen steht: beim Start, jede Minute und wenn das Fenster wieder vorn ist */
export function useKopfDatenAktuell(): void {
  useEffect(() => {
    if (!aufServer()) return
    const laden = (): void => void useKopfDaten.getState().laden()
    laden()
    const zeit = setInterval(laden, KOPF_NEU_NACH_MS)
    const vorn = (): void => {
      if (document.visibilityState === 'visible') laden()
    }
    window.addEventListener('focus', vorn)
    document.addEventListener('visibilitychange', vorn)
    return () => {
      clearInterval(zeit)
      window.removeEventListener('focus', vorn)
      document.removeEventListener('visibilitychange', vorn)
    }
  }, [])
}

/** Die Info-Chips aus den gemeinsamen Daten – nur für Karten sichtbarer Apps (dieselbe Regel wie der Schnellzugriff) */
export function useKopfZahlen(): KopfZahl[] {
  const { tests, start, reihen, blaetter } = useKopfDaten()
  const ids = useSichtbareProgramme().map((m) => m.id)
  if (!aufServer()) return []
  const karten = startKarten(ids)
  const jetzt = Date.now()
  const t = tests ?? []
  const kurse = karten.termine === 'voll' ? (start?.kurse ?? []) : []
  return kopfZahlen(
    {
      laufend: karten.tests ? t.filter((x) => x.status === 'offen').length : 0,
      geplant: karten.tests ? t.filter((x) => x.status === 'wartend').length : 0,
      zuPruefen: karten.tests ? t.filter((x) => x.status === 'beendet' && (x.offen > 0 || x.zuEntscheiden > 0)).length : 0,
      neueAbgaben:
        karten.freigaben && ids.includes('freigaben')
          ? (blaetter ?? []).filter((b) => b.status === 'offen' && b.zuletzt > jetzt - 2 * 864e5 && (b.neu ?? b.abgaben) > 0).length
          : 0,
      bedarf: karten.reihen ? (reihen ?? []).reduce((s, r) => s + r.bedarf, 0) : 0,
      bald: karten.termine ? demnaechst(kurse, reihen ?? [], jetzt, karten.tests ? t : []) : []
    },
    jetzt
  )
}
