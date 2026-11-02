/**
 * Klassenspiele (02.11.2026, Plan „wise-sauteeing-bubble", abgestimmt mit der Lehrkraft): Die Lehrkraft startet ein
 * Vokabel-/Grammatikspiel für die ganze Lerngruppe. Jede:r antwortet am eigenen Gerät auf eigene Fragen (eigenes Niveau),
 * der Beamer zeigt nur den gemeinsamen Stand (Berg, Boss, Bahnen, Karte, Teams) – nie Fragen oder Lösungen.
 *
 * Recherche (im Plan belegt): Wettbewerb in Lernspielen wirkt (Meta-Analyse 2020: g ≈ 0,39, auch für Sprachen),
 * Wettbewerb + Kooperation am stärksten (Sailer & Homner 2020); öffentliche Ranglisten demotivieren Schwächere →
 * Teamwertung, Verbesserungspunkte (Slavin, STAD) und Turnier-Tische unter Gleichstarken (TGT); adaptive Schwierigkeit
 * per Elo (Pelánek 2016; Math Garden, Klinkenberg u. a. 2011, Ziel ≈ 75 % Erfolg).
 */
import type { Schwierigkeit } from '../mehrspieler/typen'

export type KlassenspielId = 'expedition' | 'boss' | 'rennen' | 'puzzle' | 'rekord' | 'gebiet' | 'turnier' | 'wette'

/** koop = alle gegen das Spiel; team = Teams gegeneinander; einzeln = jede:r für sich (mit Top 3) */
export type KlassenArt = 'koop' | 'team' | 'einzeln'

export interface KlassenspielInfo {
  id: KlassenspielId
  name: string
  art: KlassenArt
  /** Teams wählbar (2–6); bei „Team-Puzzle" feste Teamgröße 3–4 */
  teams: 'keine' | 'waehlbar' | 'klein' | 'tische'
  kurz: string
  /** Erklärung für Lehrkraft und Lernende (eine Zeile) */
  regel: string
  /** Stufe B der Umsetzung (noch nicht spielbar) */
  spaeter?: boolean
  /** Mindestzahl Lernende */
  min: number
}

export const KLASSENSPIELE: KlassenspielInfo[] = [
  {
    id: 'expedition',
    name: 'Klassen-Expedition',
    art: 'koop',
    teams: 'keine',
    kurz: 'Die Klasse steigt gemeinsam auf den Gipfel.',
    regel: 'Jede richtige Antwort bringt die Klasse höher. Ein Lager ist erst geschafft, wenn genug richtig ist UND die Klasse sorgfältig bleibt.',
    min: 1
  },
  {
    id: 'boss',
    name: 'Boss-Kampf',
    art: 'koop',
    teams: 'keine',
    kurz: 'Alle gemeinsam gegen einen Boss.',
    regel: 'Richtige Antworten schaden dem Boss, schwerere mehr. Was falsch war, kommt als Angriff zurück – bis es sitzt.',
    min: 1
  },
  {
    id: 'rennen',
    name: 'Tauziehen & Rennen',
    art: 'team',
    teams: 'waehlbar',
    kurz: '2 Teams ziehen am Seil, 3–6 Teams laufen um die Wette.',
    regel: 'Jede richtige Antwort bringt dein Team voran. Gezählt wird je Teammitglied – kleine Teams sind nicht im Nachteil.',
    min: 2
  },
  {
    id: 'puzzle',
    name: 'Team-Puzzle',
    art: 'koop',
    teams: 'klein',
    kurz: 'Jedes Gerät hat andere Antwortkarten – nur eins die richtige.',
    regel: 'Setzt euch zusammen! Ihr seht dieselbe Frage, aber verschiedene Karten. Redet miteinander – ein Fehler wirft das Team zurück.',
    min: 2
  },
  {
    id: 'rekord',
    name: 'Klasse gegen den Rekord',
    art: 'koop',
    teams: 'keine',
    kurz: 'Kurze Runde gegen den eigenen Klassenrekord.',
    regel: 'Die Klasse spielt gegen ihren letzten Bestwert: richtige Antworten mal Trefferquote. Sorgfalt zählt so viel wie Tempo.',
    min: 1
  },
  {
    id: 'gebiet',
    name: 'Gebietseroberung',
    art: 'team',
    teams: 'waehlbar',
    kurz: 'Teams erobern Felder – du wählst, wie schwer.',
    regel: 'Wähle ★, ★★ oder ★★★. Richtig → dein Team holt ein Feld mit so vielen Sternen. ★★★ darf Felder der anderen nehmen.',
    min: 2
  },
  {
    id: 'turnier',
    name: 'Turnier-Tische',
    art: 'team',
    teams: 'tische',
    kurz: 'Du spielst gegen Gleichstarke – für dein Team.',
    regel: 'An jedem Tisch spielen 2–3 gegeneinander. Die Tischplätze bringen Punkte für das Stammteam. Nach jeder Runde wird neu gesetzt.',
    min: 4
  },
  {
    id: 'wette',
    name: 'Wett-Quiz',
    art: 'einzeln',
    teams: 'keine',
    kurz: 'Setze 1–3 Punkte darauf, wie sicher du bist.',
    regel: 'Vor jeder Frage setzt du 1, 2 oder 3 Punkte. Richtig: Einsatz dazu. Falsch: Einsatz weg. Am Ende siehst du, wie gut du dich einschätzt.',
    min: 1
  }
]

