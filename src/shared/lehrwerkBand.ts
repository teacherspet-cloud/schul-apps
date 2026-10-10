/**
 * Lehrwerk-Band einer Klasse erkennen (09.10.2026, abgestimmt mit der Lehrkraft).
 *
 * Bisher galt „automatisch" die höchste Unit aus den Vokabeln der Klasse – das verschob sich, sobald Vokabeln aus einem
 * älteren Band zur Wiederholung dazukamen (der Kurs übernimmt dann dessen Herkunft), und nannte eine Unit („Unit 3"),
 * die niemand gewählt hatte. Jetzt:
 *  - Die REIHE (z. B. „Green Line") kommt aus den Vokabeln der Klasse (irgendein Band), sonst aus den üblichen Lehrwerken
 *    der Lehrkraft in dieser Sprache.
 *  - Der BAND kommt aus Jahrgang, Schulform und Bundesland: Gymnasium G9 (z. B. Niedersachsen) Klasse 5 → Band 1 …
 *    Klasse 10 → Band 6, Klasse 11 → Transition, danach Oberstufe; G8 eine Stufe früher (Klasse 10 → Transition).
 *    Andere Schulformen: Klasse 5–10 → Band 1–6. Ohne Jahrgang (z. B. Gruppe per QR-Code): der höchste Band aus den
 *    Vokabeln – Wiederholung aus älteren Bänden verschiebt ihn nicht.
 *  - KEINE Unit: Als bekannt gilt „Frühere Bände + Freigegebenes" – alle früheren Bände ganz (ohne die optionalen
 *    Trailer) und vom aktuellen Band, was der Klasse schon freigegeben ist (Vokabel-Abschnitte und Grammatik).
 * Von Hand gesetzter Stand („Meine Klassen" → Lehrwerk) bleibt vorrangig (server/grammatik.ts).
 *
 * G8/G9 je Land: src/shared/schulformen.ts (Gymnasium bis Klasse 13 = G9). Länder mit G9 im Aufbau zählen erst ab dem
 * ersten G9-Jahrgang als G9 (Baden-Württemberg: Klasse 5 im Schuljahr 2024/25 oder später – „ab 2025/26 für Klasse 5
 * und 6"; Saarland: ab 2023/24), ältere Jahrgänge als G8.
 */
import { ABSCHNITT_FOLGE, istOptional, LEHRWERK_GRAMMATIK } from '../renderer/src/shared/lehrwerkGrammatik'
import { schulformVon } from './schulformen'
import { schuljahrVon } from './schulkalender'

export interface SchulOrt {
  land?: string
  schulform?: string
}

/** Erster G9-Jahrgang (Schuljahr, in dem er in Klasse 5 war) in Ländern mit G9 im Aufbau */
const G9_AB: Record<string, number> = { BW: 2024, SL: 2023 }

/** Beginn des laufenden Schuljahres (Schulkalender, sonst ab August) */
export const schuljahrBeginn = (heute: Date): number => schuljahrVon(heute)

