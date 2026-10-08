/**
 * Restzeit eines Hintergrund-Auftrags (27.09.2026).
 *
 * Bis dahin galt: Restzeit = verstrichene Zeit hochgerechnet über den Balken, erst ab einem
 * Zehntel Fortschritt. Das ging schief, wo der Balken nichts weiß – Bildaufträge ohne
 * Zeichenstrom, der Abo-Zugang ohne Strom, die ersten Minuten eines langen Laufs – und es
 * sprang, sobald ein Schritt endete. Wunsch der Lehrkraft: eine Schätzung „basierend auf
 * früheren Aufträgen in Umfang und Dauer der jeweiligen KI".
 *
 * Die App merkt sich deshalb zweierlei, lokal und je KI:
 * - je ANFRAGEART und KI (Anbieter + Modell bzw. Abo) die Dauer der letzten Anfragen –
 *   „ein Bild bei openai:gpt-image-2 dauert 45 s", „eine Gliederung bei anthropic:… 20 s";
 * - je AUFTRAGSART (Gliederung planen, Posen zeichnen …) die Dauer, den Umfang und die
 *   MISCHUNG der Anfragen (wie viele Bilder, wie viele Texte je Umfangseinheit).
 *
 * Die Schätzung eines laufenden Auftrags setzt sich daraus zusammen:
 * 1. Was die LAUFENDEN Anfragen noch brauchen: im Zeichenstrom hochgerechnet aus Tempo und
 *    erwarteter Länge, sonst aus der gemerkten Dauer dieser Anfrageart bei dieser KI.
 * 2. Was noch AUSSTEHT: die erwartete Mischung für diesen Umfang, abzüglich der schon
 *    erledigten und laufenden Anfragen, mal deren Dauer bei der jetzt eingestellten KI.
 *    Die Mischung ist vom Anbieter unabhängig, die Dauer nicht – nach einem Wechsel des
 *    Anbieters zählt also der Aufbau alter Läufe mit den Zeiten des neuen.
 * 3. Die bisherige Hochrechnung über den Balken – sie gewinnt mit dem Fortschritt an Gewicht.
 * Laufende Anfragen sind eine Untergrenze: Kürzer als das, was gerade läuft, wird es nicht.
 *
 * Ohne jeden Verlauf bleibt es bei der Hochrechnung (und vorher bei keiner Zahl). Wer länger
 * braucht als alle gemerkten Läufe, bekommt „dauert länger als sonst" statt einer erfundenen
 * Zahl. Die Zahlen sind Faustregeln aus dem Betrieb, keine Messung des Anbieters.
 */
import type { AppSettings, StructuredRequest } from '@shared/types'
import { remainingLabel, remainingSeconds } from './aiProgress'

const STORE_KEY = 'schul-apps-dauern'
/** So viele Läufe je Schlüssel fließen ein – alte Zeiten eines Anbieters verblassen */
export const HISTORY = 10

/** Eine fertige Anfrage: Dauer und (bei Text) Länge der Antwort */
export interface AnfrageProbe {
  ms: number
  chars: number
}

/** Ein fertiger Auftrag: Dauer, Umfang, KI und die Zahl der Anfragen je Art */
export interface AuftragsProbe {
  ms: number
  umfang: number
  ki: string
  mix: Record<string, number>
}

export interface DauerVerlauf {
  /** Schlüssel: `${anfrageart}@${ki}` */
  anfragen: Record<string, AnfrageProbe[]>
  /** Schlüssel: Auftragsart */
  auftraege: Record<string, AuftragsProbe[]>
}

const leer = (): DauerVerlauf => ({ anfragen: {}, auftraege: {} })

let cache: DauerVerlauf | null = null

export function leseVerlauf(): DauerVerlauf {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const v = raw ? (JSON.parse(raw) as Partial<DauerVerlauf>) : {}
    cache = { anfragen: v.anfragen ?? {}, auftraege: v.auftraege ?? {} }
  } catch {
    cache = leer()
  }
  return cache
}

function schreibeVerlauf(v: DauerVerlauf): void {
  cache = v
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(v))
  } catch {
    // Ohne lokalen Speicher gilt der Verlauf nur für diese Sitzung
  }
}

/** Für Prüfungen: Verlauf verwerfen (auch den Zwischenspeicher) */
export function vergissVerlauf(): void {
  cache = null
  try {
    localStorage.removeItem(STORE_KEY)
  } catch {
    // s. o.
  }
}

