/**
 * Partnerarbeit Sprechen (24.10.2026, abgestimmt mit der Lehrkraft): Lernende üben im Unterricht zu zweit oder zu dritt
 * mit den Karten des Sprechprüfungs-Pools – ohne KI. Die Lehrkraft bereitet vor, aktiviert (oder plant) und beendet;
 * Lernende sehen die Partnerarbeit nur, solange sie läuft. Zuteilung per Einladungscode (Selbstwahl) oder per Zufall mit
 * anonymen Bildsymbolen; Regeln der Lehrkraft (Einstufung, „nicht mit", „nicht wie zuletzt") sehen Lernende nie.
 * Hier nur Typen und Bereinigung – Server: server/partnerarbeit.ts, Ablauf je Gruppe: ablauf.ts, Zuteilung: zuteilung.ts.
 */
import { standBereinigt, type SprechStand } from '../sprechen/karten'

export type PaTeil = 'interview' | 'monolog' | 'dialog'
export const PA_TEILE: PaTeil[] = ['interview', 'monolog', 'dialog']
export const PA_TEIL_NAME: Record<PaTeil, string> = { interview: 'Interview', monolog: 'Monolog', dialog: 'Dialog' }
/** vorbereitet → aktiv (Warteraum) → laeuft (Gruppen stehen) → beendet */
export type PaStatus = 'vorbereitet' | 'aktiv' | 'laeuft' | 'beendet'
export type PaModus = 'code' | 'zufall'
export type Gruppengroesse = 2 | 3

export interface PaEinstellungen {
  teile: PaTeil[]
  /** Vorgegebene Pool-Karten (leer = alle Karten des Jahrgangs) */
  karten: string[]
  /** Nur Karten bis zu dieser Stelle im Lehrwerk */
  bisStand?: SprechStand
  gruppengroesse: Gruppengroesse
  modus: PaModus
  /** Prüfungszeiten als Uhr beim Fragenden */
  uhr: boolean
  /** Ende (ms) – danach ist die Partnerarbeit beendet */
  ende: number
}

export type Einstufung = 'stark' | 'mittel' | 'schwach'
export const EINSTUFUNGEN: Einstufung[] = ['stark', 'mittel', 'schwach']
export type Strategie = 'zufall' | 'gemischt' | 'aehnlich'
export const STRATEGIE_NAME: Record<Strategie, string> = { zufall: 'Zufall', gemischt: 'Stärkere mit Schwächeren', aehnlich: 'Ähnlich starke zusammen' }

/** Zuteilungsregeln je Kurs – nur für die Lehrkraft sichtbar */
export interface PaRegeln {
  einstufung: Record<string, Einstufung>
  /** Paare, die nicht zusammen sollen (Kennungen) */
  nichtMit: [string, string][]
  /** Partner der letzten Zuteilung je Person („nicht wie zuletzt") */
  zuletzt: Record<string, string[]>
}

export type Rolle = 'A' | 'B' | 'C' | 'helfer'

/** Ein Schritt einer Gruppe (ein Teil mit Karte(n) und Rollen); Einzelheiten in ablauf.ts */
export interface PaSchritt {
  teil: PaTeil
  /** Karten des Schritts (Dreier-Monolog: zwei Bildkarten; sonst eine) */
  karten: string[]
  rollen: Record<string, Rolle>
  /** Dreier-Interview: wer gerade antwortet */
  dran?: string
  /** Dreier: Unterrunde 0..2 (jede Person einmal A); Zweier: 0..1 */
  unterrunde: number
  /** Abgehakte Fragen (Index) */
  haken: number[]
  /** Freigeschaltete Hilfen je Empfänger-Kennung */
  frei: Record<string, string[]>
  /** Wer „Fertig" gedrückt hat */
  fertig: string[]
  /** Rückmeldung nach dem Teil läuft */
  rueckmeldung?: boolean
  seit: number
}

export interface PaGruppe {
  id: string
  mitglieder: string[]
  runde: number
  teilIndex: number
  schritt: PaSchritt | null
  /** Schon benutzte Karten (keine Wiederholung in der Gruppe) */
  benutzt: string[]
  seit: number
}

export interface Partnerarbeit {
  id: string
  vokId: string
  lehrkraftId: string
  lerngruppeId: string
  status: PaStatus
  einstellungen: PaEinstellungen
  /** Von der Lehrkraft als anwesend gesetzt (leer = noch nicht gesetzt → alle) */
  anwesend: string[]
  /** Symbol je Person (OpenMoji-Hex) */
  symbole: Record<string, string>
  gruppen: PaGruppe[]
  erstellt: number
  aktiviert?: number
  beendet?: number
}

