/**
 * Daten der Kursseite (Sprachenlernen, aus VokabelTraining.tsx herausgelöst am 09.10.2026 für die gemeinsame Kursseite
 * in Sprachenlernen und „Meine Klassen"): Antwort von GET /server/vokabeln/<id> und kleine Datums-Helfer.
 */
import type { Uebersicht } from '@shared/vokabeltrainer'
import type { AbschnittStatistik } from '@shared/kursAbschnitte'
import type { ProfilPunkt } from './KursGrammatik'

/** Reiter der Kursseite */
export type KursReiter = 'ueberblick' | 'vokabeln' | 'grammatik' | 'lernende' | 'einstellungen'

export interface Lernstanddaten {
  id: string
  titel: string
  fach: string
  testTermin: number | null
  status: string
  bis: number | null
  /** Spiele heute freigeschaltet / neue Vokabeln je Tag (08.10.2026) */
  spieleFrei?: boolean
  /** Verbspiele: '' automatisch (ab bekannter Vergangenheit), 'an', 'aus' (08.10.2026) */
  verbspiele?: '' | 'an' | 'aus'
  /** Kooperativ/Versus erlaubt (08.10.2026) */
  zusammen?: boolean
  /** Erinnerungen zum Üben angeboten und wie viele Lernende sie eingeschaltet haben – nur die Zahl (10.10.2026) */
  erinnerungen?: boolean
  erinnerungenAktiv?: number
  tagesziel?: number
  adresse?: string
  ueberschrift?: string
  teile?: { titel: string; anzahl: number; zeit: number }[]
  /** Entfernte Abschnitte (08.10.2026): Lernstand gespeichert */
  entfernt?: { teil: string; anzahl: number; zeit: number }[]
  sprache?: string
  quelle?: { lehrwerk?: string; unit?: string } | null
  code?: string
  link?: string
  lerngruppe: string
  woerter: { id: string; term: string; translation: string }[]
  lernende: {
    id: string
    name: string
    gast?: boolean
    perCode?: boolean
    zugang?: string
    uebersicht: Uebersicht
    tage7: number
    /** In 7 Tagen neu gelernt / wiederholt (08.10.2026) */
    neu7?: number
    wiederholt7?: number
    /** Stärken/Schwächen in Grammatik und Extra-Aufgaben (Sprachenlernen, 08.10.2026) */
    grammatik?: {
      staerken: ProfilPunkt[]
      schwaechen: ProfilPunkt[]
      extra: { id: string; art: string; titel: string; bearbeitet: number; gesamt: number; status: string }[]
      /** Alle geübten Regeln (ab 1 Versuch) – Grammatik-Übersicht und Fördern/Fordern je Regel */
      regeln?: ProfilPunkt[]
    }
  }[]
  lerngruppeId?: string
  /** Kurs einer festen Klasse (09.10.2026): nicht beenden/löschen, kein Lernzeitraum-Ende */
  klassenKurs?: boolean
  /** Übersicht je Abschnitt – nur bei Kursen ohne Lerngruppe (09.10.2026) */
  abschnitte?: AbschnittStatistik[]
  lernendeNamen?: string[]
  gesamt: Uebersicht
  problem: { id: string; term: string; translation: string; versuche: number; falsch: number; quote: number; typisch: string[] }[]
}

export type Lernende = Lernstanddaten['lernende'][number]

/** Datumsfeld (JJJJ-MM-TT) ↔ Zeitpunkt: Termine morgens, Zeitraum-Ende am Abend */
export const alsFeld = (ms: number | null): string => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : '')
export const ausFeld = (v: string, uhr: string): number | null => (v ? new Date(`${v}T${uhr}`).getTime() : null)