export const anfrageSchluessel = (art: string, ki: string): string => `${art}@${ki}`

/** Merkt sich eine fertige Anfrage. Abgebrochene und gescheiterte gehören nicht hinein. */
export function merkeAnfrage(art: string, ki: string, probe: AnfrageProbe): void {
  if (probe.ms < 200) return
  const v = leseVerlauf()
  const k = anfrageSchluessel(art, ki)
  schreibeVerlauf({ ...v, anfragen: { ...v.anfragen, [k]: [...(v.anfragen[k] ?? []), probe].slice(-HISTORY) } })
}

/** Merkt sich einen fertigen Auftrag mit seiner Anfragen-Mischung. Ohne Anfragen lernt niemand etwas. */
export function merkeAuftrag(art: string, probe: AuftragsProbe): void {
  if (probe.ms < 200 || !Object.values(probe.mix).some((n) => n > 0)) return
  const v = leseVerlauf()
  const eintrag = { ...probe, umfang: Math.max(1, probe.umfang) }
  schreibeVerlauf({ ...v, auftraege: { ...v.auftraege, [art]: [...(v.auftraege[art] ?? []), eintrag].slice(-HISTORY) } })
}

/**
 * Kennung der KI, die eine Anfrage bearbeitet: Anbieter und Modell, beim Abo-Zugang der
 * Abo-Weg (dort läuft ein anderes Programm mit eigenem Tempo). Eine Anfrage mit eigenem
 * Anbieter oder Modell (stärkeres Modell für Hörtexte) zählt unter diesem.
 */
export function kiKennung(ai: AppSettings['ai'], art: 'text' | 'bild', anfrage?: Pick<StructuredRequest, 'provider' | 'model'>): string {
  if (art === 'bild') {
    const p = ai.imageProvider
    if (p === 'none') return 'none'
    if (ai.imageAccess[p] === 'subscription') return `${p}:abo`
    return `${p}:${p === 'anthropic' ? 'svg' : ai.imageModels[p]}`
  }
  const p = anfrage?.provider ?? ai.textProvider
  if (anfrage?.model) return `${p}:${anfrage.model}`
  if (ai.access[p] === 'subscription') return `${p}:abo:${ai.subscriptionModels[p] || 'std'}`
  return `${p}:${ai.textModels[p]}`
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Gemerkte Dauer einer Anfrageart bei einer KI – Median als Erwartung, das Maximum als „länger als sonst"-Grenze */
export function erwarteteDauer(verlauf: DauerVerlauf, art: string, ki: string): { median: number; max: number } | null {
  const proben = verlauf.anfragen[anfrageSchluessel(art, ki)]
  if (!proben?.length) return null
  const ms = proben.map((p) => p.ms)
  return { median: median(ms), max: Math.max(...ms) }
}

/**
 * Gemerkte Dauer eines GANZEN Auftrags dieser Art (Median der letzten Läufe, ohne Wartezeit) – für Vorschauen wie
 * „9 Aufträge · etwa 12 min" (08.10.2026, „Alle Platzhalter erstellen"). null = noch kein Lauf gemerkt.
 */
export function typischeAuftragsDauer(art: string, verlauf: DauerVerlauf = leseVerlauf()): number | null {
  const proben = verlauf.auftraege[art]
  return proben?.length ? median(proben.map((p) => p.ms)) : null
}

/**
 * Geschätzte Gesamtdauer mehrerer Aufträge, die sich die KI-Plätze teilen (08.10.2026, „Alle Platzhalter erstellen"):
 * je Auftrag die gemerkte Dauer seiner Art; zusammen höchstens `plaetze` zugleich – also die Summe geteilt durch die
 * Plätze, mindestens aber der längste. `unbekannt` zählt die Aufträge, deren Art noch nie lief (gehen nicht ein).
 */
export function schaetzeGesamtdauer(
  arten: string[],
  dauer: (art: string) => number | null = (art) => typischeAuftragsDauer(art),
  plaetze = 3
): { ms: number | null; unbekannt: number } {
  const bekannt = arten.map(dauer).filter((ms): ms is number => ms !== null)
  const unbekannt = arten.length - bekannt.length
  if (!bekannt.length) return { ms: null, unbekannt }
  const summe = bekannt.reduce((a, b) => a + b, 0)
  return { ms: Math.max(Math.max(...bekannt), summe / Math.max(1, Math.min(plaetze, bekannt.length))), unbekannt }
}

/** Dauer grob in Worten: „etwa 40 Sek.", „etwa 3 min", „etwa 1 h 10 min" */
export function dauerWorte(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 60) return `etwa ${s} Sek.`
  const min = Math.round(s / 60)
  if (min < 60) return `etwa ${min} min`
  return `etwa ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`
}