export const klassenspielInfo = (id: string): KlassenspielInfo | undefined => KLASSENSPIELE.find((s) => s.id === id)
export const istKlassenspielId = (x: unknown): x is KlassenspielId => typeof x === 'string' && KLASSENSPIELE.some((s) => s.id === x)

/** Woher die Inhalte kommen (abgestimmt: alle vier wählbar, kombinierbar) */
export type InhaltQuelle = 'auswahl' | 'behandelt'
export type SchwierigkeitArt = 'adaptiv' | 'fest' | 'level'

export interface KlassenEinstellungen {
  spiel: KlassenspielId
  /** Gezielte Auswahl (Schlüssel wie bei „Test planen") oder alles Behandelte */
  quelle: InhaltQuelle
  /** Schlüssel der Auswahl: Vokabelabschnitte (teilSchluessel) und Grammatik „gram:<id>" */
  keys: string[]
  /** Vokabeln, Grammatik oder beides */
  vok: boolean
  gram: boolean
  /** Schwächen der Klasse zuerst */
  schwaechen: boolean
  schwierigkeit: SchwierigkeitArt
  /** Nur bei „fest" */
  feste: Exclude<Schwierigkeit, 'unmoeglich'>
  /** Spieldauer in Minuten (3–30) */
  dauer: number
  /** Zahl der Teams (2–6) bei Teamspielen */
  teams: number
  /** Top 3 am Ende zeigen (abgestimmt: Team + Top 3, nie ein letzter Platz) */
  top3: boolean
}

export const STANDARD_EINSTELLUNGEN: Omit<KlassenEinstellungen, 'spiel'> = {
  quelle: 'behandelt',
  keys: [],
  vok: true,
  gram: true,
  schwaechen: false,
  schwierigkeit: 'adaptiv',
  feste: 'mittel',
  dauer: 10,
  teams: 2,
  top3: true
}

const zahl = (x: unknown, min: number, max: number, std: number): number => {
  const n = Math.round(Number(x))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : std
}

/** Einstellungen vom Gerät bereinigen */
export function einstellungenBereinigt(roh: Record<string, unknown>): KlassenEinstellungen | null {
  if (!istKlassenspielId(roh.spiel)) return null
  const s = STANDARD_EINSTELLUNGEN
  const vok = roh.vok !== false
  const gram = roh.gram !== false
  return {
    spiel: roh.spiel,
    quelle: roh.quelle === 'auswahl' ? 'auswahl' : 'behandelt',
    keys: Array.isArray(roh.keys) ? [...new Set(roh.keys.map((k) => String(k).slice(0, 200)))].slice(0, 400) : [],
    vok: vok || !gram,
    gram,
    schwaechen: roh.schwaechen === true,
    schwierigkeit: roh.schwierigkeit === 'fest' || roh.schwierigkeit === 'level' ? roh.schwierigkeit : 'adaptiv',
    feste: roh.feste === 'leicht' || roh.feste === 'schwer' ? roh.feste : 'mittel',
    dauer: zahl(roh.dauer, 3, 30, s.dauer),
    teams: zahl(roh.teams, 2, 6, s.teams),
    top3: roh.top3 !== false
  }
}

/** Code einer Klassenrunde: sechs Ziffern wie die Spielrunden der Lernenden (gemeinsamer Vorrat in codes.ts) */
export const istKlassenCode = (s: string): boolean => /^\d{6}$/.test(s)