const TAG = 86_400_000
const text = (x: unknown, max = 80): string => (typeof x === 'string' ? x.trim().slice(0, max) : '')

export function einstellungenBereinigt(roh: unknown, jetzt = Date.now()): PaEinstellungen {
  const r = (roh ?? {}) as Record<string, unknown>
  const teile = (Array.isArray(r.teile) ? r.teile : []).map(String).filter((t): t is PaTeil => (PA_TEILE as string[]).includes(t))
  const ende = Number(r.ende)
  const bisStand = standBereinigt(r.bisStand)
  return {
    teile: teile.length ? [...new Set(teile)] : [...PA_TEILE],
    karten: (Array.isArray(r.karten) ? r.karten : [])
      .map(String)
      .filter((x) => /^k[a-f0-9]{16}$/.test(x))
      .slice(0, 60),
    ...(bisStand ? { bisStand } : {}),
    gruppengroesse: Number(r.gruppengroesse) === 3 ? 3 : 2,
    modus: r.modus === 'code' ? 'code' : 'zufall',
    uhr: r.uhr === true,
    // Standard: 45 Minuten ab jetzt; höchstens eine Woche voraus (geplante Partnerarbeiten)
    ende: Number.isFinite(ende) && ende > jetzt ? Math.min(ende, jetzt + 7 * TAG) : jetzt + 45 * 60_000
  }
}

export function regelnBereinigt(roh: unknown): PaRegeln {
  const r = (roh ?? {}) as Record<string, unknown>
  const einstufung: Record<string, Einstufung> = {}
  for (const [k, v] of Object.entries((r.einstufung ?? {}) as Record<string, unknown>))
    if ((EINSTUFUNGEN as string[]).includes(String(v))) einstufung[text(k)] = v as Einstufung
  const nichtMit = (Array.isArray(r.nichtMit) ? r.nichtMit : [])
    .map((p) => (Array.isArray(p) ? [text(p[0]), text(p[1])] : ['', '']))
    .filter((p): p is [string, string] => Boolean(p[0] && p[1] && p[0] !== p[1]))
    .slice(0, 200)
  const zuletzt: Record<string, string[]> = {}
  for (const [k, v] of Object.entries((r.zuletzt ?? {}) as Record<string, unknown>))
    if (Array.isArray(v))
      zuletzt[text(k)] = v
        .map((x) => text(x))
        .filter(Boolean)
        .slice(0, 3)
  return { einstufung, nichtMit, zuletzt }
}

// ---------------------------------------------------------------- Sichten

/** Aktive Partnerarbeit aus Sicht der Lernenden (Startseite, Register „Speaking") */
export interface MeinePartnerarbeit {
  id: string
  fach: string
  sprache: string
  status: PaStatus
  modus: PaModus
  gruppengroesse: Gruppengroesse
  ende: number
}

/** Mitglied aus Sicht der Lernenden: nur Symbol, nie Name */
export interface MitgliedSicht {
  symbol: string
  ich: boolean
  online: boolean
  rolle?: Rolle
  /** Zu dritt: antwortet/spricht gerade */
  dran?: boolean
}

/** Was ein Gerät sieht (Server → Browser, Kanal `partner:sicht`) */
export interface PaSicht {
  id: string
  status: PaStatus
  fach: string
  sprache: string
  jahrgang: number | null
  modus: PaModus
  gruppengroesse: Gruppengroesse
  uhr: boolean
  ende: number
  jetzt: number
  /** Eigenes Symbol (sobald vergeben) */
  symbol: string
  /** Eigener Einladungscode (Selbstwahl, solange ohne Gruppe) */
  code?: string
  gruppe: {
    id: string
    mitglieder: MitgliedSicht[]
    rolle: Rolle
    runde: number
    teil: PaTeil | null
    /** Inhalt des Schritts aus ablauf.ts (null, solange nichts läuft) */
    schritt: unknown
  } | null
  hinweis: string
}

/** Was die Lehrkraft live sieht (Kanal `partner:lehrkraft`) */
export interface PaLehrkraftSicht {
  pa: Partnerarbeit
  online: string[]
  /** Kurzname je Kennung */
  namen: Record<string, string>
  /** Ohne Gruppe (Selbstwahl oder Nachzügler) */
  unzugeteilt: string[]
  jetzt: number
}