/**
 * Erwartete Zahl von Anfragen je Art für einen Auftrag dieser Art und dieses Umfangs –
 * aus der Mischung früherer Läufe, je Umfangseinheit (Median), mal jetzigem Umfang.
 * Vom Anbieter unabhängig: Wie viele Bilder ein Blatt braucht, ändert kein Modellwechsel.
 */
export function erwarteterMix(verlauf: DauerVerlauf, art: string, umfang: number): Record<string, number> | null {
  const proben = verlauf.auftraege[art]
  if (!proben?.length) return null
  const arten = new Set(proben.flatMap((p) => Object.keys(p.mix)))
  const mix: Record<string, number> = {}
  for (const a of arten) mix[a] = median(proben.map((p) => (p.mix[a] ?? 0) / Math.max(1, p.umfang))) * Math.max(1, umfang)
  return mix
}

/** Eine Anfrage, die gerade läuft */
export interface LaufendeAnfrage {
  art: string
  ki: string
  elapsedMs: number
  /** Zeichenstrom: eingetroffen und erwartet (0, wenn es keinen Strom gibt) */
  chars: number
  expectedChars: number
}

export interface RestzeitLage {
  art: string
  umfang: number
  elapsedMs: number
  /** Anteil des Balkens, 0 bis 1 */
  ratio: number
  /** Fertige Anfragen dieses Auftrags je Art */
  erledigt: Record<string, number>
  laufend: LaufendeAnfrage[]
  /** Kennung der KI, die eine Anfrageart jetzt bearbeiten würde */
  ki: (art: string) => string
}

export interface Restzeit {
  /** null = keine belastbare Zahl */
  sekunden: number | null
  /** Länger als alle gemerkten Läufe – die Zahl wäre erfunden */
  laenger: boolean
}

/** Rest einer laufenden Anfrage in ms – null, wenn nichts darüber bekannt ist */
export function restEinerAnfrage(a: LaufendeAnfrage, verlauf: DauerVerlauf): { ms: number; laenger: boolean } | null {
  // Im Strom: Tempo mal fehlende Zeichen – ab einem Zehntel, vorher ist das Tempo Zufall
  if (a.chars > 0 && a.expectedChars > 0 && a.chars / a.expectedChars >= 0.1 && a.elapsedMs >= 2000) {
    return { ms: Math.max(0, (a.expectedChars - a.chars) * (a.elapsedMs / a.chars)), laenger: false }
  }
  const d = erwarteteDauer(verlauf, a.art, a.ki)
  if (!d) return null
  if (a.elapsedMs <= d.median) return { ms: d.median - a.elapsedMs, laenger: false }
  // Über dem Mittel: bis zum längsten gemerkten Lauf (mit etwas Luft), danach ehrlich „länger als sonst"
  const grenze = d.max * 1.15
  if (a.elapsedMs <= grenze) return { ms: grenze - a.elapsedMs, laenger: false }
  return { ms: 0, laenger: true }
}