/** Lernt dieser Jahrgang am Gymnasium nach G9? Ohne Land: G9 (die Lehrwerke im Programm sind G9-Ausgaben). */
export function istG9(land: string | undefined, jahrgang: number, heute = new Date()): boolean {
  if (!land) return true
  const gym = schulformVon(land, 'gymnasium')
  if (!gym || gym.bis < 13) return false
  const ab = G9_AB[land]
  if (ab === undefined) return true
  // Jahr, in dem dieser Jahrgang in Klasse 5 war
  return schuljahrBeginn(heute) - (jahrgang - 5) >= ab
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** „Green Line 6" → „Green Line"; „Green Line Transition" → „Green Line" */
export function reiheAus(band: string): string {
  return band
    .trim()
    .replace(/\s+(?:\d+|transition|oberstufe)$/i, '')
    .trim()
}

/** Rang eines Bands in seiner Reihe: Bandnummer, Transition 50, Oberstufe 60, sonst 0 */
export function bandRang(band: string): number {
  const t = band.trim()
  const n = /(\d+)\s*$/.exec(t)
  if (n) return Number(n[1])
  if (/transition\s*$/i.test(t)) return 50
  if (/oberstufe\s*$/i.test(t)) return 60
  return 0
}

/** Band einer Reihe für Jahrgang, Schulform und Land („Green Line", 10, Gymnasium NI → „Green Line 6") */
export function bandFuerKlasse(reihe: string, jahrgang: number, ort: SchulOrt = {}, heute = new Date()): string | null {
  if (!reihe || !Number.isFinite(jahrgang) || jahrgang < 5) return null
  const gymnasium = !ort.schulform || ort.schulform === 'gymnasium'
  const g8 = gymnasium && !istG9(ort.land, jahrgang, heute)
  const letzter = g8 ? 5 : 6
  const stufe = jahrgang - 4
  if (stufe <= letzter) return `${reihe} ${stufe}`
  if (!gymnasium && jahrgang <= 10) return `${reihe} 6`
  return stufe === letzter + 1 ? `${reihe} Transition` : `${reihe} Oberstufe`
}

export interface Erkennung {
  /** Band („Green Line 6") – ohne Unit */
  buch: string
  /** Woher: Jahrgang der Klasse oder (ohne Jahrgang) der höchste Band aus den Vokabeln */
  grund: 'jahrgang' | 'vokabeln'
}

/**
 * Band einer Klasse erkennen. `baende` = Bandnamen aus den Vokabeln der Klasse (beliebige Reihenfolge, auch ältere zur
 * Wiederholung), `ueblich` = Bandnamen der übrigen Kurse der Lehrkraft in dieser Sprache (nur für die Reihe).
 */
export function bandErkennen(
  e: { jahrgang: number | null; ort?: SchulOrt; baende: string[]; ueblich?: string[] },
  heute = new Date()
): Erkennung | null {
  const mitRang = (l: string[]): string[] => l.filter((b) => b && bandRang(b) > 0)
  const eigene = mitRang(e.baende)
  const hoechster = [...eigene].sort((a, b) => bandRang(b) - bandRang(a))[0]
  const reihe = hoechster ? reiheAus(hoechster) : reiheAus(mitRang(e.ueblich ?? [])[0] ?? '')
  if (!reihe) return null
  if (e.jahrgang) {
    const buch = bandFuerKlasse(reihe, e.jahrgang, e.ort ?? {}, heute)
    if (buch) return { buch, grund: 'jahrgang' }
  }
  return hoechster ? { buch: hoechster, grund: 'vokabeln' } : null
}

/** Freigegebenes aus dem Lehrwerk: Band, Unit und (falls bekannt) die Abschnitte; leer = die ganze Unit */
export interface FreigegebeneUnit {
  buch: string
  unit: string
  abschnitte: string[]
}

/** Band der Grammatikliste („green-line-1-nds" / „Green Line 1" → „Green Line 1") */
function grammatikBand(name: string): string | undefined {
  const n = norm(name)
  if (!n) return undefined
  return Object.keys(LEHRWERK_GRAMMATIK)
    .filter((b) => n.startsWith(norm(b)))
    .sort((a, b) => b.length - a.length)[0]
}

/**
 * Bekannte Grammatik nach „Frühere Bände + Freigegebenes" (Katalogkennungen). `buch` = erkannter Band; liegt er hinter
 * allen Bänden der Grammatikliste (Transition, Oberstufe), gelten alle Bände als früher. Eine freigegebene Unit bringt
 * ihre Stationen bis zum letzten freigegebenen Abschnitt mit (ohne Abschnitte: die ganze Unit).
 */
export function bekanntNachBand(buch: string, freigegeben: FreigegebeneUnit[] = []): string[] {
  const baende = Object.keys(LEHRWERK_GRAMMATIK)
  const reihe = norm(reiheAus(buch))
  const imKatalog = baende.some((b) => norm(reiheAus(b)) === reihe)
  let i = -1
  const band = grammatikBand(buch)
  if (band) i = baende.indexOf(band)
  else if (imKatalog) i = baende.filter((b) => norm(reiheAus(b)) === reihe && bandRang(b) < bandRang(buch)).length
  const aus = new Set<string>()
  const alle = (b: string, k: string): string[] => Object.values(LEHRWERK_GRAMMATIK[b]?.[k] ?? {}).flatMap((l) => l.flatMap((p) => p.t))
  for (const b of baende.slice(0, Math.max(0, i))) for (const k of Object.keys(LEHRWERK_GRAMMATIK[b])) if (!istOptional(k)) alle(b, k).forEach((t) => aus.add(t))
  const frueher = new Set(baende.slice(0, Math.max(0, i)))
  for (const f of freigegeben) {
    const b = grammatikBand(f.buch)
    const kapitel = b ? LEHRWERK_GRAMMATIK[b]?.[f.unit] : undefined
    if (!b || !kapitel || frueher.has(b)) continue
    const bis = Math.max(-1, ...f.abschnitte.map((a) => ABSCHNITT_FOLGE.indexOf(a.trim())))
    for (const [station, punkte] of Object.entries(kapitel)) {
      const s = ABSCHNITT_FOLGE.indexOf(station)
      const dabei = !f.abschnitte.length || station === '' || f.abschnitte.some((a) => a.trim() === station) || (s >= 0 && s <= bis)
      if (dabei) for (const p of punkte) p.t.forEach((t) => aus.add(t))
    }
  }
  return [...aus]
}

/** Abschnittsname eines Kursteils in Lehrwerk-Abschnitte zerlegen („Check-in, Station 1" → zwei) */
export const abschnitteAusName = (name: string): string[] =>
  name
    .split(/,\s*|\s·\s/)
    .map((x) => x.trim())
    .filter(Boolean)

/**
 * Stelle einer Grammatik im Lehrwerk aus dem Katalog (09.10.2026, Gliederung der Kurs-Grammatik nach Band und Unit):
 * das erste Kapitel der Grammatikliste (Buchreihenfolge), das eine der Teilformen bzw. eines der Themen einführt
 * (Wiederholungen zählen nicht; Trailer nur, wenn kein anderes Kapitel passt). Nichts gefunden → null (dann gliedert die Kursseite nach Schuljahr).
 */
export function stelleImLehrwerk(themen: string[], teilformen: string[] = []): { buch: string; unit: string } | null {
  const teile = new Set(teilformen)
  const ganze = new Set(themen.filter((t) => !t.includes('/')))
  if (!teile.size && !ganze.size) return null
  // Erst ohne die optionalen Trailer (09.10.2026, abgestimmt), ein Trailer nur, wenn das Thema sonst nirgends vorkommt
  for (const mitTrailer of [false, true])
    for (const [buch, kapitel] of Object.entries(LEHRWERK_GRAMMATIK))
      for (const [unit, stationen] of Object.entries(kapitel)) {
        if (istOptional(unit) !== mitTrailer) continue
        for (const punkte of Object.values(stationen))
          for (const p of punkte) if (!p.w && p.t.some((t) => teile.has(t) || ganze.has(t.split('/')[0]))) return { buch, unit }
      }
  return null
}