export function schaetzeRest(lage: RestzeitLage, verlauf: DauerVerlauf = leseVerlauf()): Restzeit {
  // 1) Laufende Anfragen
  let restLaufend = 0
  let laufendBekannt = false
  let laufendUnbekannt = false
  let laenger = false
  const laufendJeArt: Record<string, number> = {}
  for (const a of lage.laufend) {
    laufendJeArt[a.art] = (laufendJeArt[a.art] ?? 0) + 1
    const r = restEinerAnfrage(a, verlauf)
    if (!r) {
      laufendUnbekannt = true
      continue
    }
    laufendBekannt = true
    restLaufend += r.ms
    if (r.laenger) laenger = true
  }

  // 2) Ausstehende Anfragen laut Mischung früherer Aufträge, mit den Zeiten der jetzigen KI
  let histRest: number | null = null
  const mix = erwarteterMix(verlauf, lage.art, lage.umfang)
  if (mix && !laufendUnbekannt) {
    let offenSumme = 0
    let vollstaendig = true
    for (const [art, erwartet] of Object.entries(mix)) {
      const offen = erwartet - (lage.erledigt[art] ?? 0) - (laufendJeArt[art] ?? 0)
      if (offen <= 0) continue
      const d = erwarteteDauer(verlauf, art, lage.ki(art))
      if (!d) {
        vollstaendig = false
        break
      }
      offenSumme += offen * d.median
    }
    if (vollstaendig) histRest = offenSumme + restLaufend
  }

  // 3) Hochrechnung über den Balken (bisheriger Weg) – gewinnt mit dem Fortschritt an Gewicht
  const balkenSek = remainingSeconds(lage.ratio, lage.elapsedMs)
  const balkenRest = balkenSek === null ? null : balkenSek * 1000

  let rest: number | null
  if (histRest !== null && balkenRest !== null) {
    const w = Math.min(1, Math.max(0, lage.ratio))
    rest = (1 - w) * histRest + w * balkenRest
  } else if (histRest !== null) rest = histRest
  else if (balkenRest !== null) rest = balkenRest
  else rest = laufendBekannt ? restLaufend : null

  if (rest === null) return { sekunden: null, laenger: false }
  // Kürzer als das, was gerade läuft, wird es nicht
  if (laufendBekannt) rest = Math.max(rest, restLaufend)
  const sekunden = Math.max(0, Math.round(rest / 1000))
  // Erst wenn nichts Zählbares mehr übrig ist, gilt „länger als sonst"
  return { sekunden, laenger: laenger && sekunden <= 3 }
}

/**
 * Anzeige aus dem gemerkten Zielzeitpunkt des Auftrags: Der Zähler läuft zwischen zwei
 * Schätzungen von selbst weiter, statt auf dem letzten Wert zu stehen.
 */
export function restAnzeige(a: { restBis?: number; restLage?: 'laenger' }, jetzt: number): string {
  if (a.restLage === 'laenger') return 'dauert länger als sonst'
  if (a.restBis === undefined) return ''
  const s = Math.round((a.restBis - jetzt) / 1000)
  if (s <= 3) return 'gleich fertig'
  return remainingLabel(s)
}

/**
 * Neuer Zielzeitpunkt aus der letzten Schätzung: die erste Zahl gilt sofort, danach nähert
 * sich der Zähler zu 40 % je Schätzung dem neuen Ziel – so springt er nicht bei jedem
 * Zeichenpaket, folgt aber einer echten Änderung innerhalb weniger Meldungen.
 */
export function glaetteZiel(bisher: number | undefined, ziel: number): number {
  if (bisher === undefined) return ziel
  return Math.round(bisher + 0.4 * (ziel - bisher))
}

/** Höchstens so oft (ms) folgt die Anzeige kleinen Änderungen der Schätzung */
export const REST_TAKT_MS = 10_000
/** Ab dieser Abweichung (Anteil der bisher angezeigten Restzeit) folgt sie sofort */
export const REST_SCHWELLE = 0.15

/**
 * Ruhige Restzeit (08.10.2026, Befund der Lehrkraft: „noch etwa 2 Min." sprang bei jedem Zeichenpaket hin und her): Eine
 * neue Schätzung ändert das angezeigte Ziel nur, wenn sie um mehr als 15 % von der angezeigten Restzeit abweicht oder
 * die letzte Änderung mindestens 10 Sekunden her ist – dann geglättet (`glaetteZiel`). Dazwischen läuft der Zähler
 * einfach weiter. Liefert das neue Ziel und den Zeitpunkt seiner letzten Änderung.
 */
export function ruhigesZiel(
  bisher: { ziel: number; seit: number } | undefined,
  ziel: number,
  nun: number
): { ziel: number; seit: number } {
  if (!bisher) return { ziel, seit: nun }
  const restAlt = Math.max(1000, bisher.ziel - nun)
  const restNeu = ziel - nun
  const deutlich = Math.abs(restNeu - restAlt) > REST_SCHWELLE * restAlt
  if (!deutlich && nun - bisher.seit < REST_TAKT_MS) return bisher
  return { ziel: glaetteZiel(bisher.ziel, ziel), seit: nun }
}
